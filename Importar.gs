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
  const lectura = nuevaLectura_();
  for (let r = filaCab + 1; r < valores.length; r++) {
    const id = normalizarId_(valores[r][colId]);
    const nombre = normalizarNombre_(valores[r][colNombre]);
    if (!id && !nombre) break;
    const telefono = colTel >= 0 ? normalizarTelefono_(valores[r][colTel]) : '';
    anotarLeido_(lectura, 'Fila ' + (r + 1), id, nombre, telefono);
  }

  // 3. Escribir en bloque.
  return guardarImportacion_(lectura, grupoId, alta);
}

/** Usuarios leídos de un documento, sin repetir ID, en el orden en que aparecen. */
function nuevaLectura_() {
  return { leidos: {}, orden: [], avisos: [] };
}

/** Anota un usuario leído. Si el ID se repite, se queda el primero. «donde» sirve para los avisos (ej. «Fila 12»). */
function anotarLeido_(lectura, donde, id, nombre, telefono) {
  const avisos = lectura.avisos;
  if (!id) { avisos.push(donde + ': «' + nombre + '» no tiene ID; no se ha importado.'); return; }
  if (!nombre) { avisos.push(donde + ': el ID ' + id + ' no tiene nombre; no se ha importado.'); return; }
  const previo = lectura.leidos[id];
  if (previo) {
    if (previo.nombre !== nombre) avisos.push(donde + ': el ID ' + id + ' aparece con otro nombre («' + nombre + '»); se usa el primero.');
    if (!previo.telefono && telefono) previo.telefono = telefono;
    return;
  }
  lectura.leidos[id] = { usuario_id: id, nombre: nombre, telefono: telefono };
  lectura.orden.push(id);
}

/**
 * Crea los usuarios que no existen, añade el teléfono a los que no tenían y, si hay grupo, los inscribe.
 * Nunca sobrescribe el nombre de un usuario que ya existe: lo anota en los avisos.
 * Si un usuario nuevo tiene un nombre parecido a otro con distinto ID, se crea igualmente y se avisa.
 */
function guardarImportacion_(lectura, grupoId, alta) {
  const leidos = lectura.leidos;
  const avisos = lectura.avisos;
  return conBloqueo_(function () {
    const existentes = usuariosPorId_();
    const indice = nuevoIndiceNombres_();
    Object.keys(existentes).forEach(function (id) { if (id) anadirAIndiceNombres_(indice, existentes[id]); });
    const nuevosUsuarios = [];
    const telefonosAnadidos = [];
    const nuevasInscripciones = [];
    let yaExistian = 0, yaInscritos = 0, parecidos = 0;

    lectura.orden.forEach(function (id) {
      const d = leidos[id];
      const u = existentes[id];
      if (!u) {
        const nuevo = { usuario_id: id, nombre: d.nombre, telefono: d.telefono, activo: SI };
        const lista = parecidosEnIndice_(indice, id, d.nombre);
        if (lista.length) {
          parecidos++;
          avisos.push('¿Duplicado? El ID ' + id + ' «' + d.nombre + '» se parece a ' + textoParecidos_(lista.slice(0, MAX_PARECIDOS)) + '. Se ha creado igualmente.');
        }
        anadirAIndiceNombres_(indice, nuevo);
        nuevosUsuarios.push(nuevo);
      } else {
        yaExistian++;
        if (normalizarNombre_(u.nombre) !== d.nombre) avisos.push('El ID ' + id + ' ya existe como «' + u.nombre + '» y en el documento pone «' + d.nombre + '». No se ha cambiado.');
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
      leidos: lectura.orden.length,
      creados: nuevosUsuarios.length,
      parecidos: parecidos,
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
  const lineas = (r.filtros || []).concat([
    'Usuarios leídos: ' + r.leidos,
    'Usuarios nuevos creados: ' + r.creados,
    'De ellos, con un nombre parecido a otro usuario (revísalos en los avisos): ' + r.parecidos,
    'Usuarios que ya existían: ' + r.existentes,
    'Teléfonos añadidos a usuarios que no tenían: ' + r.telefonosAnadidos
  ]);
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

// ---------- Documento del centro «Usuarios Activos y Listas Espera» ----------

function menuImportarCentro() {
  ejecutarMenu_(function (ui) {
    const r1 = ui.prompt('Importar del documento del centro (1 de 4)',
      'Pega el enlace del documento «Usuarios Activos y Listas Espera».\n' +
      '(Si es un Excel, súbelo antes a Drive, ábrelo y usa Archivo › Guardar como Hoja de cálculo de Google.)', ui.ButtonSet.OK_CANCEL);
    if (r1.getSelectedButton() !== ui.Button.OK) return;
    const idArchivo = idDeEnlace_(r1.getResponseText());
    const pestanas = pestanasDelCentro_(abrirOrigen_(idArchivo));

    const opciones = { '1': 'ACTIVOS', '2': 'ESPERA', '3': 'TODOS' };
    const describir = function (k) {
      const t = pestanas[k];
      return t ? '«' + t.nombre + '», ' + personasDistintas_(t.filas) + ' personas' : 'no hay pestaña';
    };
    const r2 = ui.prompt('Importar del documento del centro (2 de 4)',
      '¿A quién quieres añadir? Escribe el número:\n\n' +
      '1  Activos (' + describir('ACTIVOS') + ')\n' +
      '2  Lista de espera (' + describir('ESPERA') + ')\n' +
      '3  Los dos', ui.ButtonSet.OK_CANCEL);
    if (r2.getSelectedButton() !== ui.Button.OK) return;
    const quien = opciones[r2.getResponseText().trim()];
    if (!quien) throw errorApp_('Escribe 1, 2 o 3.');
    comprobarPestanasCentro_(pestanas, quien);

    const lista = function (campo, separador) {
      return valoresDelCentro_(pestanas, quien, campo).map(function (v) {
        return v.valor + ' (' + v.personas + ')';
      }).join(separador);
    };
    const r3 = ui.prompt('Importar del documento del centro (3 de 4)',
      'Escribe los talleres separados por comas (por ejemplo: YOGA, PILATES) o déjalo vacío para todos.\n' +
      'Talleres del documento (personas):\n\n' + lista('taller', '\n'), ui.ButtonSet.OK_CANCEL);
    if (r3.getSelectedButton() !== ui.Button.OK) return;

    const r4 = ui.prompt('Importar del documento del centro (4 de 4)',
      'Escribe las localidades separadas por comas (por ejemplo: ORIHUELA, SAN ANTON) o déjalo vacío para todas.\n' +
      'Localidades del documento (personas):\n\n' + lista('localidad', ', '), ui.ButtonSet.OK_CANCEL);
    if (r4.getSelectedButton() !== ui.Button.OK) return;

    const res = importarUsuariosDelCentro(idArchivo, quien, r3.getResponseText(), r4.getResponseText());
    ui.alert('Importación terminada', resumenImportacion_(res), ui.ButtonSet.OK);
  });
}

/**
 * Crea en Usuarios las personas del documento del centro, sin inscribirlas en ningún grupo.
 * quien: ACTIVOS, ESPERA o TODOS. talleres y localidades: texto separado por comas; vacío = todos.
 * El teléfono sale de la propia fila o, si no tiene, de otra pestaña con el mismo ID y nombre (lista de espera, bajas).
 */
function importarUsuariosDelCentro(idArchivo, quien, talleres, localidades) {
  soloAdmin_();
  const pestanas = pestanasDelCentro_(abrirOrigen_(idDeEnlace_(idArchivo)));
  const clave = String(quien || '').trim().toUpperCase();
  if (!CENTRO_QUIEN[clave]) throw errorApp_('Indica a quién importar: activos, lista de espera o los dos.');
  comprobarPestanasCentro_(pestanas, clave);
  const filtroTalleres = filtroCentro_(pestanas, clave, 'taller', talleres, 'ningún taller');
  const filtroLocalidades = filtroCentro_(pestanas, clave, 'localidad', localidades, 'ninguna localidad');

  // Teléfonos de todas las pestañas, por ID y nombre (un ID mal escrito no da el teléfono de otra persona).
  const telefonos = {};
  Object.keys(CENTRO_PESTANAS).forEach(function (k) {
    if (!pestanas[k]) return;
    pestanas[k].filas.forEach(function (f) {
      const c = f.id + '|' + f.nombre;
      if (f.id && f.nombre && f.telefono && !telefonos[c]) telefonos[c] = f.telefono;
    });
  });

  const lectura = nuevaLectura_();
  CENTRO_QUIEN[clave].forEach(function (k) {
    const t = pestanas[k];
    t.filas.forEach(function (f) {
      if (filtroTalleres.length && filtroTalleres.indexOf(f.taller) < 0) return;
      if (filtroLocalidades.length && filtroLocalidades.indexOf(f.localidad) < 0) return;
      anotarLeido_(lectura, t.nombre + ', fila ' + f.fila, f.id, f.nombre,
        f.telefono || telefonos[f.id + '|' + f.nombre] || '');
    });
  });

  const res = guardarImportacion_(lectura, '', '');
  res.filtros = [
    'Pestañas: ' + CENTRO_QUIEN[clave].map(function (k) { return pestanas[k].nombre; }).join(' y '),
    'Talleres: ' + (filtroTalleres.join(', ') || 'todos'),
    'Localidades: ' + (filtroLocalidades.join(', ') || 'todas'),
    ''
  ];
  return res;
}

/** Busca las pestañas de activos, lista de espera y bajas, y lee sus filas. Las que no estén quedan en null. */
function pestanasDelCentro_(origen) {
  const pestanas = {};
  Object.keys(CENTRO_PESTANAS).forEach(function (k) { pestanas[k] = null; });
  origen.getSheets().forEach(function (h) {
    const nombre = cabeceraNormalizada_(h.getName());
    Object.keys(CENTRO_PESTANAS).forEach(function (k) {
      if (!pestanas[k] && nombre.indexOf(CENTRO_PESTANAS[k]) >= 0) pestanas[k] = leerPestanaCentro_(h);
    });
  });
  return pestanas;
}

function comprobarPestanasCentro_(pestanas, quien) {
  const textos = { ACTIVOS: 'activos (ALTAS)', ESPERA: 'lista de espera (ESPERA)' };
  CENTRO_QUIEN[quien].forEach(function (k) {
    if (!pestanas[k]) throw errorApp_('No se encuentra la pestaña de ' + textos[k] + ' en ese documento.');
  });
}

/**
 * Lee una pestaña del documento del centro. Se salta las filas vacías (hay muchas entre los datos).
 * Devuelve { nombre, filas: [{ fila, id, nombre, telefono, taller, localidad }] }; taller y localidad, normalizados.
 */
function leerPestanaCentro_(hoja) {
  const valores = hoja.getDataRange().getValues();
  let filaCab = -1, colNombre = -1;
  for (let r = 0; r < Math.min(valores.length, 10) && filaCab < 0; r++) {
    colNombre = buscarColumna_(valores[r], IMPORTAR_CABECERA_NOMBRE);
    if (colNombre >= 0) filaCab = r;
  }
  if (filaCab < 0) throw errorApp_('En la pestaña «' + hoja.getName() + '» no se encuentra la columna del nombre (NOMBRE o APELLIDOS NOMBRE).');
  const cabecera = valores[filaCab];
  let colId = buscarColumna_(cabecera, IMPORTAR_CABECERA_ID);
  if (colId < 0) colId = colNombre + 1;
  let colTel = -1;
  for (let i = 0; i < cabecera.length && colTel < 0; i++) {
    const c = cabeceraNormalizada_(cabecera[i]);
    if (CENTRO_CABECERA_TELEFONO.some(function (p) { return c.indexOf(p) === 0; })) colTel = i;
  }
  const colTaller = colId + CENTRO_COLUMNAS_TRAS_ID.TALLER;
  const colLocalidad = colId + CENTRO_COLUMNAS_TRAS_ID.LOCALIDAD;

  const filas = [];
  for (let r = filaCab + 1; r < valores.length; r++) {
    const v = valores[r];
    let id = normalizarId_(v[colId]);
    const nombre = normalizarNombre_(v[colNombre]);
    if (!id && !nombre) continue;
    // «NO ID», «no base»…: sin ningún número no es un ID.
    if (!/\d/.test(id)) id = '';
    filas.push({
      fila: r + 1,
      id: id,
      nombre: nombre,
      telefono: colTel >= 0 ? telefonoDelCentro_(v[colTel]) : '',
      taller: cabeceraNormalizada_(v[colTaller]),
      localidad: cabeceraNormalizada_(v[colLocalidad])
    });
  }
  return { nombre: hoja.getName(), filas: filas };
}

/** Primer teléfono de la celda: «966123456 / 600123456», «600123456 HIJA» o «NO TLF» (= sin teléfono). */
function telefonoDelCentro_(valor) {
  const trozos = celdaATexto_(valor).match(/\d+/g) || [];
  let numero = '';
  for (let i = 0; i < trozos.length && numero.length < 9; i++) numero += trozos[i];
  return numero;
}

function personasDistintas_(filas) {
  const ids = {};
  filas.forEach(function (f) { if (f.id) ids[f.id] = true; });
  return Object.keys(ids).length;
}

/** Talleres o localidades de las pestañas elegidas, con cuántas personas distintas tiene cada uno. */
function valoresDelCentro_(pestanas, quien, campo) {
  const mapa = {};
  CENTRO_QUIEN[quien].forEach(function (k) {
    pestanas[k].filas.forEach(function (f) {
      if (!f[campo]) return;
      if (!mapa[f[campo]]) mapa[f[campo]] = {};
      mapa[f[campo]][f.id || f.nombre] = true;
    });
  });
  return Object.keys(mapa).sort().map(function (valor) {
    return { valor: valor, personas: Object.keys(mapa[valor]).length };
  });
}

/** Convierte «yoga, Pilates» en ['YOGA', 'PILATES'] y comprueba que existen en el documento. */
function filtroCentro_(pestanas, quien, campo, texto, ninguno) {
  const validos = valoresDelCentro_(pestanas, quien, campo).map(function (v) { return v.valor; });
  const elegidos = String(texto || '').split(',').map(cabeceraNormalizada_).filter(Boolean);
  elegidos.forEach(function (e) {
    if (validos.indexOf(e) < 0) throw errorApp_('No hay ' + ninguno + ' «' + e + '» en el documento. Se puede elegir entre: ' + validos.join(', ') + '.');
  });
  return elegidos;
}
