/**
 * Importar.gs — Importación de usuarios desde las hojas actuales (sección 10 de CLAUDE.md).
 * Solo importa usuarios (ID, nombre, teléfono) y, si se indica, su inscripción al grupo.
 * NO importa asistencias.
 */

function menuImportar() {
  ejecutarMenu_(function (ui) {
    const r1 = ui.prompt('Importar usuarios (1 de 4)',
      'Pega el enlace o el ID del documento de Google Sheets de donde quieres importar.\n' +
      '(Si es un Excel, ábrelo antes en Drive y guárdalo como Hoja de cálculo de Google.)', ui.ButtonSet.OK_CANCEL);
    if (r1.getSelectedButton() !== ui.Button.OK) return;
    const idArchivo = idDeEnlace_(r1.getResponseText());
    const origen = abrirOrigen_(idArchivo);
    const pestanas = origen.getSheets().map(function (h) { return h.getName(); });

    const r2 = ui.prompt('Importar usuarios (2 de 4)',
      'Escribe el nombre de la pestaña. Pestañas del documento:\n\n' + pestanas.join('\n'), ui.ButtonSet.OK_CANCEL);
    if (r2.getSelectedButton() !== ui.Button.OK) return;

    const grupos = leerTabla_(HOJAS.GRUPOS).map(function (g) { return g.grupo_id + '  (' + (g.nombre || '') + ')'; });
    const r3 = ui.prompt('Importar usuarios (3 de 4)',
      'Escribe el ID del grupo donde inscribirlos, o déjalo vacío para crear solo los usuarios sin inscribirlos.\n' +
      'Grupos existentes:\n\n' + (grupos.join('\n') || '(ninguno: créalo antes en la hoja Grupos)'), ui.ButtonSet.OK_CANCEL);
    if (r3.getSelectedButton() !== ui.Button.OK) return;
    const grupoId = r3.getResponseText().trim();

    let fechaAlta = '';
    if (grupoId) {
      const r4 = ui.prompt('Importar usuarios (4 de 4)',
        'Fecha de alta en el grupo (aaaa-mm-dd). Déjala vacía para usar el inicio de curso de la hoja Config.', ui.ButtonSet.OK_CANCEL);
      if (r4.getSelectedButton() !== ui.Button.OK) return;
      fechaAlta = r4.getResponseText().trim();
    }

    const res = importarUsuariosDesdeHoja(idArchivo, r2.getResponseText().trim(), grupoId, fechaAlta);
    ui.alert('Importación terminada', resumenImportacion_(res), ui.ButtonSet.OK);
  });
}

function idDeEnlace_(texto) {
  const t = String(texto || '').trim();
  const m = t.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : t;
}

function abrirOrigen_(idArchivo) {
  if (!idArchivo) throw errorApp_('No has indicado ningún documento.');
  try {
    return SpreadsheetApp.openById(idArchivo);
  } catch (e) {
    throw errorApp_('No se puede abrir ese documento. Comprueba el enlace, que tengas acceso y que sea una hoja de cálculo de Google (no un Excel).');
  }
}

/** Cabecera en mayúsculas y sin tildes, para comparar. */
function cabeceraNormalizada_(valor) {
  return sinTildes_(celdaATexto_(valor)).replace(/\s+/g, ' ').trim();
}

function buscarColumna_(fila, nombres) {
  for (let i = 0; i < fila.length; i++) {
    if (nombres.indexOf(cabeceraNormalizada_(fila[i])) >= 0) return i;
  }
  return -1;
}

/**
 * Importa usuarios de una pestaña.
 * grupo_id vacío: solo crea usuarios. fechaAlta vacía: inicio de curso.
 */
function importarUsuariosDesdeHoja(idArchivo, nombreHoja, grupo_id, fechaAlta) {
  soloAdmin_();
  const origen = abrirOrigen_(idDeEnlace_(idArchivo));
  const hoja = origen.getSheetByName(nombreHoja);
  if (!hoja) throw errorApp_('No existe la pestaña «' + nombreHoja + '» en ese documento.');

  const grupoId = String(grupo_id || '').trim();
  let alta = String(fechaAlta || '').trim();
  if (grupoId) {
    if (!grupoPorId_(grupoId)) throw errorApp_('El grupo «' + grupoId + '» no existe. Créalo antes en la hoja Grupos.');
    if (!alta) alta = config_().inicio;
    comprobarFecha_(alta, 'de alta');
  }

  // 1. Localizar la cabecera.
  const valores = hoja.getDataRange().getValues();
  let filaCab = -1, colId = -1, colNombre = -1, colTel = -1;
  for (let r = 0; r < valores.length && filaCab < 0; r++) {
    const ci = buscarColumna_(valores[r], IMPORTAR_CABECERA_ID);
    const cn = buscarColumna_(valores[r], IMPORTAR_CABECERA_NOMBRE);
    if (ci >= 0 && cn >= 0) {
      filaCab = r; colId = ci; colNombre = cn;
      colTel = buscarColumna_(valores[r], IMPORTAR_CABECERA_TELEFONO);
    }
  }
  if (filaCab < 0) throw errorApp_('No se encuentra la fila de cabecera con las columnas «ID» y «USUARIO» (o «NOMBRE»).');

  // 2. Leer las filas hasta que ID y nombre queden vacíos.
  const avisos = [];
  const leidos = {};
  const orden = [];
  for (let r = filaCab + 1; r < valores.length; r++) {
    const id = normalizarId_(valores[r][colId]);
    const nombre = normalizarNombre_(valores[r][colNombre]);
    if (!id && !nombre) break;
    if (!id) { avisos.push('Fila ' + (r + 1) + ': «' + nombre + '» no tiene ID; no se ha importado.'); continue; }
    if (!nombre) { avisos.push('Fila ' + (r + 1) + ': el ID ' + id + ' no tiene nombre; no se ha importado.'); continue; }
    const telefono = colTel >= 0 ? normalizarTelefono_(valores[r][colTel]) : '';
    if (leidos[id]) {
      if (leidos[id].nombre !== nombre) avisos.push('Fila ' + (r + 1) + ': el ID ' + id + ' aparece con otro nombre («' + nombre + '»); se usa el primero.');
      if (!leidos[id].telefono && telefono) leidos[id].telefono = telefono;
      continue;
    }
    leidos[id] = { usuario_id: id, nombre: nombre, telefono: telefono };
    orden.push(id);
  }

  // 3. Escribir en bloque.
  return conBloqueo_(function () {
    const existentes = usuariosPorId_();
    const nuevosUsuarios = [];
    const telefonosAnadidos = [];
    const nuevasInscripciones = [];
    let yaExistian = 0, yaInscritos = 0;

    orden.forEach(function (id) {
      const d = leidos[id];
      const u = existentes[id];
      if (!u) {
        nuevosUsuarios.push({ usuario_id: id, nombre: d.nombre, telefono: d.telefono, activo: SI });
      } else {
        yaExistian++;
        if (u.nombre !== d.nombre) avisos.push('El ID ' + id + ' ya existe como «' + u.nombre + '» y en el documento pone «' + d.nombre + '». No se ha cambiado.');
        if (!u.telefono && d.telefono) { u.telefono = d.telefono; telefonosAnadidos.push(u); }
      }
      if (grupoId) {
        if (haySolape_(id, grupoId, alta, null)) yaInscritos++;
        else nuevasInscripciones.push({
          inscripcion_id: nuevoId_(), usuario_id: id, grupo_id: grupoId,
          fecha_alta: alta, fecha_baja: '', motivo_baja: ''
        });
      }
    });

    anadirFilas_(HOJAS.USUARIOS, nuevosUsuarios);
    actualizarFilas_(HOJAS.USUARIOS, telefonosAnadidos);
    anadirFilas_(HOJAS.INSCRIPCIONES, nuevasInscripciones);

    return {
      leidos: orden.length,
      creados: nuevosUsuarios.length,
      existentes: yaExistian,
      telefonosAnadidos: telefonosAnadidos.length,
      inscripciones: nuevasInscripciones.length,
      yaInscritos: yaInscritos,
      grupo_id: grupoId,
      avisos: avisos
    };
  });
}

function resumenImportacion_(r) {
  const lineas = [
    'Usuarios leídos: ' + r.leidos,
    'Usuarios nuevos creados: ' + r.creados,
    'Usuarios que ya existían: ' + r.existentes,
    'Teléfonos añadidos a usuarios que no tenían: ' + r.telefonosAnadidos
  ];
  if (r.grupo_id) {
    lineas.push('Inscripciones creadas en «' + r.grupo_id + '»: ' + r.inscripciones);
    lineas.push('Ya estaban inscritos: ' + r.yaInscritos);
  }
  if (r.avisos.length) {
    lineas.push('', 'Avisos (' + r.avisos.length + '):');
    lineas.push.apply(lineas, r.avisos.slice(0, 25));
    if (r.avisos.length > 25) lineas.push('… y ' + (r.avisos.length - 25) + ' más.');
  }
  return lineas.join('\n');
}
