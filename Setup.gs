/**
 * Setup.gs — Configuración inicial y validación de datos.
 * setup() se puede ejecutar varias veces: crea lo que falta y no toca lo que ya existe.
 */

function setup() {
  const admin = soloAdmin_();
  const libro = libro_();
  const informe = [];
  libro.setSpreadsheetTimeZone(ZONA_HORARIA);

  Object.keys(ESQUEMA).forEach(function (nombre) {
    informe.push(prepararHoja_(libro, nombre));
  });
  invalidarTodo_();

  sembrar_(HOJAS.MONITORAS, [{ email: correoPropietario_() || admin.email, nombre: 'Administración', rol: ROL.ADMIN, activa: SI }], informe);
  sembrar_(HOJAS.ESTADOS, DATOS_INICIALES.estados, informe);
  sembrar_(HOJAS.LISTAS, DATOS_INICIALES.listas, informe);
  sembrar_(HOJAS.CONFIG, DATOS_INICIALES.config.map(function (c) {
    return { clave: c.clave, valor: c.esFecha ? textoAFecha_(c.valor) : c.valor };
  }), informe);
  sembrar_(HOJAS.TALLERES, [DATOS_INICIALES.taller], informe);
  const grupo = Object.assign({}, DATOS_INICIALES.grupo, {
    monitoras: correoPropietario_() || admin.email,
    curso: DATOS_INICIALES.config[0].valor
  });
  sembrar_(HOJAS.GRUPOS, [grupo], informe);
  completarLetras_(informe);

  aplicarValidaciones_(libro);
  invalidarTodo_();
  informe.push('', 'Revisa la hoja Config (fechas de inicio y fin de curso) y rellena «Dias especiales» con los festivos.');
  return informe;
}

function prepararHoja_(libro, nombre) {
  const esquema = ESQUEMA[nombre];
  let h = libro.getSheetByName(nombre);
  const nueva = !h;
  if (nueva) h = libro.insertSheet(nombre);

  const ancho = esquema.columnas.length;
  const actual = h.getRange(1, 1, 1, ancho).getValues()[0].map(function (v) { return String(v).trim(); });
  const vacia = actual.every(function (v) { return v === ''; });
  if (vacia) {
    h.getRange(1, 1, 1, ancho).setValues([esquema.columnas]).setFontWeight('bold');
  } else if (!completarCabeceras_(h, nombre)) {
    return 'AVISO: la hoja «' + nombre + '» tiene otras cabeceras. No se ha modificado; revísala a mano.';
  }
  h.setFrozenRows(1);

  const filas = Math.max(h.getMaxRows() - 1, 1);
  esquema.columnas.forEach(function (c, i) {
    const rango = h.getRange(2, i + 1, filas, 1);
    if ((esquema.texto || []).indexOf(c) >= 0) rango.setNumberFormat('@');
    else if ((esquema.fecha || []).indexOf(c) >= 0) rango.setNumberFormat('dd/mm/yyyy');
    else if ((esquema.fechaHora || []).indexOf(c) >= 0) rango.setNumberFormat('dd/mm/yyyy hh:mm:ss');
  });
  return (nueva ? 'Creada' : 'Revisada') + ' la hoja «' + nombre + '».';
}

/**
 * Si una hoja tiene las cabeceras de una versión anterior (las primeras columnas iguales y el resto vacío),
 * añade las columnas nuevas al final. Devuelve false si las cabeceras no cuadran.
 */
function completarCabeceras_(h, nombre) {
  const columnas = ESQUEMA[nombre].columnas;
  const actual = h.getRange(1, 1, 1, columnas.length).getValues()[0].map(function (v) { return String(v).trim(); });
  for (let i = 0; i < columnas.length; i++) {
    if (actual[i] === columnas[i]) continue;
    if (actual.slice(i).some(function (v) { return v !== ''; })) return false;
    h.getRange(1, i + 1, 1, columnas.length - i).setValues([columnas.slice(i)]).setFontWeight('bold');
    return true;
  }
  return true;
}

/** Rellena la letra de los estados iniciales que no la tengan (hojas creadas antes del 3-nov-2026). */
function completarLetras_(informe) {
  const porCodigo = {};
  DATOS_INICIALES.estados.forEach(function (e) { porCodigo[e.codigo] = e.letra; });
  const cambiar = leerHoja_(HOJAS.ESTADOS).filter(function (e) { return !e.letra && porCodigo[e.codigo]; });
  cambiar.forEach(function (e) { e.letra = porCodigo[e.codigo]; });
  actualizarFilas_(HOJAS.ESTADOS, cambiar);
  if (cambiar.length) informe.push('Añadida la letra del historial a ' + cambiar.length + ' estados.');
}

/** Añade filas iniciales solo si la hoja no tiene datos. */
function sembrar_(nombre, objetos, informe) {
  if (leerHoja_(nombre).length) return;
  anadirFilas_(nombre, objetos);
  informe.push('Datos iniciales añadidos en «' + nombre + '».');
}

function columnaDe_(nombre, columna) {
  return ESQUEMA[nombre].columnas.indexOf(columna) + 1;
}

function rangoColumna_(libro, nombre, columna) {
  const h = libro.getSheetByName(nombre);
  return h.getRange(2, columnaDe_(nombre, columna), Math.max(h.getMaxRows() - 1, 1), 1);
}

function aplicarValidaciones_(libro) {
  const lista = function (valores) {
    return SpreadsheetApp.newDataValidation().requireValueInList(valores, true).setAllowInvalid(false).build();
  };
  const enRango = function (nombre, columna) {
    const h = libro.getSheetByName(nombre);
    const rango = h.getRange(2, columnaDe_(nombre, columna), Math.max(h.getMaxRows() - 1, 1), 1);
    return SpreadsheetApp.newDataValidation().requireValueInRange(rango, true).setAllowInvalid(false).build();
  };
  const siNo = lista([SI, NO]);

  rangoColumna_(libro, HOJAS.MONITORAS, 'activa').setDataValidation(siNo);
  rangoColumna_(libro, HOJAS.MONITORAS, 'rol').setDataValidation(lista([ROL.ADMIN, ROL.MONITORA]));
  rangoColumna_(libro, HOJAS.TALLERES, 'activo').setDataValidation(siNo);
  rangoColumna_(libro, HOJAS.GRUPOS, 'activo').setDataValidation(siNo);
  rangoColumna_(libro, HOJAS.GRUPOS, 'taller_id').setDataValidation(enRango(HOJAS.TALLERES, 'taller_id'));
  rangoColumna_(libro, HOJAS.USUARIOS, 'activo').setDataValidation(siNo);
  rangoColumna_(libro, HOJAS.ESTADOS, 'activo').setDataValidation(siNo);
  rangoColumna_(libro, HOJAS.ESTADOS, 'tipo').setDataValidation(
    lista([TIPO_ESTADO.PRESENTE, TIPO_ESTADO.AUSENTE, TIPO_ESTADO.NEUTRO]));
  rangoColumna_(libro, HOJAS.SESIONES, 'estado').setDataValidation(
    lista([ESTADO_SESION.REALIZADA, ESTADO_SESION.CANCELADA]));
  rangoColumna_(libro, HOJAS.ASISTENCIA, 'estado').setDataValidation(enRango(HOJAS.ESTADOS, 'codigo'));

  aplicarValidacionesListas_(libro);
  rangoColumna_(libro, HOJAS.DIAS_ESPECIALES, 'grupo_id').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInRange(
      rangoColumna_(libro, HOJAS.GRUPOS, 'grupo_id'), true).setAllowInvalid(false).build());
}

/** Validaciones de las columnas que dependen de la hoja Listas. Se repiten cada vez que cambia una lista. */
function aplicarValidacionesListas_(libro) {
  const lista = function (valores) {
    return SpreadsheetApp.newDataValidation().requireValueInList(valores, true).setAllowInvalid(false).build();
  };
  invalidar_(HOJAS.LISTAS);
  const motivos = valoresLista_(LISTA_MOTIVO_BAJA);
  if (motivos.length) rangoColumna_(libro, HOJAS.INSCRIPCIONES, 'motivo_baja').setDataValidation(lista(motivos));
  const tiposDia = valoresLista_(LISTA_TIPO_DIA);
  if (tiposDia.length) rangoColumna_(libro, HOJAS.DIAS_ESPECIALES, 'tipo').setDataValidation(lista(tiposDia));
}

/** Revisa la coherencia de los datos. Devuelve una lista de avisos en español. */
function validarDatos() {
  soloAdmin_();
  invalidarTodo_();
  const avisos = [];
  const fila = function (f) { return ' (fila ' + f._fila + ')'; };

  const cfg = config_();
  if (!cfg.inicio || !cfg.fin) avisos.push('Config: faltan o no son válidas las fechas de inicio o fin de curso.');
  else if (cfg.inicio > cfg.fin) avisos.push('Config: el inicio de curso es posterior al fin.');

  const estados = leerTabla_(HOJAS.ESTADOS);
  const codigos = {};
  estados.forEach(function (e) {
    if (codigos[e.codigo]) avisos.push('Estados: el código «' + e.codigo + '» está repetido' + fila(e));
    codigos[e.codigo] = true;
    if ([TIPO_ESTADO.PRESENTE, TIPO_ESTADO.AUSENTE, TIPO_ESTADO.NEUTRO].indexOf(e.tipo) < 0) {
      avisos.push('Estados: el tipo de «' + e.codigo + '» debe ser presente, ausente o neutro' + fila(e));
    }
  });
  if (!estados.some(function (e) { return e.codigo === ESTADO_POR_DEFECTO && e.activo !== NO; })) {
    avisos.push('Estados: falta el estado por defecto «' + ESTADO_POR_DEFECTO + '» (o está desactivado).');
  }

  const talleres = talleresPorId_();
  const grupos = {};
  leerTabla_(HOJAS.GRUPOS).forEach(function (g) {
    if (grupos[g.grupo_id]) avisos.push('Grupos: «' + g.grupo_id + '» está repetido' + fila(g));
    grupos[g.grupo_id] = g;
    if (!talleres[g.taller_id]) avisos.push('Grupos: el taller «' + g.taller_id + '» de «' + g.grupo_id + '» no existe' + fila(g));
    const dias = diasDeGrupo_(g);
    if (!dias.length) avisos.push('Grupos: «' + g.grupo_id + '» no tiene días de clase' + fila(g));
    dias.forEach(function (d) {
      if (LETRAS_DIAS.indexOf(d) < 0) avisos.push('Grupos: «' + d + '» no es un día válido en «' + g.grupo_id + '» (usa L,M,X,J,V,S,D)' + fila(g));
    });
    if (!correosDeGrupo_(g).length && g.activo !== NO) avisos.push('Grupos: «' + g.grupo_id + '» no tiene monitora' + fila(g));
  });

  const usuarios = {};
  leerTabla_(HOJAS.USUARIOS).forEach(function (u) {
    const id = normalizarId_(u.usuario_id);
    if (!id) avisos.push('Usuarios: hay un usuario sin ID' + fila(u));
    else if (usuarios[id]) avisos.push('Usuarios: el ID ' + id + ' está repetido' + fila(u));
    usuarios[id] = true;
    if (u.nombre !== normalizarNombre_(u.nombre)) avisos.push('Usuarios: el nombre del ID ' + id + ' tiene minúsculas o espacios de más' + fila(u));
  });

  const porUsuarioGrupo = {};
  leerTabla_(HOJAS.INSCRIPCIONES).forEach(function (i) {
    const id = normalizarId_(i.usuario_id);
    if (!usuarios[id]) avisos.push('Inscripciones: el usuario ' + id + ' no existe en Usuarios' + fila(i));
    if (!grupos[i.grupo_id]) avisos.push('Inscripciones: el grupo «' + i.grupo_id + '» no existe' + fila(i));
    if (!i.fecha_alta) avisos.push('Inscripciones: falta la fecha de alta' + fila(i));
    if (i.fecha_baja && i.fecha_baja < i.fecha_alta) avisos.push('Inscripciones: la baja es anterior al alta' + fila(i));
    const clave = id + '|' + i.grupo_id;
    (porUsuarioGrupo[clave] = porUsuarioGrupo[clave] || []).push(i);
  });
  Object.keys(porUsuarioGrupo).forEach(function (clave) {
    const lista = porUsuarioGrupo[clave].slice().sort(function (a, b) { return a.fecha_alta < b.fecha_alta ? -1 : 1; });
    for (let k = 1; k < lista.length; k++) {
      const anterior = lista[k - 1];
      if (!anterior.fecha_baja || anterior.fecha_baja >= lista[k].fecha_alta) {
        avisos.push('Inscripciones: el usuario ' + clave.split('|')[0] + ' tiene dos inscripciones solapadas en «' +
          clave.split('|')[1] + '»' + fila(lista[k]));
      }
    }
  });

  leerTabla_(HOJAS.DIAS_ESPECIALES).forEach(function (d) {
    if (!esFechaValida_(d.fecha)) avisos.push('Dias especiales: fecha no válida' + fila(d));
    if (d.grupo_id && !grupos[d.grupo_id]) avisos.push('Dias especiales: el grupo «' + d.grupo_id + '» no existe' + fila(d));
  });

  return avisos;
}
