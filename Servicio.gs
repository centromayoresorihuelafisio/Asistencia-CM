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

// ---------- Nombres parecidos (posibles duplicados) ----------

/** Palabras de un nombre para comparar: sin tildes ni signos y sin «DE», «LA»… */
function palabrasNombre_(nombre) {
  return sinTildes_(nombre).replace(/[^A-Z0-9]+/g, ' ').trim().split(' ')
    .filter(function (p) { return p && NOMBRE_PALABRAS_IGNORADAS.indexOf(p) < 0; });
}

/** Distancia de edición entre dos palabras (letras que hay que cambiar, quitar o poner). */
function distanciaPalabras_(a, b) {
  let anterior = [];
  for (let j = 0; j <= b.length; j++) anterior.push(j);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    for (let j = 1; j <= b.length; j++) {
      actual.push(Math.min(anterior[j] + 1, actual[j - 1] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    }
    anterior = actual;
  }
  return anterior[b.length];
}

function palabrasParecidas_(a, b) {
  if (a === b) return true;
  return Math.min(a.length, b.length) >= NOMBRE_LONGITUD_ERRATA && Math.abs(a.length - b.length) <= 1 &&
    distanciaPalabras_(a, b) <= 1;
}

/**
 * Dos nombres se parecen si todas las palabras del más corto (al menos dos) están en el otro,
 * en cualquier orden y admitiendo una errata por palabra. Así se detectan el orden cambiado
 * («MARIA GARCIA LOPEZ»), la falta de un apellido («GARCIA MARIA») y las tildes o erratas.
 */
function nombresParecidos_(pa, pb) {
  const corto = pa.length <= pb.length ? pa : pb;
  const largo = corto === pa ? pb : pa;
  if (corto.length < 2) return false;
  const usadas = [];
  return corto.every(function (p) {
    for (let k = 0; k < largo.length; k++) {
      if (!usadas[k] && palabrasParecidas_(p, largo[k])) { usadas[k] = true; return true; }
    }
    return false;
  });
}

/** Índice de nombres por palabra, para no comparar cada nombre con todos los demás. */
function nuevoIndiceNombres_() {
  return {};
}

function anadirAIndiceNombres_(indice, usuario) {
  const palabras = palabrasNombre_(usuario.nombre);
  const entrada = { usuario_id: normalizarId_(usuario.usuario_id), nombre: usuario.nombre, activo: usuario.activo !== NO, palabras: palabras };
  palabras.forEach(function (p) {
    const lista = indice[p] = indice[p] || [];
    if (lista[lista.length - 1] !== entrada) lista.push(entrada);
  });
}

/**
 * Usuarios del índice con un nombre parecido y otro ID. Solo compara con los que comparten
 * al menos una palabra exacta. Devuelve [{ usuario_id, nombre, activo }].
 */
function parecidosEnIndice_(indice, usuarioId, nombre) {
  const palabras = palabrasNombre_(nombre);
  const id = normalizarId_(usuarioId);
  const vistos = {};
  const parecidos = [];
  palabras.forEach(function (p) {
    (indice[p] || []).forEach(function (e) {
      if (vistos[e.usuario_id] || e.usuario_id === id) return;
      vistos[e.usuario_id] = true;
      if (nombresParecidos_(palabras, e.palabras)) parecidos.push({ usuario_id: e.usuario_id, nombre: e.nombre, activo: e.activo });
    });
  });
  return parecidos.sort(compararNombres_);
}

/** Usuarios ya guardados con un nombre parecido a este y otro ID (como mucho MAX_PARECIDOS). */
function usuariosParecidos_(usuarioId, nombre) {
  const indice = nuevoIndiceNombres_();
  leerTabla_(HOJAS.USUARIOS).forEach(function (u) { if (u.usuario_id) anadirAIndiceNombres_(indice, u); });
  return parecidosEnIndice_(indice, usuarioId, nombre).slice(0, MAX_PARECIDOS);
}

function textoParecidos_(parecidos) {
  return parecidos.map(function (p) { return '«' + p.nombre + '» (ID ' + p.usuario_id + ')'; }).join(', ');
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
    diasPendientes: parseInt(o[CLAVES_CONFIG.DIAS_PENDIENTES], 10) || DIAS_PENDIENTES_POR_DEFECTO,
    faltasSeguidas: parseInt(o[CLAVES_CONFIG.FALTAS_SEGUIDAS], 10) || FALTAS_SEGUIDAS_POR_DEFECTO
  };
}

function estados_() {
  return leerTabla_(HOJAS.ESTADOS)
    .filter(function (e) { return e.codigo && e.activo !== NO; })
    .map(estadoParaCliente_);
}

function estadoParaCliente_(e) {
  return {
    codigo: e.codigo,
    etiqueta: e.etiqueta || e.codigo,
    tipo: e.tipo,
    color: e.color,
    letra: e.letra || String(e.etiqueta || e.codigo).charAt(0).toUpperCase(),
    activo: e.activo !== NO
  };
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
    inicioCurso: cfg.inicio,
    finCurso: cfg.fin,
    estados: estados_(),
    estadoPorDefecto: ESTADO_POR_DEFECTO,
    motivosBaja: valoresLista_(LISTA_MOTIVO_BAJA).filter(function (m) { return m !== MOTIVO_CAMBIO_GRUPO; }),
    obsRapidas: valoresLista_(LISTA_OBS_RAPIDA),
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
  const avisoFaltas = config_().faltasSeguidas;
  const canceladas = sesionesCanceladas_();
  const tipos = {};
  leerTabla_(HOJAS.ESTADOS).forEach(function (e) { tipos[e.codigo] = e.tipo; });
  const guardados = {};
  const anteriores = {};   // usuario_id → registros de este grupo anteriores a la fecha (sin los de sesiones canceladas)
  leerTabla_(HOJAS.ASISTENCIA).forEach(function (a) {
    if (a.grupo_id !== grupoId) return;
    const id = normalizarId_(a.usuario_id);
    if (a.fecha === fecha) {
      // Si la sesión está cancelada, se muestran las marcas que se conservan, por si se vuelve a guardar.
      if (sesion) guardados[id] = a;
    } else if (a.fecha < fecha && !canceladas[a.fecha + '|' + grupoId]) {
      (anteriores[id] = anteriores[id] || []).push({ fecha: a.fecha, tipo: tipos[a.estado] });
    }
  });

  const lista = inscritosEn_(grupoId, fecha).map(function (i) {
    const id = normalizarId_(i.usuario_id);
    const u = usuarios[id] || {};
    const g = guardados[id];
    const faltas = faltasSeguidas_(anteriores[id] || []);
    return {
      usuario_id: id,
      nombre: u.nombre || ('(ID ' + id + ' sin ficha)'),
      telefono: u.telefono || '',
      estado: g ? g.estado : ESTADO_POR_DEFECTO,
      observaciones: g ? g.observaciones : '',
      inscripcion_id: i.inscripcion_id,
      fecha_baja: i.fecha_baja,
      faltasSeguidas: faltas >= avisoFaltas ? faltas : 0
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

/**
 * Faltas seguidas más recientes: registros de tipo ausente desde el último presente.
 * Los neutros (evento, excursión…) ni suman ni cortan la racha.
 */
function faltasSeguidas_(registros) {
  const ordenados = registros.slice().sort(function (a, b) { return a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0; });
  let n = 0;
  for (let k = 0; k < ordenados.length; k++) {
    if (ordenados[k].tipo === TIPO_ESTADO.AUSENTE) n++;
    else if (ordenados[k].tipo === TIPO_ESTADO.PRESENTE) break;
  }
  return n;
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

/**
 * Regla 5: cancelar la sesión. Desde el 4-nov-2026 no se borra nada: las filas de Asistencia de esa sesión se
 * conservan (por si se canceló por error) y dejan de contar porque la sesión está cancelada (asistenciaQueCuenta_).
 */
function cancelarSesion_(monitora, grupoId, fecha, nota) {
  comprobarFecha_(fecha, 'de la clase');
  return conBloqueo_(function () {
    const grupo = grupoPorId_(grupoId);
    comprobarAccesoGrupo_(monitora, grupo);
    guardarFilaSesion_(grupoId, fecha, ESTADO_SESION.CANCELADA, String(nota || '').trim(), monitora.email, marcaDeTiempo_());
    return { cancelada: true };
  });
}

/** Claves fecha|grupo_id de las sesiones canceladas. */
function sesionesCanceladas_() {
  const canceladas = {};
  leerTabla_(HOJAS.SESIONES).forEach(function (s) {
    if (s.estado === ESTADO_SESION.CANCELADA) canceladas[s.fecha + '|' + s.grupo_id] = true;
  });
  return canceladas;
}

/**
 * Filas de Asistencia que cuentan: todas salvo las de sesiones canceladas (regla 5). Historial, informe, ficha
 * del usuario y faltas seguidas leen siempre de aquí.
 */
function asistenciaQueCuenta_() {
  const canceladas = sesionesCanceladas_();
  return leerTabla_(HOJAS.ASISTENCIA).filter(function (a) { return !canceladas[a.fecha + '|' + a.grupo_id]; });
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

/**
 * Todos los usuarios (ID y nombre, sin teléfonos) para buscar en el móvil al dar de alta sin esperar al servidor.
 */
function usuariosParaAlta_(monitora) {
  return leerTabla_(HOJAS.USUARIOS)
    .filter(function (u) { return normalizarId_(u.usuario_id); })
    .map(function (u) { return { usuario_id: normalizarId_(u.usuario_id), nombre: u.nombre }; })
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
    // Usuario nuevo con un nombre parecido a otro: no se crea hasta que la monitora lo confirme.
    if (creado && !datos.crear_aunque_parecido) {
      const parecidos = usuariosParecidos_(id, nombre);
      if (parecidos.length) return { parecidos: parecidos };
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
