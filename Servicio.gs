/**
 * Servicio.gs — Reglas de negocio (sección 6 de CLAUDE.md).
 * No toca las hojas directamente: usa siempre Repo.gs.
 */

// ---------- Normalización ----------

function normalizarId_(id) {
  return celdaATexto_(id).replace(/\s+/g, '').toUpperCase();
}

function normalizarNombre_(nombre) {
  return celdaATexto_(nombre).toUpperCase().replace(/\s+/g, ' ').trim();
}

function normalizarTelefono_(telefono) {
  return celdaATexto_(telefono).replace(/\s+/g, '');
}

/** Para buscar: mayúsculas y sin tildes. */
function sinTildes_(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

function comprobarFecha_(texto, queFecha) {
  if (!esFechaValida_(texto)) throw errorApp_('La fecha ' + queFecha + ' no es válida.');
}

function compararNombres_(a, b) {
  return a.nombre.localeCompare(b.nombre, 'es');
}

// ---------- Catálogos ----------

function config_() {
  const o = {};
  leerTabla_(HOJAS.CONFIG).forEach(function (f) { o[f.clave] = f.valor; });
  return {
    curso: o[CLAVES_CONFIG.CURSO] || '',
    inicio: esFechaValida_(o[CLAVES_CONFIG.INICIO]) ? o[CLAVES_CONFIG.INICIO] : '',
    fin: esFechaValida_(o[CLAVES_CONFIG.FIN]) ? o[CLAVES_CONFIG.FIN] : '',
    diasPendientes: parseInt(o[CLAVES_CONFIG.DIAS_PENDIENTES], 10) || DIAS_PENDIENTES_POR_DEFECTO
  };
}

function estados_() {
  return leerTabla_(HOJAS.ESTADOS)
    .filter(function (e) { return e.codigo && e.activo !== NO; })
    .map(function (e) { return { codigo: e.codigo, etiqueta: e.etiqueta || e.codigo, tipo: e.tipo, color: e.color }; });
}

function valoresLista_(lista) {
  return leerTabla_(HOJAS.LISTAS)
    .filter(function (l) { return l.lista === lista && l.valor; })
    .map(function (l) { return l.valor; });
}

function talleresPorId_() {
  const mapa = {};
  leerTabla_(HOJAS.TALLERES).forEach(function (t) { mapa[t.taller_id] = t; });
  return mapa;
}

function grupoPorId_(grupoId) {
  return leerTabla_(HOJAS.GRUPOS).find(function (g) { return g.grupo_id === grupoId; }) || null;
}

function usuariosPorId_() {
  const mapa = {};
  leerTabla_(HOJAS.USUARIOS).forEach(function (u) { mapa[normalizarId_(u.usuario_id)] = u; });
  return mapa;
}

function gruposAccesibles_(monitora) {
  return leerTabla_(HOJAS.GRUPOS).filter(function (g) {
    return g.grupo_id && g.activo !== NO && puedeGrupo_(monitora, g);
  });
}

function diasDeGrupo_(grupo) {
  return String(grupo.dias || '').toUpperCase().split(/[,;\s]+/).filter(Boolean);
}

function nombreTaller_(grupo, talleres) {
  const t = talleres[grupo.taller_id];
  return t ? (t.nombre || t.taller_id) : (grupo.taller_id || '');
}

/** Resumen de un grupo para el cliente (sin datos personales). */
function grupoParaCliente_(grupo, talleres) {
  return {
    grupo_id: grupo.grupo_id,
    nombre: grupo.nombre || grupo.grupo_id,
    taller_id: grupo.taller_id,
    taller: nombreTaller_(grupo, talleres),
    dias: diasDeGrupo_(grupo).join(','),
    hora: grupo.hora
  };
}

// ---------- Reglas de fechas ----------

/** Día especial (sin clase) que afecta a ese grupo en esa fecha, o null. */
function diaEspecial_(grupoId, fecha) {
  const d = leerTabla_(HOJAS.DIAS_ESPECIALES).find(function (x) {
    return x.fecha === fecha && (!x.grupo_id || x.grupo_id === grupoId);
  });
  return d ? { tipo: d.tipo, descripcion: d.descripcion } : null;
}

function tocaClase_(grupo, fecha) {
  return diasDeGrupo_(grupo).indexOf(letraDia_(fecha)) >= 0;
}

/** Regla 2: sesión esperada. */
function sesionEsperada_(grupo, fecha, cfg) {
  if (!tocaClase_(grupo, fecha)) return false;
  if (cfg.inicio && fecha < cfg.inicio) return false;
  if (cfg.fin && fecha > cfg.fin) return false;
  return !diaEspecial_(grupo.grupo_id, fecha);
}

/** Regla 1: inscripciones de un grupo vigentes en una fecha. */
function inscritosEn_(grupoId, fecha) {
  return leerTabla_(HOJAS.INSCRIPCIONES).filter(function (i) {
    return i.grupo_id === grupoId && i.fecha_alta && i.fecha_alta <= fecha && (!i.fecha_baja || fecha <= i.fecha_baja);
  });
}

/** Regla 7: ¿se solapa una inscripción nueva [alta, sin fin) con otra del mismo usuario y grupo? */
function haySolape_(usuarioId, grupoId, alta, exceptoId) {
  return leerTabla_(HOJAS.INSCRIPCIONES).some(function (i) {
    return normalizarId_(i.usuario_id) === usuarioId && i.grupo_id === grupoId && i.inscripcion_id !== exceptoId &&
      (!i.fecha_baja || i.fecha_baja >= alta);
  });
}

function sesionesPorClave_() {
  const mapa = {};
  leerTabla_(HOJAS.SESIONES).forEach(function (s) { mapa[s.fecha + '|' + s.grupo_id] = s; });
  return mapa;
}

// ---------- Casos de uso ----------

function datosIniciales_(monitora) {
  const talleres = talleresPorId_();
  const cfg = config_();
  return {
    monitora: monitora,
    hoy: hoy_(),
    curso: cfg.curso,
    estados: estados_(),
    estadoPorDefecto: ESTADO_POR_DEFECTO,
    motivosBaja: valoresLista_(LISTA_MOTIVO_BAJA).filter(function (m) { return m !== MOTIVO_CAMBIO_GRUPO; }),
    grupos: gruposAccesibles_(monitora).map(function (g) { return grupoParaCliente_(g, talleres); })
      .sort(function (a, b) { return (a.taller + a.nombre).localeCompare(b.taller + b.nombre, 'es'); })
  };
}

function datosInicio_(monitora, fecha) {
  comprobarFecha_(fecha, 'elegida');
  const cfg = config_();
  const hoy = hoy_();
  const talleres = talleresPorId_();
  const grupos = gruposAccesibles_(monitora);
  const sesiones = sesionesPorClave_();

  // Regla 3: pendientes de los últimos días, sin contar hoy.
  const pendientes = [];
  let desde = sumarDias_(hoy, -cfg.diasPendientes);
  if (cfg.inicio && desde < cfg.inicio) desde = cfg.inicio;
  for (let f = desde; f < hoy; f = sumarDias_(f, 1)) {
    grupos.forEach(function (g) {
      if (sesionEsperada_(g, f, cfg) && !sesiones[f + '|' + g.grupo_id]) {
        const c = grupoParaCliente_(g, talleres);
        c.fecha = f;
        pendientes.push(c);
      }
    });
  }

  const delDia = grupos.filter(function (g) { return tocaClase_(g, fecha) || sesiones[fecha + '|' + g.grupo_id]; })
    .map(function (g) {
      const c = grupoParaCliente_(g, talleres);
      const s = sesiones[fecha + '|' + g.grupo_id];
      c.inscritos = inscritosEn_(g.grupo_id, fecha).length;
      c.estadoSesion = s ? s.estado : 'pendiente';
      c.diaEspecial = diaEspecial_(g.grupo_id, fecha);
      return c;
    })
    .sort(function (a, b) { return (a.taller + a.hora + a.nombre).localeCompare(b.taller + b.hora + b.nombre, 'es'); });

  return { fecha: fecha, hoy: hoy, pendientes: pendientes, grupos: delDia };
}

function datosSesion_(monitora, grupoId, fecha) {
  comprobarFecha_(fecha, 'de la clase');
  const grupo = grupoPorId_(grupoId);
  comprobarAccesoGrupo_(monitora, grupo);
  if (fecha > hoy_()) throw errorApp_('No se puede pasar lista de un día que todavía no ha llegado.');

  const usuarios = usuariosPorId_();
  const sesion = sesionesPorClave_()[fecha + '|' + grupoId] || null;
  const guardados = {};
  if (sesion && sesion.estado === ESTADO_SESION.REALIZADA) {
    leerTabla_(HOJAS.ASISTENCIA).forEach(function (a) {
      if (a.fecha === fecha && a.grupo_id === grupoId) guardados[normalizarId_(a.usuario_id)] = a;
    });
  }

  const lista = inscritosEn_(grupoId, fecha).map(function (i) {
    const id = normalizarId_(i.usuario_id);
    const u = usuarios[id] || {};
    const g = guardados[id];
    return {
      usuario_id: id,
      nombre: u.nombre || ('(ID ' + id + ' sin ficha)'),
      telefono: u.telefono || '',
      estado: g ? g.estado : ESTADO_POR_DEFECTO,
      observaciones: g ? g.observaciones : ''
    };
  }).sort(compararNombres_);

  return {
    grupo: grupoParaCliente_(grupo, talleresPorId_()),
    fecha: fecha,
    sesion: sesion ? { estado: sesion.estado, nota: sesion.nota, registrada_por: sesion.registrada_por, timestamp: sesion.timestamp } : null,
    diaEspecial: diaEspecial_(grupoId, fecha),
    usuarios: lista
  };
}

/** Regla 4: guardar la sesión. */
function guardarSesion_(monitora, payload) {
  if (!payload || typeof payload !== 'object') throw errorApp_('No se han recibido datos para guardar.');
  const grupoId = String(payload.grupo_id || '');
  const fecha = String(payload.fecha || '');
  comprobarFecha_(fecha, 'de la clase');
  if (fecha > hoy_()) throw errorApp_('No se puede guardar la lista de un día que todavía no ha llegado.');
  if (!Array.isArray(payload.registros)) throw errorApp_('La lista recibida no es válida.');

  return conBloqueo_(function () {
    const grupo = grupoPorId_(grupoId);
    comprobarAccesoGrupo_(monitora, grupo);

    const codigos = estados_().map(function (e) { return e.codigo; });
    const recibidos = {};
    payload.registros.forEach(function (r) {
      const id = normalizarId_(r && r.usuario_id);
      if (!id) throw errorApp_('Hay un usuario sin ID en la lista.');
      if (recibidos[id]) throw errorApp_('El usuario con ID ' + id + ' aparece dos veces en la lista.');
      if (codigos.indexOf(r.estado) < 0) throw errorApp_('El estado «' + r.estado + '» no existe en la hoja Estados.');
      recibidos[id] = { estado: r.estado, observaciones: String(r.observaciones || '').trim() };
    });

    const inscritos = inscritosEn_(grupoId, fecha).map(function (i) { return normalizarId_(i.usuario_id); });
    const cuadra = inscritos.length === Object.keys(recibidos).length &&
      inscritos.every(function (id) { return recibidos[id]; });
    if (!cuadra) {
      throw errorApp_('La lista de usuarios del grupo ha cambiado (alguien ha dado un alta o una baja). Vuelve a abrir el pase de lista; tus marcas se conservan en el borrador.');
    }

    const talleres = talleresPorId_();
    const taller = nombreTaller_(grupo, talleres);
    const nombreGrupo = grupo.nombre || grupo.grupo_id;
    const ahora = marcaDeTiempo_();

    const existentes = {};
    const sobrantes = [];
    leerTabla_(HOJAS.ASISTENCIA).forEach(function (a) {
      if (a.fecha !== fecha || a.grupo_id !== grupoId) return;
      const id = normalizarId_(a.usuario_id);
      if (recibidos[id] && !existentes[id]) existentes[id] = a;
      else sobrantes.push(a._fila);
    });

    const actualizar = [];
    const nuevas = [];
    Object.keys(recibidos).forEach(function (id) {
      const fila = {
        clave: fecha + '|' + grupoId + '|' + id,
        fecha: fecha,
        grupo_id: grupoId,
        usuario_id: id,
        estado: recibidos[id].estado,
        taller: taller,
        grupo: nombreGrupo,
        mes: fecha.substring(0, 7),
        observaciones: recibidos[id].observaciones,
        registrada_por: monitora.email,
        timestamp: ahora
      };
      if (existentes[id]) { fila._fila = existentes[id]._fila; actualizar.push(fila); } else nuevas.push(fila);
    });
    actualizarFilas_(HOJAS.ASISTENCIA, actualizar);
    anadirFilas_(HOJAS.ASISTENCIA, nuevas);
    // Se borra al final: las filas sobrantes están por encima de las añadidas y no se descolocan.
    borrarFilas_(HOJAS.ASISTENCIA, sobrantes);

    guardarFilaSesion_(grupoId, fecha, ESTADO_SESION.REALIZADA, String(payload.nota || '').trim(), monitora.email, ahora);
    return { guardados: Object.keys(recibidos).length };
  });
}

function guardarFilaSesion_(grupoId, fecha, estado, nota, email, ahora) {
  const existente = leerTabla_(HOJAS.SESIONES).find(function (s) { return s.fecha === fecha && s.grupo_id === grupoId; });
  const fila = { fecha: fecha, grupo_id: grupoId, estado: estado, nota: nota, registrada_por: email, timestamp: ahora };
  if (existente) {
    fila._fila = existente._fila;
    actualizarFilas_(HOJAS.SESIONES, [fila]);
  } else {
    anadirFilas_(HOJAS.SESIONES, [fila]);
  }
}

/** Regla 5: cancelar la sesión. */
function cancelarSesion_(monitora, grupoId, fecha, nota) {
  comprobarFecha_(fecha, 'de la clase');
  return conBloqueo_(function () {
    const grupo = grupoPorId_(grupoId);
    comprobarAccesoGrupo_(monitora, grupo);
    const filas = leerTabla_(HOJAS.ASISTENCIA)
      .filter(function (a) { return a.fecha === fecha && a.grupo_id === grupoId; })
      .map(function (a) { return a._fila; });
    guardarFilaSesion_(grupoId, fecha, ESTADO_SESION.CANCELADA, String(nota || '').trim(), monitora.email, marcaDeTiempo_());
    borrarFilas_(HOJAS.ASISTENCIA, filas);
    return { borrados: filas.length };
  });
}

function datosGrupo_(monitora, grupoId) {
  const grupo = grupoPorId_(grupoId);
  comprobarAccesoGrupo_(monitora, grupo);
  const hoy = hoy_();
  const usuarios = usuariosPorId_();
  const talleres = talleresPorId_();
  const cfg = config_();

  const inscritos = leerTabla_(HOJAS.INSCRIPCIONES)
    .filter(function (i) { return i.grupo_id === grupoId && (!i.fecha_baja || i.fecha_baja >= hoy); })
    .map(function (i) {
      const id = normalizarId_(i.usuario_id);
      const u = usuarios[id] || {};
      return {
        inscripcion_id: i.inscripcion_id,
        usuario_id: id,
        nombre: u.nombre || ('(ID ' + id + ' sin ficha)'),
        telefono: u.telefono || '',
        fecha_alta: i.fecha_alta,
        fecha_baja: i.fecha_baja
      };
    }).sort(compararNombres_);

  const destinos = leerTabla_(HOJAS.GRUPOS)
    .filter(function (g) { return g.grupo_id && g.grupo_id !== grupoId && g.activo !== NO && (!cfg.curso || !g.curso || g.curso === cfg.curso); })
    .map(function (g) { return grupoParaCliente_(g, talleres); })
    .sort(function (a, b) { return (a.taller + a.nombre).localeCompare(b.taller + b.nombre, 'es'); });

  return { grupo: grupoParaCliente_(grupo, talleres), inscritos: inscritos, destinos: destinos };
}

function buscarUsuarios_(monitora, texto, grupoId) {
  const t = sinTildes_(texto).replace(/\s+/g, ' ').trim();
  if (t.length < 2) return [];
  const yaInscritos = {};
  if (grupoId) {
    const hoy = hoy_();
    leerTabla_(HOJAS.INSCRIPCIONES).forEach(function (i) {
      if (i.grupo_id === grupoId && (!i.fecha_baja || i.fecha_baja >= hoy)) yaInscritos[normalizarId_(i.usuario_id)] = true;
    });
  }
  const tId = t.replace(/\s+/g, '');
  return leerTabla_(HOJAS.USUARIOS)
    .filter(function (u) {
      const id = normalizarId_(u.usuario_id);
      return id && (id.indexOf(tId) === 0 || sinTildes_(u.nombre).indexOf(t) >= 0);
    })
    .slice(0, 25)
    .map(function (u) {
      const id = normalizarId_(u.usuario_id);
      return { usuario_id: id, nombre: u.nombre, enGrupo: !!yaInscritos[id] };
    })
    .sort(compararNombres_);
}

/** Regla 6 y 7: crea el usuario si no existe e inscribe en el grupo. */
function altaUsuario_(monitora, grupoId, datos) {
  datos = datos || {};
  const id = normalizarId_(datos.usuario_id);
  const fechaAlta = String(datos.fecha_alta || hoy_());
  if (!id) throw errorApp_('Falta el ID del usuario.');
  comprobarFecha_(fechaAlta, 'de alta');

  return conBloqueo_(function () {
    const grupo = grupoPorId_(grupoId);
    comprobarAccesoGrupo_(monitora, grupo);

    const existente = usuariosPorId_()[id];
    const creado = !existente;
    const nombre = existente ? existente.nombre : normalizarNombre_(datos.nombre);
    if (!nombre) throw errorApp_('No existe ningún usuario con el ID ' + id + '. Escribe su nombre para crearlo.');
    if (existente && haySolape_(id, grupoId, fechaAlta, null)) {
      throw errorApp_(nombre + ' ya está inscrito/a en este grupo en esas fechas.');
    }

    if (creado) {
      anadirFilas_(HOJAS.USUARIOS, [{ usuario_id: id, nombre: nombre, telefono: normalizarTelefono_(datos.telefono), activo: SI }]);
    } else if (existente.activo === NO) {
      existente.activo = SI;
      actualizarFilas_(HOJAS.USUARIOS, [existente]);
    }
    anadirFilas_(HOJAS.INSCRIPCIONES, [{
      inscripcion_id: nuevoId_(), usuario_id: id, grupo_id: grupoId,
      fecha_alta: fechaAlta, fecha_baja: '', motivo_baja: ''
    }]);
    return { creado: creado, nombre: nombre };
  });
}

function inscripcionPorId_(inscripcionId) {
  return leerTabla_(HOJAS.INSCRIPCIONES).find(function (i) { return i.inscripcion_id === inscripcionId; }) || null;
}

function baja_(monitora, inscripcionId, fechaBaja, motivo) {
  comprobarFecha_(fechaBaja, 'de baja');
  if (valoresLista_(LISTA_MOTIVO_BAJA).indexOf(motivo) < 0 || motivo === MOTIVO_CAMBIO_GRUPO) {
    throw errorApp_('Elige un motivo de baja de la lista.');
  }
  return conBloqueo_(function () {
    const insc = inscripcionPorId_(inscripcionId);
    if (!insc) throw errorApp_('No se encuentra esa inscripción. Vuelve a abrir el grupo.');
    comprobarAccesoGrupo_(monitora, grupoPorId_(insc.grupo_id));
    if (insc.fecha_baja) throw errorApp_('Este usuario ya tiene una baja en este grupo.');
    if (fechaBaja < insc.fecha_alta) throw errorApp_('La fecha de baja no puede ser anterior a la de alta.');
    insc.fecha_baja = fechaBaja;
    insc.motivo_baja = motivo;
    actualizarFilas_(HOJAS.INSCRIPCIONES, [insc]);
    return { ok: true };
  });
}

/** Regla 8: cambio de grupo. */
function cambiarGrupo_(monitora, inscripcionId, grupoDestino, fecha) {
  comprobarFecha_(fecha, 'del cambio');
  return conBloqueo_(function () {
    const insc = inscripcionPorId_(inscripcionId);
    if (!insc) throw errorApp_('No se encuentra esa inscripción. Vuelve a abrir el grupo.');
    comprobarAccesoGrupo_(monitora, grupoPorId_(insc.grupo_id));
    if (insc.fecha_baja) throw errorApp_('Este usuario ya tiene una baja en este grupo.');
    const destino = grupoPorId_(grupoDestino);
    if (!destino || destino.activo === NO) throw errorApp_('El grupo de destino no existe o no está activo.');
    if (destino.grupo_id === insc.grupo_id) throw errorApp_('El grupo de destino es el mismo que el de origen.');

    const ultimoDia = sumarDias_(fecha, -1);
    if (ultimoDia < insc.fecha_alta) throw errorApp_('La fecha del cambio tiene que ser posterior a la fecha de alta en el grupo actual.');
    const id = normalizarId_(insc.usuario_id);
    if (haySolape_(id, destino.grupo_id, fecha, null)) throw errorApp_('Este usuario ya está inscrito en el grupo de destino.');

    insc.fecha_baja = ultimoDia;
    insc.motivo_baja = MOTIVO_CAMBIO_GRUPO;
    actualizarFilas_(HOJAS.INSCRIPCIONES, [insc]);
    anadirFilas_(HOJAS.INSCRIPCIONES, [{
      inscripcion_id: nuevoId_(), usuario_id: id, grupo_id: destino.grupo_id,
      fecha_alta: fecha, fecha_baja: '', motivo_baja: ''
    }]);
    return { ok: true };
  });
}
