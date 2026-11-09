/**
 * Admin.gs — Pestañas «Gestión» y «Configuración» de la app (separadas el 6-nov-2026).
 * - Gestión, para todas: grupos y talleres, usuarios y días libres. Cada monitora, con lo suyo (sus grupos, los
 *   usuarios de sus grupos y los días libres de sus grupos); el admin, todo.
 * - Configuración, solo admin: curso y trimestres, periodos no lectivos (días libres de todos los grupos), estados,
 *   listas y monitoras con sus claves.
 * Así casi nunca hace falta tocar la hoja de cálculo a mano.
 * Este archivo solo define funciones (nada a nivel superior que dependa de otros archivos).
 */

function comprobarAdmin_(monitora) {
  if (monitora.rol !== ROL.ADMIN) throw errorApp_('Solo la persona administradora puede hacer esto.');
}

/** Texto en mayúsculas, sin tildes y con guiones: «Yoga silla» → «YOGA-SILLA». */
function aIdentificador_(texto) {
  return sinTildes_(texto).replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 30) || 'GRUPO';
}

/** Identificador que no esté ya en la lista (añade -2, -3… si hace falta). */
function identificadorLibre_(base, existentes) {
  let id = base;
  for (let n = 2; existentes.indexOf(id) >= 0; n++) id = base + '-' + n;
  return id;
}

function ordenarDias_(dias) {
  return ORDEN_DIAS.filter(function (d) { return dias.indexOf(d) >= 0; });
}

function esAdmin_(monitora) {
  return monitora.rol === ROL.ADMIN;
}

/**
 * Usuarios «de» una monitora: los que tienen o han tenido alguna inscripción en uno de sus grupos.
 * Son los únicos de los que ve la ficha y el teléfono y cuyos datos puede cambiar (regla 9). Devuelve un mapa
 * { usuario_id: true }, o null si es admin (lo ve todo).
 */
function usuariosDeMonitora_(monitora) {
  if (esAdmin_(monitora)) return null;
  const suyos = {};
  leerTabla_(HOJAS.GRUPOS).forEach(function (g) { if (g.grupo_id && puedeGrupo_(monitora, g)) suyos[g.grupo_id] = true; });
  const mapa = {};
  leerTabla_(HOJAS.INSCRIPCIONES).forEach(function (i) { if (suyos[i.grupo_id]) mapa[normalizarId_(i.usuario_id)] = true; });
  return mapa;
}

function comprobarUsuarioDeMonitora_(monitora, usuarioId) {
  const suyos = usuariosDeMonitora_(monitora);
  if (suyos && !suyos[usuarioId]) throw errorApp_('Este usuario no está en ninguno de tus grupos.');
}

/** Días libres para el cliente, por fecha. */
function diasParaCliente_(filas) {
  return filas
    .filter(function (d) { return esFechaValida_(d.fecha); })
    .map(function (d) { return { fecha: d.fecha, tipo: d.tipo, descripcion: d.descripcion, grupo_id: d.grupo_id || '' }; })
    .sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });
}

// ---------- Datos de la pestaña Gestión (todas, cada una con lo suyo) ----------

function datosGestion_(monitora) {
  const talleres = talleresPorId_();
  const admin = esAdmin_(monitora);
  const grupos = leerTabla_(HOJAS.GRUPOS).filter(function (g) { return g.grupo_id && puedeGrupo_(monitora, g); });
  const suyos = {};
  grupos.forEach(function (g) { suyos[g.grupo_id] = true; });
  const datos = {
    grupos: grupos.map(function (g) {
      return Object.assign(grupoParaCliente_(g, talleres), {
        monitoras: g.monitoras, curso: g.curso, activo: g.activo !== NO,
        inscritos: inscritosEn_(g.grupo_id, hoy_()).length
      });
    }).sort(function (a, b) { return (a.taller + a.nombre).localeCompare(b.taller + b.nombre, 'es'); }),
    // Todos los talleres, para elegir al crear o editar un grupo (solo nombres).
    talleres: leerTabla_(HOJAS.TALLERES).filter(function (t) { return t.taller_id; }).map(function (t) {
      return { taller_id: t.taller_id, nombre: t.nombre || t.taller_id, activo: t.activo !== NO };
    }).sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); }),
    listas: { tipo_dia: valoresLista_(LISTA_TIPO_DIA) },
    // Los días libres de sus grupos y los de todos los grupos (grupo vacío), que aquí solo se ven: se cambian en
    // Configuración › Periodos no lectivos.
    diasEspeciales: diasParaCliente_(leerTabla_(HOJAS.DIAS_ESPECIALES).filter(function (d) {
      return !d.grupo_id || admin || suyos[d.grupo_id];
    })),
    totalUsuarios: leerTabla_(HOJAS.USUARIOS).filter(function (u) { return u.usuario_id; }).length,
    correo: monitora.email
  };
  // Para las casillas de monitoras del formulario de grupo, que solo ve el admin.
  if (admin) datos.monitoras = monitorasParaCliente_();
  return datos;
}

// ---------- Datos de la pestaña Configuración (solo admin) ----------

function datosConfiguracion_(monitora) {
  comprobarAdmin_(monitora);
  return {
    estados: leerTabla_(HOJAS.ESTADOS).filter(function (e) { return e.codigo; }).map(estadoParaCliente_),
    config: config_(),
    listas: {
      motivo_baja: valoresLista_(LISTA_MOTIVO_BAJA),
      tipo_dia: valoresLista_(LISTA_TIPO_DIA),
      obs_rapida: valoresLista_(LISTA_OBS_RAPIDA)
    },
    motivoReservado: MOTIVO_CAMBIO_GRUPO,
    periodos: diasParaCliente_(leerTabla_(HOJAS.DIAS_ESPECIALES).filter(function (d) { return !d.grupo_id; })),
    monitoras: monitorasParaCliente_()
  };
}

// ---------- Grupos y talleres ----------

/**
 * Crea o modifica un grupo.
 * datos: { grupo_id (vacío = nuevo), nombre, taller_id, taller_nuevo, dias: ['L','X'], hora, monitoras, activo }
 * Una monitora solo modifica sus grupos y no cambia sus monitoras (se conservan las que tenía); el grupo que crea
 * queda a su nombre. El admin, todo.
 */
function guardarGrupo_(monitora, datos) {
  datos = datos || {};
  const v = validarGrupo_(monitora, datos);
  return conBloqueo_(function () { return escribirGrupo_(monitora, datos, v); });
}

/** Comprueba los datos de un grupo antes de guardarlo. Devuelve { nombre, dias, hora, correos, tallerNuevo }. */
function validarGrupo_(monitora, datos) {
  const admin = esAdmin_(monitora);
  const nombre = String(datos.nombre || '').replace(/\s+/g, ' ').trim();
  if (!nombre) throw errorApp_('Escribe el nombre del grupo.');
  const dias = ordenarDias_((datos.dias || []).map(function (d) { return String(d).toUpperCase(); }));
  if (!dias.length) throw errorApp_('Elige al menos un día de clase.');
  const hora = String(datos.hora || '').trim();
  if (hora && !/^\d{1,2}:\d{2}$/.test(hora)) throw errorApp_('La hora debe tener el formato 10:00.');
  const correos = admin ? String(datos.monitoras || '').toLowerCase().split(/[,;\s]+/).filter(Boolean) : [monitora.email];
  if (admin) {
    if (correos.some(function (c) { return c.indexOf('@') < 0; })) throw errorApp_('Revisa los correos de las monitoras: alguno no es válido.');
    // Cada monitora del grupo tiene que estar en la hoja Monitoras (6-nov-2026): si no, no podría entrar a verlo.
    const conocidas = leerTabla_(HOJAS.MONITORAS).map(function (m) { return String(m.email).toLowerCase(); });
    const desconocida = correos.find(function (c) { return conocidas.indexOf(c) < 0; });
    if (desconocida) throw errorApp_(desconocida + ' no está en Configuración › Monitoras. Dala de alta primero.');
    if (!correos.length) correos.push(monitora.email);
  }
  const tallerNuevo = String(datos.taller_nuevo || '').replace(/\s+/g, ' ').trim();
  return { nombre: nombre, dias: dias, hora: hora, correos: correos, tallerNuevo: tallerNuevo };
}

/**
 * Escribe un grupo ya validado (validarGrupo_). Se llama siempre dentro de un bloqueo (guardarGrupo_ o la
 * importación, que crea varios grupos en el mismo bloqueo). Devuelve { grupo_id }.
 */
function escribirGrupo_(monitora, datos, v) {
  const admin = esAdmin_(monitora);
  const nombre = v.nombre, dias = v.dias, hora = v.hora, correos = v.correos, tallerNuevo = v.tallerNuevo;
  // Taller: uno existente o uno nuevo (si ya existe con ese nombre, se reutiliza).
  let tallerId = String(datos.taller_id || '');
  const talleres = leerTabla_(HOJAS.TALLERES);
  if (tallerNuevo) {
    const igual = talleres.find(function (t) { return sinTildes_(t.nombre) === sinTildes_(tallerNuevo); });
    if (igual) {
      tallerId = igual.taller_id;
    } else {
      tallerId = identificadorLibre_(aIdentificador_(tallerNuevo), talleres.map(function (t) { return t.taller_id; }));
      anadirFilas_(HOJAS.TALLERES, [{ taller_id: tallerId, nombre: tallerNuevo, activo: SI }]);
    }
  } else if (!talleres.some(function (t) { return t.taller_id === tallerId; })) {
    throw errorApp_('Elige el taller o escribe uno nuevo.');
  }

  const grupos = leerTabla_(HOJAS.GRUPOS);
  const repetido = grupos.find(function (g) {
    return g.grupo_id !== datos.grupo_id && g.taller_id === tallerId && g.activo !== NO &&
      sinTildes_(g.nombre) === sinTildes_(nombre);
  });
  if (repetido) throw errorApp_('Ya hay un grupo activo con ese nombre en este taller.');

  const campos = {
    taller_id: tallerId, nombre: nombre, monitoras: correos.join(','), dias: dias.join(','),
    hora: hora, activo: datos.activo === false ? NO : SI
  };
  if (datos.grupo_id) {
    const g = grupos.find(function (x) { return x.grupo_id === datos.grupo_id; });
    if (!g) throw errorApp_('No se encuentra el grupo. Vuelve a abrir la pantalla.');
    if (!puedeGrupo_(monitora, g)) throw errorApp_('No tienes acceso a este grupo.');
    if (!admin) campos.monitoras = g.monitoras;   // la monitora no cambia las monitoras del grupo
    Object.assign(g, campos);
    actualizarFilas_(HOJAS.GRUPOS, [g]);
    return { grupo_id: g.grupo_id };
  }
  const id = identificadorLibre_(aIdentificador_(nombre), grupos.map(function (g) { return g.grupo_id; }));
  anadirFilas_(HOJAS.GRUPOS, [Object.assign({ grupo_id: id, curso: config_().curso }, campos)]);
  return { grupo_id: id };
}

// ---------- Usuarios ----------

/**
 * Busca usuarios (máx. 100). Una monitora busca entre todos, pero el teléfono solo lo ve (y solo busca por él) en los
 * usuarios de sus grupos; propio dice si puede abrir su ficha.
 */
function usuariosGestion_(monitora, texto) {
  const suyos = usuariosDeMonitora_(monitora);
  const esSuyo = function (id) { return !suyos || !!suyos[id]; };
  const hoy = hoy_();
  const gruposActivos = {};
  leerTabla_(HOJAS.INSCRIPCIONES).forEach(function (i) {
    if (i.fecha_alta <= hoy && (!i.fecha_baja || i.fecha_baja >= hoy)) {
      const id = normalizarId_(i.usuario_id);
      gruposActivos[id] = (gruposActivos[id] || 0) + 1;
    }
  });
  const t = sinTildes_(texto).replace(/\s+/g, ' ').trim();
  const tId = t.replace(/\s+/g, '');
  const todos = leerTabla_(HOJAS.USUARIOS).filter(function (u) { return u.usuario_id; });
  const filtrados = !t ? todos : todos.filter(function (u) {
    return normalizarId_(u.usuario_id).indexOf(tId) === 0 || sinTildes_(u.nombre).indexOf(t) >= 0 ||
      (tId.length >= 3 && String(u.telefono).indexOf(tId) >= 0 && esSuyo(normalizarId_(u.usuario_id)));
  });
  const lista = filtrados.map(function (u) {
    const id = normalizarId_(u.usuario_id);
    const propio = esSuyo(id);
    return { usuario_id: id, nombre: u.nombre, telefono: propio ? u.telefono : '', activo: u.activo !== NO,
      grupos: gruposActivos[id] || 0, propio: propio };
  }).sort(compararNombres_);
  return { total: todos.length, encontrados: lista.length, usuarios: lista.slice(0, 100) };
}

/** Ficha de un usuario. Una monitora, solo de los usuarios de sus grupos, y solo con sus grupos. */
function fichaUsuario_(monitora, usuarioId) {
  const id = normalizarId_(usuarioId);
  const u = usuariosPorId_()[id];
  if (!u) throw errorApp_('No existe ningún usuario con el ID ' + id + '.');
  comprobarUsuarioDeMonitora_(monitora, id);
  const talleres = talleresPorId_();
  const grupos = {};
  leerTabla_(HOJAS.GRUPOS).forEach(function (g) { grupos[g.grupo_id] = g; });
  const visible = function (grupoId) { return esAdmin_(monitora) || puedeGrupo_(monitora, grupos[grupoId]); };
  const tipos = tiposEstado_();
  const cfg = config_();

  const inscripciones = leerTabla_(HOJAS.INSCRIPCIONES)
    .filter(function (i) { return normalizarId_(i.usuario_id) === id && visible(i.grupo_id); })
    .map(function (i) {
      const g = grupos[i.grupo_id];
      return {
        inscripcion_id: i.inscripcion_id, grupo_id: i.grupo_id,
        grupo: g ? (g.nombre || g.grupo_id) : i.grupo_id, taller: g ? nombreTaller_(g, talleres) : '',
        fecha_alta: i.fecha_alta, fecha_baja: i.fecha_baja, motivo_baja: i.motivo_baja
      };
    })
    .sort(function (a, b) { return a.fecha_alta < b.fecha_alta ? 1 : -1; });

  // Resumen de asistencia del curso actual, por grupo.
  const porGrupo = {};
  asistenciaQueCuenta_().forEach(function (a) {   // sin las de sesiones canceladas (regla 5)
    if (normalizarId_(a.usuario_id) !== id || !visible(a.grupo_id)) return;
    if (cfg.inicio && a.fecha < cfg.inicio) return;
    if (cfg.fin && a.fecha > cfg.fin) return;
    const r = porGrupo[a.grupo_id] = porGrupo[a.grupo_id] || { grupo: a.grupo, taller: a.taller, presentes: 0, ausentes: 0, neutros: 0 };
    sumarTipo_(r, tipos, a.estado);
  });
  const asistencia = Object.keys(porGrupo).map(function (k) {
    const r = porGrupo[k];
    const g = grupos[k];
    if (g) { r.grupo = g.nombre || k; r.taller = nombreTaller_(g, talleres); }
    r.porcentaje = porcentaje_(r.presentes, r.ausentes);
    return r;
  });

  return {
    usuario: { usuario_id: id, nombre: u.nombre, telefono: u.telefono, activo: u.activo !== NO },
    inscripciones: inscripciones,
    asistencia: asistencia
  };
}

/**
 * Crea (nuevo = true) o modifica un usuario. El ID no se puede cambiar.
 * Una monitora crea cualquiera, pero solo modifica los usuarios de sus grupos.
 */
function guardarUsuario_(monitora, datos, nuevo) {
  datos = datos || {};
  const id = normalizarId_(datos.usuario_id);
  const nombre = normalizarNombre_(datos.nombre);
  if (!id) throw errorApp_('Falta el ID del usuario.');
  if (!nombre) throw errorApp_('Falta el nombre del usuario.');
  const campos = { nombre: nombre, telefono: normalizarTelefono_(datos.telefono), activo: datos.activo === false ? NO : SI };

  return conBloqueo_(function () {
    const existente = usuariosPorId_()[id];
    if (nuevo) {
      if (existente) throw errorApp_('Ya existe un usuario con el ID ' + id + ': ' + existente.nombre + '.');
      if (!datos.crear_aunque_parecido) {
        const parecidos = usuariosParecidos_(id, nombre);
        if (parecidos.length) return { parecidos: parecidos };
      }
      anadirFilas_(HOJAS.USUARIOS, [Object.assign({ usuario_id: id }, campos)]);
    } else {
      if (!existente) throw errorApp_('No se encuentra el usuario. Vuelve a abrir la pantalla.');
      comprobarUsuarioDeMonitora_(monitora, id);
      Object.assign(existente, campos);
      actualizarFilas_(HOJAS.USUARIOS, [existente]);
    }
    return { usuario_id: id, nombre: nombre };
  });
}

// ---------- Días libres (hoja Dias especiales) ----------

/**
 * Los días de todos los grupos (grupo vacío: periodos no lectivos, en Configuración) son del admin; los de un
 * grupo, del admin y de las monitoras del grupo.
 */
function comprobarDiaDeMonitora_(monitora, grupoId) {
  if (esAdmin_(monitora)) return;
  if (!grupoId) throw errorApp_('Los días libres de todos los grupos solo los cambia la persona administradora.');
  comprobarAccesoGrupo_(monitora, grupoPorId_(grupoId));
}

/**
 * Apunta un día sin clase o un intervalo (vacaciones).
 * datos: { desde, hasta (opcional), tipo, descripcion, grupo_id (vacío = todos) }
 * En un intervalo solo se apuntan los días en que algún grupo afectado tiene clase.
 */
function guardarDiaEspecial_(monitora, datos) {
  datos = datos || {};
  comprobarDiaDeMonitora_(monitora, String(datos.grupo_id || ''));
  const desde = String(datos.desde || '');
  const hasta = String(datos.hasta || '') || desde;
  comprobarFecha_(desde, 'de inicio');
  comprobarFecha_(hasta, 'de fin');
  if (hasta < desde) throw errorApp_('La fecha final no puede ser anterior a la inicial.');
  const tipo = String(datos.tipo || '');
  if (valoresLista_(LISTA_TIPO_DIA).indexOf(tipo) < 0) throw errorApp_('Elige el tipo de día.');
  const grupoId = String(datos.grupo_id || '');
  const descripcion = String(datos.descripcion || '').trim();

  return conBloqueo_(function () {
    let afectados;
    if (grupoId) {
      const g = grupoPorId_(grupoId);
      if (!g) throw errorApp_('El grupo elegido no existe.');
      afectados = [g];
    } else {
      afectados = leerTabla_(HOJAS.GRUPOS).filter(function (g) { return g.grupo_id && g.activo !== NO; });
    }
    const fechas = [];
    for (let f = desde; f <= hasta; f = sumarDias_(f, 1)) {
      if (fechas.length >= MAX_DIAS_INTERVALO) throw errorApp_('El intervalo es demasiado largo (máximo ' + MAX_DIAS_INTERVALO + ' días).');
      if (desde === hasta || afectados.some(function (g) { return tocaClase_(g, f); })) fechas.push(f);
    }
    if (!fechas.length) throw errorApp_('En esas fechas no hay ninguna clase de los grupos elegidos.');

    const existentes = {};
    leerTabla_(HOJAS.DIAS_ESPECIALES).forEach(function (d) { existentes[d.fecha + '|' + d.grupo_id] = d; });
    const actualizar = [];
    const nuevas = [];
    fechas.forEach(function (f) {
      const fila = { fecha: f, tipo: tipo, descripcion: descripcion, grupo_id: grupoId };
      const e = existentes[f + '|' + grupoId];
      if (e) { fila._fila = e._fila; actualizar.push(fila); } else nuevas.push(fila);
    });
    actualizarFilas_(HOJAS.DIAS_ESPECIALES, actualizar);
    anadirFilas_(HOJAS.DIAS_ESPECIALES, nuevas);
    return { dias: fechas.length };
  });
}

function borrarDiaEspecial_(monitora, fecha, grupoId) {
  comprobarDiaDeMonitora_(monitora, String(grupoId || ''));
  comprobarFecha_(fecha, 'del día');
  return conBloqueo_(function () {
    const filas = leerTabla_(HOJAS.DIAS_ESPECIALES)
      .filter(function (d) { return d.fecha === fecha && String(d.grupo_id || '') === String(grupoId || ''); })
      .map(function (d) { return d._fila; });
    borrarFilas_(HOJAS.DIAS_ESPECIALES, filas);
    return { borrados: filas.length };
  });
}

// ---------- Estados de asistencia ----------

/** Crea (nuevo = true) o modifica un estado. datos: { codigo, etiqueta, letra, tipo, color, activo } */
function guardarEstado_(monitora, datos, nuevo) {
  comprobarAdmin_(monitora);
  datos = datos || {};
  const codigo = String(datos.codigo || '').trim().toUpperCase();
  const etiqueta = String(datos.etiqueta || '').trim();
  const letra = String(datos.letra || '').trim().toUpperCase();
  const tipo = String(datos.tipo || '');
  const color = String(datos.color || '').trim();
  if (!/^[A-Z0-9]{1,6}$/.test(codigo)) throw errorApp_('El código debe tener de 1 a 6 letras o números, sin espacios.');
  if (!etiqueta) throw errorApp_('Escribe el nombre del estado.');
  if (!/^[A-Z0-9ÑÁÉÍÓÚ·-]{1,2}$/.test(letra)) throw errorApp_('La letra del historial debe tener 1 o 2 caracteres.');
  if ([TIPO_ESTADO.PRESENTE, TIPO_ESTADO.AUSENTE, TIPO_ESTADO.NEUTRO].indexOf(tipo) < 0) throw errorApp_('Elige cómo cuenta el estado.');
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw errorApp_('El color no es válido.');
  const activo = datos.activo === false ? NO : SI;
  if (codigo === ESTADO_POR_DEFECTO && activo === NO) {
    throw errorApp_('Este es el estado con el que empieza cada pase de lista; no se puede desactivar.');
  }

  return conBloqueo_(function () {
    completarCabeceras_(hoja_(HOJAS.ESTADOS), HOJAS.ESTADOS);
    const campos = { etiqueta: etiqueta, letra: letra, tipo: tipo, color: color, activo: activo };
    const existente = leerTabla_(HOJAS.ESTADOS).find(function (e) { return e.codigo === codigo; });
    if (nuevo) {
      if (existente) throw errorApp_('Ya existe un estado con el código ' + codigo + '.');
      anadirFilas_(HOJAS.ESTADOS, [Object.assign({ codigo: codigo }, campos)]);
    } else {
      if (!existente) throw errorApp_('No se encuentra el estado. Vuelve a abrir la pantalla.');
      Object.assign(existente, campos);
      actualizarFilas_(HOJAS.ESTADOS, [existente]);
    }
    return { codigo: codigo };
  });
}

// ---------- Curso ----------

/** datos: { curso, inicio, fin, trimestre2, trimestre3, diasPendientes, faltasSeguidas } */
function guardarConfig_(monitora, datos) {
  comprobarAdmin_(monitora);
  datos = datos || {};
  const curso = String(datos.curso || '').trim();
  if (!curso) throw errorApp_('Escribe el nombre del curso (por ejemplo 2026-2027).');
  comprobarFecha_(datos.inicio, 'de inicio de curso');
  comprobarFecha_(datos.fin, 'de fin de curso');
  if (datos.fin < datos.inicio) throw errorApp_('El fin de curso no puede ser anterior al inicio.');
  // Inicio del 2.º y del 3.º trimestre (6-nov-2026): dentro del curso y en orden.
  comprobarFecha_(datos.trimestre2, 'de inicio del 2.º trimestre');
  comprobarFecha_(datos.trimestre3, 'de inicio del 3.º trimestre');
  if (!(datos.inicio < datos.trimestre2 && datos.trimestre2 < datos.trimestre3 && datos.trimestre3 <= datos.fin)) {
    throw errorApp_('Los trimestres tienen que empezar dentro del curso y en orden: primer día, 2.º trimestre, 3.º trimestre, último día.');
  }
  const dias = parseInt(datos.diasPendientes, 10);
  if (!(dias >= 1 && dias <= 60)) throw errorApp_('Los días de pendientes deben estar entre 1 y 60.');
  const faltas = parseInt(datos.faltasSeguidas, 10);
  if (!(faltas >= 2 && faltas <= 20)) throw errorApp_('Las faltas seguidas para avisar deben estar entre 2 y 20.');

  const valores = {};
  valores[CLAVES_CONFIG.CURSO] = curso;
  valores[CLAVES_CONFIG.INICIO] = textoAFecha_(datos.inicio);
  valores[CLAVES_CONFIG.FIN] = textoAFecha_(datos.fin);
  valores[CLAVES_CONFIG.TRIMESTRE2] = textoAFecha_(datos.trimestre2);
  valores[CLAVES_CONFIG.TRIMESTRE3] = textoAFecha_(datos.trimestre3);
  valores[CLAVES_CONFIG.DIAS_PENDIENTES] = String(dias);
  valores[CLAVES_CONFIG.FALTAS_SEGUIDAS] = String(faltas);

  return conBloqueo_(function () {
    const filas = leerTabla_(HOJAS.CONFIG);
    const actualizar = [];
    const nuevas = [];
    Object.keys(valores).forEach(function (clave) {
      const f = filas.find(function (x) { return x.clave === clave; });
      if (f) { f.valor = valores[clave]; actualizar.push(f); } else nuevas.push({ clave: clave, valor: valores[clave] });
    });
    actualizarFilas_(HOJAS.CONFIG, actualizar);
    anadirFilas_(HOJAS.CONFIG, nuevas);
    return { ok: true };
  });
}

// ---------- Listas ----------

/** Sustituye todos los valores de una lista editable. */
function guardarLista_(monitora, lista, valores) {
  comprobarAdmin_(monitora);
  if (LISTAS_EDITABLES.indexOf(lista) < 0) throw errorApp_('Esa lista no se puede modificar.');
  const limpios = [];
  (valores || []).forEach(function (v) {
    const t = String(v || '').replace(/\s+/g, ' ').trim();
    if (t && limpios.indexOf(t) < 0) limpios.push(t);
  });
  if (lista === LISTA_MOTIVO_BAJA && limpios.indexOf(MOTIVO_CAMBIO_GRUPO) < 0) limpios.unshift(MOTIVO_CAMBIO_GRUPO);
  if (!limpios.length) throw errorApp_('La lista no puede quedar vacía.');

  return conBloqueo_(function () {
    const filas = leerTabla_(HOJAS.LISTAS).filter(function (l) { return l.lista === lista; }).map(function (l) { return l._fila; });
    borrarFilas_(HOJAS.LISTAS, filas);
    anadirFilas_(HOJAS.LISTAS, limpios.map(function (v) { return { lista: lista, valor: v }; }));
    aplicarValidacionesListas_(libro_());
    return { valores: limpios };
  });
}

// ---------- Monitoras y sus cuentas de la app (6-nov-2026; usuario y contraseña desde el 9-nov-2026) ----------
// La monitora se identifica por su correo (solo como identificador: no hace falta que use Google; está en
// Grupos.monitoras) y entra en la app instalable con su usuario y contraseña (Auth.gs). La contraseña nunca sale
// del servidor salvo la temporal, que se enseña una vez.

/**
 * Monitoras para Gestión y Configuración, sin la contraseña: { email, nombre, usuario, rol, activa, tieneContrasena,
 * debeCambiar, bloqueada, ultimoAcceso, grupos, sesiones: [{ aparato, creada, ultimo_uso, actual }] }.
 */
function monitorasParaCliente_() {
  const grupos = leerTabla_(HOJAS.GRUPOS).filter(function (g) { return g.grupo_id && g.activo !== NO; });
  const accesos = existeHoja_(HOJAS.ACCESOS) ? leerTabla_(HOJAS.ACCESOS) : [];
  return leerTabla_(HOJAS.MONITORAS).filter(function (m) { return m.email; }).map(function (m) {
    const email = String(m.email).toLowerCase();
    return {
      email: email, nombre: m.nombre || '', usuario: m.usuario || '', rol: m.rol === ROL.ADMIN ? ROL.ADMIN : ROL.MONITORA,
      activa: m.activa === SI, tieneContrasena: tieneContrasena_(m), debeCambiar: m.debe_cambiar === SI,
      bloqueada: Number(m.bloqueada_hasta) > Date.now(), ultimoAcceso: m.ultimo_acceso || '',
      propietaria: email === correoPropietario_(),
      grupos: grupos.filter(function (g) { return correosDeGrupo_(g).indexOf(email) >= 0; }).length,
      sesiones: sesionesDe_(email, accesos)
    };
  }).sort(function (a, b) { return (a.nombre || a.email).localeCompare(b.nombre || b.email, 'es'); });
}

/**
 * Crea o modifica una monitora. datos: { email, nombre, usuario, rol, activa }.
 * El correo es su identificador (está en Grupos.monitoras): no se cambia después. El usuario es único.
 * Desactivarla cierra sus sesiones en todos los aparatos.
 */
function guardarMonitora_(monitora, datos, nuevo) {
  comprobarAdmin_(monitora);
  datos = datos || {};
  const email = String(datos.email || '').trim().toLowerCase();
  const nombre = String(datos.nombre || '').replace(/\s+/g, ' ').trim();
  const usuario = usuarioNormal_(datos.usuario);
  if (!/^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(email)) throw errorApp_('Escribe un correo como nombre@gmail.com.');
  if (!nombre) throw errorApp_('Escribe el nombre de la monitora.');
  if (!PATRON_USUARIO.test(usuario)) {
    throw errorApp_('El usuario tiene que tener de 3 a 30 letras sin tildes, números, puntos o guiones, sin espacios (ej.: lucia).');
  }
  const rol = datos.rol === ROL.ADMIN ? ROL.ADMIN : ROL.MONITORA;
  const activa = datos.activa === false ? NO : SI;
  if (email === correoPropietario_() && (rol !== ROL.ADMIN || activa === NO)) {
    throw errorApp_('Es la cuenta propietaria de la aplicación: siempre es administración y está activa.');
  }
  return conBloqueo_(function () {
    completarCabeceras_(hoja_(HOJAS.MONITORAS), HOJAS.MONITORAS);
    const filas = leerTabla_(HOJAS.MONITORAS);
    const existente = filas.find(function (m) { return String(m.email).toLowerCase() === email; });
    const otraConUsuario = filaPorUsuario_(filas, usuario);
    if (otraConUsuario && otraConUsuario !== existente) throw errorApp_('El usuario «' + usuario + '» ya lo tiene ' + (otraConUsuario.nombre || otraConUsuario.email) + '.');
    let cerradas = 0;
    if (nuevo) {
      if (existente) throw errorApp_('Ya hay una monitora con el correo ' + email + '.');
      anadirFilas_(HOJAS.MONITORAS, [{ email: email, nombre: nombre, usuario: usuario, rol: rol, activa: activa, clave_hash: '' }]);
    } else {
      if (!existente) throw errorApp_('No se encuentra la monitora. Vuelve a abrir la pantalla.');
      Object.assign(existente, { nombre: nombre, usuario: usuario, rol: rol, activa: activa });
      actualizarFilas_(HOJAS.MONITORAS, [existente]);
      if (activa === NO) cerradas = cerrarSesiones_(email, '');
    }
    return { email: email, sesionesCerradas: cerradas };
  });
}

/**
 * Contraseña temporal nueva para una monitora (la anterior deja de valer y se cierran sus sesiones; la de quien
 * lo hace, si es para sí misma, sigue abierta). Al entrar con ella tendrá que poner una suya.
 * Devuelve { email, usuario, contrasena, url, urlApp }: es la única vez que se ve la contraseña.
 */
function nuevaContrasenaMonitora_(monitora, email) {
  comprobarAdmin_(monitora);
  const correo = String(email || '').trim().toLowerCase();
  return conBloqueo_(function () {
    completarCabeceras_(hoja_(HOJAS.MONITORAS), HOJAS.MONITORAS);
    const fila = leerTabla_(HOJAS.MONITORAS).find(function (m) { return String(m.email).toLowerCase() === correo; });
    if (!fila) throw errorApp_('No se encuentra la monitora. Vuelve a abrir la pantalla.');
    if (fila.activa !== SI) throw errorApp_('La monitora está desactivada. Actívala antes de darle una contraseña.');
    if (!fila.usuario) throw errorApp_('Ponle antes un nombre de usuario y guarda.');
    const contrasena = contrasenaTemporal_();
    ponerContrasena_(fila, contrasena);
    fila.debe_cambiar = SI;
    actualizarFilas_(HOJAS.MONITORAS, [fila]);
    cerrarSesiones_(correo, sesionEnCurso_ ? sesionEnCurso_.huella : '');
    // Para el enlace de la app (Cliente.html, enlaceApp): la PWA usa su propia dirección del servidor; desde la web
    // app, esta (la de la implementación con la que se ha abierto) y la de la PWA.
    let url = '';
    try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { url = ''; }
    return { email: correo, usuario: fila.usuario, contrasena: contrasena, url: url, urlApp: URL_PWA };
  });
}

/** Cierra las sesiones de una monitora en todos sus aparatos (salvo la de quien lo hace). Devuelve { cerradas }. */
function cerrarSesionesMonitora_(monitora, email) {
  comprobarAdmin_(monitora);
  const correo = String(email || '').trim().toLowerCase();
  return conBloqueo_(function () {
    return { cerradas: cerrarSesiones_(correo, sesionEnCurso_ ? sesionEnCurso_.huella : '') };
  });
}
