/**
 * Importar.gs — Importaciones (sección 10 de CLAUDE.md).
 * - Desde el menú de la hoja (admin): usuarios de una pestaña (ID, nombre, teléfono y, si se indica, su inscripción
 *   a un grupo) y usuarios del documento del centro. No importan asistencias.
 * - Desde la app (9-nov-2026, Gestión › Importar desde Excel; admin y monitoras, cada una hacia sus grupos): los
 *   Excel de asistencia de las monitoras, con sus grupos, usuarios, inscripciones y asistencias. El navegador lee el
 *   archivo y manda sus casillas como texto (analizarImportacion_ enseña lo que se va a hacer; importarExcel_ lo hace).
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

// ---------- Importar desde la app: Excel de asistencia (9-nov-2026) ----------
// El navegador lee el .xlsx (Cliente.html, leerExcel) y manda libro = { nombre, hojas: [{ nombre, filas: [[texto]] }] }.
// Cada pestaña puede tener uno o varios grupos: una fila de cabecera con los días («L.7», «X.9»…), encima los meses
// («SEPT», «OCT»…, en casillas combinadas) y debajo una fila por usuario (Nº, nombre, ID, teléfono y una casilla por día).
// Dos grupos de la misma pestaña se separan con una fila con su horario («L-X | 18:00h 19:00h»).
// En cada casilla: la letra de un estado (hoja Estados: X, F, J, E), nada (sin marcar) o una letra suelta de una
// palabra escrita en vertical («VACACIONES»), que hace de ese día un «No hubo clase» con la palabra como nota.
// Una pestaña sin días, pero con las columnas ID y nombre, es una lista de usuarios: se inscriben desde una fecha.
// analizarImportacion_ no escribe nada: enseña lo que se va a hacer. importarExcel_ vuelve a analizar el mismo
// libro (no se fía de lo que diga el cliente sobre él) y lo escribe todo en un solo bloqueo.

/** Comprueba la forma del libro que manda el navegador y deja cada casilla como texto recortado. */
function libroImportado_(libro) {
  if (!libro || typeof libro !== 'object' || !Array.isArray(libro.hojas)) throw errorApp_('No se ha recibido ningún archivo.');
  if (!libro.hojas.length) throw errorApp_('El archivo no tiene ninguna pestaña con datos.');
  return {
    nombre: String(libro.nombre || 'archivo').substring(0, 200),
    hojas: libro.hojas.slice(0, IMPORTAR_MAX_HOJAS).map(function (h) {
      const filas = Array.isArray(h && h.filas) ? h.filas.slice(0, IMPORTAR_MAX_FILAS) : [];
      return {
        nombre: String(h && h.nombre || '').substring(0, 100),
        filas: filas.map(function (f) {
          return (Array.isArray(f) ? f.slice(0, IMPORTAR_MAX_COLUMNAS) : []).map(function (v) {
            return v === null || v === undefined ? '' : String(v).trim();
          });
        })
      };
    })
  };
}

/** Texto de una casilla para comparar: mayúsculas, sin tildes y sin espacios sobrantes. */
function textoImportado_(v) {
  return sinTildes_(v).replace(/\s+/g, ' ').trim();
}

/** Hora «17:00» de un texto de horario («L-X 17:00h 18:00h» → «17:00»), o ''. */
function horaDeTexto_(texto) {
  const m = IMPORTAR_PATRON_HORA.exec(textoImportado_(texto));
  if (!m) return '';
  const h = Number(m[1] || m[3]);
  const min = m[2] || m[4] || '00';
  return h <= 23 ? h + ':' + min : '';
}

/**
 * Lee los grupos (bloques) de un libro, sin tocar ninguna hoja. ctx: { letras: { X: 'ASI', … }, inicioCurso, hoy }.
 * Devuelve { anioCurso, bloques, hojasIgnoradas, avisos }. Cada bloque:
 * { id, hoja, horario, hora, dias, conFechas, usuarios: [{ usuario_id, nombre, telefono, fila, marcas: { fecha: código } }],
 *   fechas: [{ fecha, tipo: 'clase' | 'palabra' | 'vacia', nota }], sinId: [texto], avisos: [texto], textoCab }.
 */
function leerBloquesLibro_(libro, ctx) {
  const avisos = [];
  const hojasIgnoradas = [];
  const leidas = [];
  libro.hojas.forEach(function (h, nh) {
    const r = leerCabeceraHoja_(h);
    if (!r) { if (h.filas.some(function (f) { return f.some(Boolean); })) hojasIgnoradas.push(h.nombre); return; }
    r.indice = nh;
    // Solo cuentan las columnas de día con algo escrito debajo: las plantillas traen a veces días de otros años vacíos.
    r.dias.forEach(function (d) {
      d.conDatos = h.filas.slice(r.filaCab + 1).some(function (f) { return !!f[d.col]; });
    });
    leidas.push(r);
  });

  // El año: el curso que mejor cuadra los días de la semana de todas las pestañas (por si el Excel es de otro curso).
  const referencia = String(ctx.inicioCurso || ctx.hoy);
  const base = Number(referencia.substring(0, 4)) - (Number(referencia.substring(5, 7)) < IMPORTAR_MES_INICIO_CURSO ? 1 : 0);
  let mejor = { anio: base, aciertos: -1, total: 0 };
  [base, base - 1, base + 1, base - 2].forEach(function (anio) {
    let aciertos = 0, total = 0;
    leidas.forEach(function (r) {
      r.dias.forEach(function (d) {
        if (!d.mes || !d.conDatos) return;
        total++;
        const f = fechaImportada_(anio, d.mes, d.dia);
        if (f && LETRAS_DIAS[textoAFecha_(f).getDay()] === d.letra) aciertos++;
      });
    });
    if (aciertos > mejor.aciertos) mejor = { anio: anio, aciertos: aciertos, total: total };
  });
  if (mejor.total && mejor.aciertos < mejor.total * 0.8) {
    avisos.push('Muchas fechas no cuadran con los días de la semana (' + (mejor.total - mejor.aciertos) + ' de ' + mejor.total +
      '). Revisa que la fila de los meses esté encima de la de los días.');
  }

  const bloques = [];
  leidas.forEach(function (r) {
    const h = libro.hojas[r.indice];
    // Fecha de cada columna de día; las que no cuadran con su día de la semana se dejan fuera.
    const columnas = [];
    const malas = [];
    r.dias.forEach(function (d) {
      const f = d.mes ? fechaImportada_(mejor.anio, d.mes, d.dia) : '';
      if (f && LETRAS_DIAS[textoAFecha_(f).getDay()] === d.letra) columnas.push({ col: d.col, fecha: f, letra: d.letra });
      else if (d.conDatos) malas.push(d.texto);
    });
    leerBloquesHoja_(h, r, columnas, ctx).forEach(function (b, nb) {
      b.id = 'h' + r.indice + 'b' + nb;
      if (malas.length) b.avisos.push('Días que no cuadran con el calendario y no se importan: ' + malas.slice(0, 8).join(', ') + (malas.length > 8 ? '…' : '') + '.');
      bloques.push(b);
    });
  });
  return { anioCurso: mejor.anio + '-' + (mejor.anio + 1), bloques: bloques, hojasIgnoradas: hojasIgnoradas, avisos: avisos };
}

/** yyyy-MM-dd del día «dia» del mes «mes» del curso que empieza en «anio», o '' si no existe (31 de abril…). */
function fechaImportada_(anio, mes, dia) {
  const a = mes >= IMPORTAR_MES_INICIO_CURSO ? anio : anio + 1;
  const d = new Date(a, mes - 1, dia);
  if (d.getMonth() !== mes - 1 || d.getDate() !== dia) return '';
  return a + '-' + ('0' + mes).slice(-2) + '-' + ('0' + dia).slice(-2);
}

/**
 * Cabecera de una pestaña: la fila de los días y las columnas de ID, nombre y teléfono. null si no se reconoce.
 * Devuelve { filaCab, dias: [{ col, letra, dia, mes, texto }], primeraDia, colId, colNombre, colTel, textoCab }.
 * Sin fila de días, una lista de usuarios (cabeceras ID y USUARIO o NOMBRE): dias vacío.
 */
function leerCabeceraHoja_(h) {
  const filas = h.filas;
  let filaCab = -1;
  let dias = [];
  for (let r = 0; r < Math.min(filas.length, 30) && filaCab < 0; r++) {
    const encontrados = [];
    filas[r].forEach(function (v, c) {
      const m = IMPORTAR_PATRON_DIA.exec(textoImportado_(v));
      if (m) encontrados.push({ col: c, letra: m[1], dia: Number(m[2]), mes: 0, texto: v });
    });
    if (encontrados.length >= IMPORTAR_MIN_DIAS) { filaCab = r; dias = encontrados; }
  }
  if (filaCab < 0) {
    // Lista de usuarios sin días: la fila con las cabeceras ID y nombre.
    for (let r = 0; r < Math.min(filas.length, 30); r++) {
      if (buscarColumna_(filas[r], IMPORTAR_CABECERA_ID) >= 0 && buscarColumna_(filas[r], IMPORTAR_CABECERA_NOMBRE) >= 0) {
        filaCab = r;
        break;
      }
    }
    if (filaCab < 0) return null;
  }
  const primeraDia = dias.length ? dias[0].col : Infinity;
  asignarMeses_(filas, filaCab, dias);

  // Columnas de ID, nombre y teléfono: por su cabecera (en la fila de los días o hasta 3 por encima) y, si no la
  // tienen, por su contenido.
  let colId = -1, colNombre = -1, colTel = -1;
  for (let r = Math.max(0, filaCab - 3); r <= filaCab; r++) {
    filas[r].forEach(function (v, c) {
      if (c >= primeraDia) return;
      const t = cabeceraNormalizada_(v);
      if (colId < 0 && IMPORTAR_CABECERA_ID.indexOf(t) >= 0) colId = c;
      if (colNombre < 0 && IMPORTAR_CABECERA_NOMBRE.indexOf(t) >= 0) colNombre = c;
      if (colTel < 0 && CENTRO_CABECERA_TELEFONO.some(function (p) { return t.indexOf(p) === 0; })) colTel = c;
    });
  }
  const debajo = filas.slice(filaCab + 1, filaCab + 200);
  const cuantas = function (c, patron) {
    return debajo.filter(function (f) { return patron.test(textoImportado_(f[c])); }).length;
  };
  const ancho = Math.min(primeraDia, Math.max.apply(null, filas.map(function (f) { return f.length; }).concat([0])));
  if (colNombre < 0) {
    let max = 0;
    for (let c = 0; c < ancho; c++) {
      if (c === colId || c === colTel) continue;
      const n = cuantas(c, /[A-ZÑ]{2,}\s+[A-ZÑ]{2,}/);
      if (n > max) { max = n; colNombre = c; }
    }
  }
  if (colNombre < 0) return null;
  if (colId < 0 && cuantas(colNombre + 1, /^\d{1,7}$/) > 0) colId = colNombre + 1;
  if (colId < 0) return null;
  if (colTel < 0) {
    for (let c = 0; c < ancho && colTel < 0; c++) {
      if (c !== colId && c !== colNombre && cuantas(c, /^(\+?34)?\d{9}$/) > 0) colTel = c;
    }
  }
  const textoCab = filas.slice(Math.max(0, filaCab - 3), filaCab + 1).map(function (f) {
    return f.filter(function (v, c) { return c < primeraDia; }).join(' ');
  }).join(' ');
  return { filaCab: filaCab, dias: dias, primeraDia: primeraDia, colId: colId, colNombre: colNombre, colTel: colTel, textoCab: textoCab };
}

/**
 * Mes de cada columna de día: el de la casilla de mes más cercana por la izquierda en las 3 filas de encima
 * (las casillas combinadas tienen el texto en la primera). Sin casilla de mes, cuando el número del día baja,
 * empieza el mes siguiente.
 */
function asignarMeses_(filas, filaCab, dias) {
  const marcas = {};
  for (let r = Math.max(0, filaCab - 3); r < filaCab; r++) {
    filas[r].forEach(function (v, c) {
      const mes = IMPORTAR_MESES[textoImportado_(v).replace(/[^A-Z]/g, '')];
      if (mes) marcas[c] = mes;
    });
  }
  const columnasMes = Object.keys(marcas).map(Number).sort(function (a, b) { return a - b; });
  let mes = 0;
  let anterior = { col: -1, dia: 0 };
  dias.forEach(function (d) {
    // Casilla de mes entre la columna anterior (sin incluir) y esta (incluida).
    const marca = columnasMes.filter(function (c) { return c > anterior.col && c <= d.col; }).pop();
    if (marca !== undefined) mes = marcas[marca];
    else if (!mes) mes = columnasMes.length ? marcas[columnasMes[0]] : IMPORTAR_MES_INICIO_CURSO + 1;
    else if (d.dia < anterior.dia) mes = mes % 12 + 1;
    d.mes = mes;
    anterior = { col: d.col, dia: d.dia };
  });
}

/** Lee los bloques (grupos) de una pestaña ya reconocida. columnas: [{ col, fecha }] de los días que cuadran. */
function leerBloquesHoja_(h, r, columnas, ctx) {
  const filas = h.filas;
  const bloques = [];
  const conFechas = r.dias.length > 0;
  const nuevoBloque = function (horario) {
    const b = { hoja: h.nombre, horario: horario, hora: horaDeTexto_(horario), conFechas: conFechas, dias: [], usuarios: [],
      fechas: [], sinId: [], avisos: [], textoCab: r.textoCab, vistos: {} };
    bloques.push(b);
    return b;
  };
  const izquierda = function (f) {
    return f.filter(function (v, c) { return c < r.primeraDia && v; });
  };
  const horasCab = izquierda(filas[r.filaCab]).filter(function (v) { return IMPORTAR_PATRON_HORA.test(textoImportado_(v)); });
  let bloque = null;
  let horarioPendiente = horasCab.join(' ');
  for (let i = r.filaCab + 1; i < filas.length; i++) {
    const f = filas[i];
    if (!f.some(Boolean)) continue;
    let id = normalizarId_(f[r.colId]);
    if (!/\d/.test(id)) id = '';
    const nombre = normalizarNombre_(f[r.colNombre]);
    const conMarcas = conFechas && columnas.some(function (c) { return f[c.col]; });
    if (!id) {
      const texto = izquierda(f).join(' ');
      if (IMPORTAR_PATRON_HORA.test(textoImportado_(texto)) && !conMarcas) {
        // Fila que separa dos grupos: el siguiente bloque empieza aquí, con su horario.
        horarioPendiente = texto;
        bloque = null;
      } else if (nombre && nombre.split(' ').length >= 2 && ((r.colTel >= 0 && f[r.colTel]) || conMarcas)) {
        // Persona sin ID: no se importa, pero se avisa (y su fila cuenta para las palabras en vertical).
        if (!bloque) { bloque = nuevoBloque(horarioPendiente); horarioPendiente = ''; bloque.filaIni = i; }
        bloque.filaFin = i;
        bloque.sinId.push('Fila ' + (i + 1) + ': ' + nombre);
      }
      continue;
    }
    if (!bloque) { bloque = nuevoBloque(horarioPendiente); horarioPendiente = ''; bloque.filaIni = i; }
    bloque.filaFin = i;
    if (!nombre) { bloque.avisos.push('Fila ' + (i + 1) + ': el ID ' + id + ' no tiene nombre; no se importa.'); continue; }
    if (bloque.vistos[id]) { bloque.avisos.push('Fila ' + (i + 1) + ': el ID ' + id + ' está repetido; se usa la primera fila.'); continue; }
    bloque.vistos[id] = true;
    bloque.usuarios.push({
      usuario_id: id, nombre: nombre, fila: i + 1, marcas: {}, celdas: f,
      telefono: r.colTel >= 0 ? telefonoDelCentro_(f[r.colTel]) : ''
    });
  }

  // Días: letras de las columnas que cuadran con el calendario (para un grupo nuevo) y, en cada fecha, qué hay en las
  // casillas de los usuarios.
  const letras = {};
  columnas.forEach(function (c) { letras[c.letra] = true; });
  const porFecha = {};
  columnas.forEach(function (c) { (porFecha[c.fecha] = porFecha[c.fecha] || []).push(c.col); });
  const fechas = Object.keys(porFecha).filter(function (f) { return f <= ctx.hoy; }).sort();
  bloques.forEach(function (b) {
    b.dias = ORDEN_DIAS.filter(function (d) { return letras[d]; });
    delete b.vistos;
    let raras = 0;
    const letrasRaras = {};
    fechas.forEach(function (fecha) {
      // De cada usuario, la primera casilla con algo (si la fecha sale en dos columnas).
      const valores = b.usuarios.map(function (u) {
        return porFecha[fecha].map(function (c) { return textoImportado_(u.celdas[c]); }).filter(Boolean)[0] || '';
      });
      const deEstado = function (v) { return v.length === 1 && ctx.letras[v] ? ctx.letras[v] : ''; };
      const noMarca = function (v) { return v && !deEstado(v) && IMPORTAR_MARCAS_IGNORADAS.indexOf(v) < 0; };
      // Una palabra en vertical se mira en todas las filas del grupo (también las de quien no tiene ID).
      const letrasColumna = filas.slice(b.filaIni, b.filaFin + 1).map(function (f) {
        return porFecha[fecha].map(function (c) { return textoImportado_(f[c]); }).filter(Boolean)[0] || '';
      });
      const otras = valores.filter(noMarca);
      const otrasColumna = letrasColumna.filter(noMarca);
      const largas = otrasColumna.some(function (v) { return v.replace(/[^A-Z]/g, '').length >= 4; });
      // La nota son las letras de arriba abajo, sin las X ni las J (marcas de asistencia). Una columna de X y J no es
      // una palabra aunque esas letras no estén en la hoja Estados.
      const nota = letrasColumna.filter(function (v) { return v && v !== 'X' && v !== 'J'; }).join('').substring(0, 100);
      if ((otrasColumna.length >= IMPORTAR_MIN_LETRAS_PALABRA || largas) && nota.replace(/[^A-Z]/g, '').length >= IMPORTAR_MIN_LETRAS_PALABRA) {
        b.fechas.push({ fecha: fecha, tipo: 'palabra', nota: nota });
        return;
      }
      let alguna = false;
      valores.forEach(function (v, k) {
        const codigo = deEstado(v);
        if (codigo) { b.usuarios[k].marcas[fecha] = codigo; alguna = true; }
      });
      raras += otras.length;
      otras.forEach(function (v) { letrasRaras[v] = true; });
      b.fechas.push({ fecha: fecha, tipo: alguna ? 'clase' : 'vacia', nota: '' });
    });
    if (raras) {
      b.avisos.push(raras + (raras === 1 ? ' casilla con una letra desconocida se deja' : ' casillas con letras desconocidas se dejan') +
        ' sin marcar (' + Object.keys(letrasRaras).slice(0, 10).join(', ') + ').');
    }
    b.raras = raras;
    // Los días sin ninguna marca después de la última clase (o día con palabra) no son del Excel: se quitan.
    let ultima = -1;
    b.fechas.forEach(function (x, k) { if (x.tipo !== 'vacia') ultima = k; });
    b.fechas = b.fechas.slice(0, ultima + 1);
  });
  bloques.forEach(function (b) { b.usuarios.forEach(function (u) { delete u.celdas; }); });
  return bloques.filter(function (b) { return b.usuarios.length; });
}

/** Primer día de un usuario en el bloque: el de su primera marca; sin marcas, el día después del último del Excel. */
function altaImportada_(b, u, hoy, fechaAlta) {
  if (!b.conFechas) return fechaAlta;
  const conMarca = b.fechas.find(function (x) { return x.tipo === 'clase' && u.marcas[x.fecha]; });
  if (conMarca) return conMarca.fecha;
  const ultima = b.fechas.length ? b.fechas[b.fechas.length - 1].fecha : '';
  const alta = ultima ? sumarDias_(ultima, 1) : hoy;
  return alta > hoy ? hoy : alta;
}

/** Contexto para leer un libro: letras de los estados (hoja Estados, también los desactivados), curso y hoy. */
function contextoImportar_() {
  const letras = {};
  const estados = leerTabla_(HOJAS.ESTADOS).filter(function (e) { return e.codigo; });
  estados.forEach(function (e) {
    const l = textoImportado_(e.letra);
    if (l.length === 1 && !letras[l]) letras[l] = e.codigo;
  });
  // Las letras de los Excel son siempre X Asistido, F Falta, J Justificada y E Evento. Si la hoja Estados no usa una de
  // ellas para otro estado (columna letra vacía, con otra letra o con otro contenido), vale la de siempre: su código o,
  // si no existe, el primer estado de su tipo (9-nov-2026: sin esto, las X no se reconocían en la hoja del dueño).
  DATOS_INICIALES.estados.forEach(function (d) {
    if (letras[d.letra]) return;
    const e = estados.find(function (x) { return x.codigo === d.codigo; }) ||
      estados.find(function (x) { return x.tipo === d.tipo && x.activo !== NO; });
    if (e) letras[d.letra] = e.codigo;
  });
  return { letras: letras, inicioCurso: config_().inicio, hoy: hoy_() };
}

/** «Martes y jueves esterilla» de «MARTES Y JUEVES ESTERILLA». */
function nombreBonito_(texto) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Taller existente cuyo nombre sale en el nombre del archivo, de la pestaña o en las casillas de encima. */
function tallerSugerido_(textos, talleres) {
  const texto = ' ' + textoImportado_(textos.join(' ')).replace(/[^A-Z0-9]+/g, ' ') + ' ';
  let mejor = null;
  talleres.forEach(function (t) {
    const n = textoImportado_(t.nombre).replace(/[^A-Z0-9]+/g, ' ').trim();
    if (n && texto.indexOf(' ' + n + ' ') >= 0 && (!mejor || n.length > mejor.n.length)) mejor = { id: t.taller_id, n: n };
  });
  return mejor ? mejor.id : '';
}

/**
 * Analiza un libro para la vista previa, sin escribir nada. Devuelve los bloques con lo que se haría y lo que
 * hace falta para elegir el grupo de cada uno (grupos de la monitora y talleres).
 */
function analizarImportacion_(monitora, libro) {
  libro = libroImportado_(libro);
  const ctx = contextoImportar_();
  const lectura = leerBloquesLibro_(libro, ctx);
  if (!lectura.bloques.length) {
    throw errorApp_('No se ha encontrado ningún grupo en «' + libro.nombre + '». Hace falta una fila con los días («L.7», «X.9»…) ' +
      'o las columnas ID y USUARIO, y debajo una fila por usuario con su ID.');
  }
  const talleres = leerTabla_(HOJAS.TALLERES).filter(function (t) { return t.taller_id; });
  const nombresTaller = {};
  talleres.forEach(function (t) { nombresTaller[t.taller_id] = t.nombre || t.taller_id; });
  const grupos = gruposAccesibles_(monitora);
  const existentes = usuariosPorId_();
  const indice = nuevoIndiceNombres_();
  Object.keys(existentes).forEach(function (id) { if (id) anadirAIndiceNombres_(indice, existentes[id]); });
  const porHoja = {};
  lectura.bloques.forEach(function (b) { porHoja[b.hoja] = (porHoja[b.hoja] || 0) + 1; });

  const bloques = lectura.bloques.map(function (b) {
    const usuarios = b.usuarios.map(function (u) {
      const e = existentes[u.usuario_id];
      const o = { usuario_id: u.usuario_id, nombre: u.nombre, marcas: Object.keys(u.marcas).length,
        alta: b.conFechas ? altaImportada_(b, u, ctx.hoy, '') : '' };
      if (!e) {
        o.situacion = 'nuevo';
        const p = parecidosEnIndice_(indice, u.usuario_id, u.nombre);
        if (p.length) o.parecidos = textoParecidos_(p.slice(0, MAX_PARECIDOS));
      } else {
        o.situacion = normalizarNombre_(e.nombre) === u.nombre ? 'existe' : 'distinto';
        o.nombreApp = e.nombre;
      }
      return o;
    });
    const marcas = {};
    let sinMarcar = 0;
    b.fechas.forEach(function (x) {
      if (x.tipo !== 'clase') return;
      b.usuarios.forEach(function (u, k) {
        if (u.marcas[x.fecha]) marcas[u.marcas[x.fecha]] = (marcas[u.marcas[x.fecha]] || 0) + 1;
        else if (usuarios[k].alta && usuarios[k].alta <= x.fecha) sinMarcar++;
      });
    });
    // Sin ninguna marca reconocida en días con algo escrito: casi seguro que las letras no son las de la hoja Estados.
    if (b.conFechas && !Object.keys(marcas).length && (b.raras || b.fechas.some(function (x) { return x.tipo !== 'vacia'; }))) {
      b.avisos.unshift('No se ha reconocido ninguna marca de asistencia. Revisa en Configuración › Estados de asistencia la letra de cada estado (X, F, J, E).');
    }
    // Grupo de la monitora con los mismos días y la misma hora (si solo hay uno).
    const iguales = b.dias.length ? grupos.filter(function (g) {
      return diasDeGrupo_(g).join(',') === b.dias.join(',') && (!b.hora || claveHora_(g.hora) === claveHora_(b.hora));
    }) : [];
    const taller = tallerSugerido_([libro.nombre, b.hoja, b.textoCab], talleres);
    // Nombre del grupo nuevo: el de la pestaña si dice algo («MARTES Y JUEVES ESTERILLA»); si es solo «L-X», el
    // taller con los días y la hora.
    const hojaConPalabras = /[A-ZÑ]{3,}/.test(textoImportado_(b.hoja));
    const nombre = hojaConPalabras ? nombreBonito_(b.hoja) + (porHoja[b.hoja] > 1 && b.hora ? ' ' + b.hora : '')
      : [taller ? nombresTaller[taller] : '', b.dias.join('-'), b.hora].filter(Boolean).join(' ') || nombreBonito_(b.hoja);
    return {
      id: b.id, hoja: b.hoja, horario: b.horario, hora: b.hora, dias: b.dias, conFechas: b.conFechas,
      usuarios: usuarios, sinId: b.sinId, avisos: b.avisos,
      clases: b.fechas.filter(function (x) { return x.tipo === 'clase'; }).length,
      palabras: b.fechas.filter(function (x) { return x.tipo === 'palabra'; }).map(function (x) { return { fecha: x.fecha, nota: x.nota }; }),
      vacias: b.fechas.filter(function (x) { return x.tipo === 'vacia'; }).map(function (x) { return x.fecha; }),
      // Días con algo en el Excel (clase o palabra): los únicos que se pueden sustituir si ya tienen lista en la app.
      conDatos: b.fechas.filter(function (x) { return x.tipo !== 'vacia'; }).map(function (x) { return x.fecha; }),
      desde: b.fechas.length ? b.fechas[0].fecha : '', hasta: b.fechas.length ? b.fechas[b.fechas.length - 1].fecha : '',
      marcas: marcas, sinMarcar: sinMarcar,
      grupoSugerido: iguales.length === 1 ? iguales[0].grupo_id : '',
      nombreSugerido: nombre, tallerSugerido: taller
    };
  });
  const porTaller = talleresPorId_();
  // Días del Excel que ya tienen lista en la app, por grupo de la monitora (para ofrecer sustituirlos).
  const fechasExcel = {};
  bloques.forEach(function (b) { b.conDatos.forEach(function (f) { fechasExcel[f] = true; }); });
  const accesibles = {};
  grupos.forEach(function (g) { accesibles[g.grupo_id] = true; });
  const yaEnApp = {};
  leerTabla_(HOJAS.SESIONES).forEach(function (s) {
    if (accesibles[s.grupo_id] && fechasExcel[s.fecha]) (yaEnApp[s.grupo_id] = yaEnApp[s.grupo_id] || []).push(s.fecha);
  });
  return {
    archivo: libro.nombre, curso: lectura.anioCurso, avisos: lectura.avisos, hojasIgnoradas: lectura.hojasIgnoradas,
    bloques: bloques, yaEnApp: yaEnApp,
    // Qué estado es cada letra de las casillas (se enseña arriba de la vista previa).
    letras: Object.keys(ctx.letras).sort().map(function (l) { return { letra: l, codigo: ctx.letras[l] }; }),
    grupos: grupos.map(function (g) { return grupoParaCliente_(g, porTaller); })
      .sort(function (a, b) { return (a.taller + a.nombre).localeCompare(b.taller + b.nombre, 'es'); }),
    talleres: talleres.map(function (t) { return { taller_id: t.taller_id, nombre: t.nombre || t.taller_id }; })
      .sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); }),
    // Solo el admin elige la monitora de un grupo nuevo (el de una monitora queda a su nombre).
    monitoras: esAdmin_(monitora) ? monitorasParaCliente_().filter(function (m) { return m.activa; })
      .map(function (m) { return { email: m.email, nombre: m.nombre }; }) : null
  };
}

/**
 * Importa un libro según lo elegido en la vista previa.
 * decisiones: { bloques: [{ id, incluir, grupo_id, nuevo: { nombre, taller_id, taller_nuevo, dias, hora, monitoras },
 *   sinMarcas: 'cancelar' | 'dejar', notas: { fecha: texto }, fecha_alta, sustituir }] }
 * - sustituir (9-nov-2026): los días con algo en el Excel que ya tienen lista en la app se reescriben con lo del Excel
 *   (para rehacer una importación); sin él, no se tocan.
 * - Grupo: uno de la monitora o uno nuevo (a su nombre; el admin elige la monitora).
 * - Usuarios: se crean los que no existen y se añade el teléfono a los que no tenían; nunca se cambia un nombre.
 * - Inscripción: desde su primera marca (sin marcas, desde el día siguiente al último del Excel; en una lista sin
 *   días, desde fecha_alta). Si ya estaba en el grupo desde más tarde, se adelanta su alta.
 * - Cada día del Excel que no tenga ya lista en la app: con marcas, sesión hecha (las casillas vacías quedan sin
 *   marcar); con una palabra, «No hubo clase» con su nota; sin marcas (antes de la última clase), «No hubo clase»
 *   o se deja sin pasar lista (sinMarcas). Los días que ya tienen lista en la app no se tocan.
 */
function importarExcel_(monitora, libro, decisiones) {
  libro = libroImportado_(libro);
  const ctx = contextoImportar_();
  const lectura = leerBloquesLibro_(libro, ctx);
  const porId = {};
  lectura.bloques.forEach(function (b) { porId[b.id] = b; });
  const elegidos = ((decisiones && decisiones.bloques) || []).filter(function (d) { return d && d.incluir; });
  if (!elegidos.length) throw errorApp_('No has elegido ningún grupo para importar.');
  // Todo se comprueba antes de escribir nada.
  const trabajos = elegidos.map(function (d) {
    const b = porId[d.id];
    if (!b) throw errorApp_('El archivo ha cambiado desde la vista previa. Vuelve a elegirlo.');
    const t = { b: b, grupoId: String(d.grupo_id || ''), sinMarcas: d.sinMarcas === 'dejar' ? 'dejar' : 'cancelar', notas: d.notas || {},
      sustituir: d.sustituir === true };
    if (!t.grupoId) {
      t.nuevo = d.nuevo || {};
      t.validado = validarGrupo_(monitora, t.nuevo);
    }
    if (!b.conFechas) {
      t.fechaAlta = String(d.fecha_alta || '');
      comprobarFecha_(t.fechaAlta, 'de alta');
    }
    return t;
  });

  return conBloqueo_(function () {
    const hoy = hoy_();
    const email = emailRegistro_(monitora);
    const ahora = marcaDeTiempo_();
    const res = { grupos: [], usuariosCreados: 0, telefonosAnadidos: 0, inscripciones: 0, altasAdelantadas: 0,
      clases: 0, sinClase: 0, registros: 0, sinMarcar: 0, yaEnApp: 0, avisos: [] };

    // 1. Grupos: los nuevos se crean ahora (escribirGrupo_ comprueba el taller y el nombre repetido).
    trabajos.forEach(function (t) {
      if (t.grupoId) {
        comprobarAccesoGrupo_(monitora, grupoPorId_(t.grupoId));
      } else {
        t.grupoId = escribirGrupo_(monitora, { nombre: t.nuevo.nombre, taller_id: t.nuevo.taller_id, taller_nuevo: t.nuevo.taller_nuevo, activo: true }, t.validado).grupo_id;
        t.creado = true;
      }
    });
    const talleres = talleresPorId_();

    // 2. Usuarios.
    const existentes = usuariosPorId_();
    const nuevosUsuarios = [];
    const conTelefono = [];
    trabajos.forEach(function (t) {
      t.b.usuarios.forEach(function (u) {
        const e = existentes[u.usuario_id];
        if (!e) {
          const nuevo = { usuario_id: u.usuario_id, nombre: u.nombre, telefono: u.telefono, activo: SI };
          existentes[u.usuario_id] = nuevo;
          nuevosUsuarios.push(nuevo);
        } else if (!e.telefono && u.telefono && e._fila) {
          e.telefono = u.telefono;
          if (conTelefono.indexOf(e) < 0) conTelefono.push(e);
        }
      });
    });
    anadirFilas_(HOJAS.USUARIOS, nuevosUsuarios);
    actualizarFilas_(HOJAS.USUARIOS, conTelefono);
    res.usuariosCreados = nuevosUsuarios.length;
    res.telefonosAnadidos = conTelefono.length;

    // 3. Inscripciones (en memoria; se escriben al final de este paso).
    const inscripciones = leerTabla_(HOJAS.INSCRIPCIONES);
    const nuevasInsc = [];
    const movidas = [];
    trabajos.forEach(function (t) {
      t.b.usuarios.forEach(function (u) {
        const alta = altaImportada_(t.b, u, hoy, t.fechaAlta);
        const suyas = inscripciones.concat(nuevasInsc).filter(function (i) {
          return i.grupo_id === t.grupoId && normalizarId_(i.usuario_id) === u.usuario_id;
        });
        const cubre = suyas.some(function (i) { return i.fecha_alta <= alta && (!i.fecha_baja || alta <= i.fecha_baja); });
        if (cubre) return;
        const abierta = suyas.find(function (i) { return !i.fecha_baja && i.fecha_alta > alta; });
        const choca = suyas.some(function (i) { return i !== abierta && i.fecha_baja && i.fecha_baja >= alta; });
        if (abierta && !choca) {
          // Ya estaba en el grupo desde más tarde: se adelanta su alta.
          abierta.fecha_alta = alta;
          if (abierta._fila && movidas.indexOf(abierta) < 0) movidas.push(abierta);
          res.altasAdelantadas++;
        } else if (!abierta && !choca) {
          nuevasInsc.push({ inscripcion_id: nuevoId_(), usuario_id: u.usuario_id, grupo_id: t.grupoId, fecha_alta: alta, fecha_baja: '', motivo_baja: '' });
          res.inscripciones++;
        } else {
          res.avisos.push(u.nombre + ': ya tiene otra inscripción en el grupo que se cruza con estas fechas; revisa sus altas y bajas.');
        }
      });
    });
    actualizarFilas_(HOJAS.INSCRIPCIONES, movidas);
    anadirFilas_(HOJAS.INSCRIPCIONES, nuevasInsc);
    const todasInsc = inscripciones.concat(nuevasInsc);
    const inscritoEl = function (grupoId, id, fecha) {
      return todasInsc.some(function (i) {
        return i.grupo_id === grupoId && normalizarId_(i.usuario_id) === id && i.fecha_alta <= fecha && (!i.fecha_baja || fecha <= i.fecha_baja);
      });
    };

    // 4. Sesiones y asistencia de los días que no tienen lista en la app. Con «sustituir», también los que ya la tienen,
    // si el Excel dice algo ese día (clase con marcas o palabra): su sesión se reescribe y sus marcas se cambian por las
    // del Excel. Un día vacío en el Excel nunca sustituye lo que hay en la app.
    const sesiones = sesionesPorClave_();
    const tratadas = {};   // fecha|grupo ya escritas en esta importación: si dos bloques van al mismo grupo, el primero manda
    const sustituir = {};  // fecha|grupo que se sustituyen
    trabajos.forEach(function (t) {
      if (!t.sustituir) return;
      t.b.fechas.forEach(function (x) {
        if (x.tipo !== 'vacia' && sesiones[x.fecha + '|' + t.grupoId]) sustituir[x.fecha + '|' + t.grupoId] = true;
      });
    });
    const yaHay = {};
    const borrarAsistencia = [];
    leerTabla_(HOJAS.ASISTENCIA).forEach(function (a) {
      if (sustituir[a.fecha + '|' + a.grupo_id]) { borrarAsistencia.push(a._fila); return; }
      yaHay[a.fecha + '|' + a.grupo_id + '|' + normalizarId_(a.usuario_id)] = true;
    });
    const filasSesion = [];
    const sesionesCambiadas = [];
    const filasAsistencia = [];
    trabajos.forEach(function (t) {
      const grupo = grupoPorId_(t.grupoId);
      const taller = nombreTaller_(grupo, talleres);
      const r = { grupo_id: t.grupoId, nombre: grupo.nombre, creado: !!t.creado, clases: 0, sinClase: 0, registros: 0, sinMarcar: 0, yaEnApp: 0,
        sustituidos: 0, hasta: t.b.fechas.length ? t.b.fechas[t.b.fechas.length - 1].fecha : '' };
      const ponerSesion = function (fecha, estado, nota) {
        const clave = fecha + '|' + t.grupoId;
        const fila = { fecha: fecha, grupo_id: t.grupoId, estado: estado, nota: nota, registrada_por: email, timestamp: ahora };
        if (sustituir[clave]) { fila._fila = sesiones[clave]._fila; sesionesCambiadas.push(fila); r.sustituidos++; }
        else filasSesion.push(fila);
      };
      t.b.fechas.forEach(function (x) {
        const clave = x.fecha + '|' + t.grupoId;
        if (tratadas[clave]) return;
        if (sesiones[clave] && !sustituir[clave]) { r.yaEnApp++; return; }
        if (x.tipo === 'vacia' && t.sinMarcas === 'dejar') return;
        tratadas[clave] = true;
        if (x.tipo !== 'clase') {
          const nota = x.tipo === 'palabra'
            ? String(t.notas[x.fecha] !== undefined ? t.notas[x.fecha] : x.nota).trim().substring(0, 200)
            : IMPORTAR_NOTA_SIN_MARCAS;
          ponerSesion(x.fecha, ESTADO_SESION.CANCELADA, nota);
          r.sinClase++;
          return;
        }
        ponerSesion(x.fecha, ESTADO_SESION.REALIZADA, '');
        r.clases++;
        t.b.usuarios.forEach(function (u) {
          if (!inscritoEl(t.grupoId, u.usuario_id, x.fecha)) return;
          const codigo = u.marcas[x.fecha];
          if (!codigo) { r.sinMarcar++; return; }
          const fila = filaAsistencia_(grupo, taller, x.fecha, u.usuario_id, codigo, '', email, ahora);
          if (yaHay[fila.clave]) return;
          yaHay[fila.clave] = true;
          filasAsistencia.push(fila);
          r.registros++;
        });
      });
      ['clases', 'sinClase', 'registros', 'sinMarcar', 'yaEnApp', 'sustituidos'].forEach(function (k) { res[k] = (res[k] || 0) + r[k]; });
      res.grupos.push(r);
    });
    actualizarFilas_(HOJAS.SESIONES, sesionesCambiadas);
    anadirFilas_(HOJAS.SESIONES, filasSesion);
    anadirFilas_(HOJAS.ASISTENCIA, filasAsistencia);
    borrarFilas_(HOJAS.ASISTENCIA, borrarAsistencia);   // al final: están por encima de las añadidas
    return res;
  });
}
