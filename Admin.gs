/**
 * Admin.gs — Pestaña «Gestión» de la app: grupos, talleres, usuarios, días sin clase, estados, curso y listas.
 * Todo es solo para admin. Así casi nunca hace falta tocar la hoja de cálculo a mano.
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

// ---------- Datos de la pestaña Gestión ----------

function datosGestion_(monitora) {
  comprobarAdmin_(monitora);
  const talleres = talleresPorId_();
  return {
    grupos: leerTabla_(HOJAS.GRUPOS).filter(function (g) { return g.grupo_id; }).map(function (g) {
      return Object.assign(grupoParaCliente_(g, talleres), {
        monitoras: g.monitoras, curso: g.curso, activo: g.activo !== NO,
        inscritos: inscritosEn_(g.grupo_id, hoy_()).length
      });
    }).sort(function (a, b) { return (a.taller + a.nombre).localeCompare(b.taller + b.nombre, 'es'); }),
    talleres: leerTabla_(HOJAS.TALLERES).filter(function (t) { return t.taller_id; }).map(function (t) {
      return { taller_id: t.taller_id, nombre: t.nombre || t.taller_id, activo: t.activo !== NO };
    }).sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); }),
    estados: leerTabla_(HOJAS.ESTADOS).filter(function (e) { return e.codigo; }).map(estadoParaCliente_),
    config: config_(),
    listas: {
      motivo_baja: valoresLista_(LISTA_MOTIVO_BAJA),
      tipo_dia: valoresLista_(LISTA_TIPO_DIA),
      obs_rapida: valoresLista_(LISTA_OBS_RAPIDA)
    },
    motivoReservado: MOTIVO_CAMBIO_GRUPO,
    diasEspeciales: leerTabla_(HOJAS.DIAS_ESPECIALES)
      .filter(function (d) { return esFechaValida_(d.fecha); })
      .map(function (d) { return { fecha: d.fecha, tipo: d.tipo, descripcion: d.descripcion, grupo_id: d.grupo_id }; })
      .sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; }),
    totalUsuarios: leerTabla_(HOJAS.USUARIOS).length,
    correo: monitora.email,
    monitoras: monitorasParaCliente_()
  };
}

// ---------- Grupos y talleres ----------

/**
 * Crea o modifica un grupo.
 * datos: { grupo_id (vacío = nuevo), nombre, taller_id, taller_nuevo, dias: ['L','X'], hora, monitoras, activo }
 */
function guardarGrupo_(monitora, datos) {
  comprobarAdmin_(monitora);
  datos = datos || {};
  const nombre = String(datos.nombre || '').replace(/\s+/g, ' ').trim();
  if (!nombre) throw errorApp_('Escribe el nombre del grupo.');
  const dias = ordenarDias_((datos.dias || []).map(function (d) { return String(d).toUpperCase(); }));
  if (!dias.length) throw errorApp_('Elige al menos un día de clase.');
  const hora = String(datos.hora || '').trim();
  if (hora && !/^\d{1,2}:\d{2}$/.test(hora)) throw errorApp_('La hora debe tener el formato 10:00.');
  const correos = String(datos.monitoras || '').toLowerCase().split(/[,;\s]+/).filter(Boolean);
  if (correos.some(function (c) { return c.indexOf('@') < 0; })) throw errorApp_('Revisa los correos de las monitoras: alguno no es válido.');
  // Cada monitora del grupo tiene que estar en la hoja Monitoras (6-nov-2026): si no, no podría entrar a verlo.
  const conocidas = leerTabla_(HOJAS.MONITORAS).map(function (m) { return String(m.email).toLowerCase(); });
  const desconocida = correos.find(function (c) { return conocidas.indexOf(c) < 0; });
  if (desconocida) throw errorApp_(desconocida + ' no está en Gestión › Monitoras. Dala de alta primero.');
  if (!correos.length) correos.push(monitora.email);
  const tallerNuevo = String(datos.taller_nuevo || '').replace(/\s+/g, ' ').trim();

  return conBloqueo_(function () {
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
      Object.assign(g, campos);
      actualizarFilas_(HOJAS.GRUPOS, [g]);
      return { grupo_id: g.grupo_id };
    }
    const id = identificadorLibre_(aIdentificador_(nombre), grupos.map(function (g) { return g.grupo_id; }));
    anadirFilas_(HOJAS.GRUPOS, [Object.assign({ grupo_id: id, curso: config_().curso }, campos)]);
    return { grupo_id: id };
  });
}

// ---------- Usuarios ----------

function usuariosGestion_(monitora, texto) {
  comprobarAdmin_(monitora);
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
      (tId.length >= 3 && String(u.telefono).indexOf(tId) >= 0);
  });
  const lista = filtrados.map(function (u) {
    const id = normalizarId_(u.usuario_id);
    return { usuario_id: id, nombre: u.nombre, telefono: u.telefono, activo: u.activo !== NO, grupos: gruposActivos[id] || 0 };
  }).sort(compararNombres_);
  return { total: todos.length, encontrados: lista.length, usuarios: lista.slice(0, 100) };
}

function fichaUsuario_(monitora, usuarioId) {
  comprobarAdmin_(monitora);
  const id = normalizarId_(usuarioId);
  const u = usuariosPorId_()[id];
  if (!u) throw errorApp_('No existe ningún usuario con el ID ' + id + '.');
  const talleres = talleresPorId_();
  const grupos = {};
  leerTabla_(HOJAS.GRUPOS).forEach(function (g) { grupos[g.grupo_id] = g; });
  const tipos = tiposEstado_();
  const cfg = config_();

  const inscripciones = leerTabla_(HOJAS.INSCRIPCIONES)
    .filter(function (i) { return normalizarId_(i.usuario_id) === id; })
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
    if (normalizarId_(a.usuario_id) !== id) return;
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

/** Crea (nuevo = true) o modifica un usuario. El ID no se puede cambiar. */
function guardarUsuario_(monitora, datos, nuevo) {
  comprobarAdmin_(monitora);
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
      Object.assign(existente, campos);
      actualizarFilas_(HOJAS.USUARIOS, [existente]);
    }
    return { usuario_id: id, nombre: nombre };
  });
}

// ---------- Días sin clase ----------

/**
 * Apunta un día sin clase o un intervalo (vacaciones).
 * datos: { desde, hasta (opcional), tipo, descripcion, grupo_id (vacío = todos) }
 * En un intervalo solo se apuntan los días en que algún grupo afectado tiene clase.
 */
function guardarDiaEspecial_(monitora, datos) {
  comprobarAdmin_(monitora);
  datos = datos || {};
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
  comprobarAdmin_(monitora);
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

/** datos: { curso, inicio, fin, diasPendientes, faltasSeguidas } */
function guardarConfig_(monitora, datos) {
  comprobarAdmin_(monitora);
  datos = datos || {};
  const curso = String(datos.curso || '').trim();
  if (!curso) throw errorApp_('Escribe el nombre del curso (por ejemplo 2026-2027).');
  comprobarFecha_(datos.inicio, 'de inicio de curso');
  comprobarFecha_(datos.fin, 'de fin de curso');
  if (datos.fin < datos.inicio) throw errorApp_('El fin de curso no puede ser anterior al inicio.');
  const dias = parseInt(datos.diasPendientes, 10);
  if (!(dias >= 1 && dias <= 60)) throw errorApp_('Los días de pendientes deben estar entre 1 y 60.');
  const faltas = parseInt(datos.faltasSeguidas, 10);
  if (!(faltas >= 2 && faltas <= 20)) throw errorApp_('Las faltas seguidas para avisar deben estar entre 2 y 20.');

  const valores = {};
  valores[CLAVES_CONFIG.CURSO] = curso;
  valores[CLAVES_CONFIG.INICIO] = textoAFecha_(datos.inicio);
  valores[CLAVES_CONFIG.FIN] = textoAFecha_(datos.fin);
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

// ---------- Monitoras y sus claves de la app (6-nov-2026) ----------
// La monitora se identifica por su correo (solo como identificador: no hace falta que use Google) y entra en la
// app instalable con su clave. En la hoja solo se guarda la huella de la clave; la clave se enseña una vez.

/** Monitoras para Gestión, sin la huella de la clave: { email, nombre, rol, activa, tieneClave, grupos }. */
function monitorasParaCliente_() {
  const grupos = leerTabla_(HOJAS.GRUPOS).filter(function (g) { return g.grupo_id && g.activo !== NO; });
  return leerTabla_(HOJAS.MONITORAS).filter(function (m) { return m.email; }).map(function (m) {
    const email = String(m.email).toLowerCase();
    return {
      email: email, nombre: m.nombre || '', rol: m.rol === ROL.ADMIN ? ROL.ADMIN : ROL.MONITORA,
      activa: m.activa === SI, tieneClave: !!m.clave_hash,
      grupos: grupos.filter(function (g) { return correosDeGrupo_(g).indexOf(email) >= 0; }).length
    };
  }).sort(function (a, b) { return (a.nombre || a.email).localeCompare(b.nombre || b.email, 'es'); });
}

/**
 * Crea o modifica una monitora. datos: { email, nombre, rol, activa }.
 * El correo es su identificador (está en Grupos.monitoras): no se cambia después.
 */
function guardarMonitora_(monitora, datos, nuevo) {
  comprobarAdmin_(monitora);
  datos = datos || {};
  const email = String(datos.email || '').trim().toLowerCase();
  const nombre = String(datos.nombre || '').replace(/\s+/g, ' ').trim();
  if (!/^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(email)) throw errorApp_('Escribe un correo como nombre@gmail.com.');
  if (!nombre) throw errorApp_('Escribe el nombre de la monitora.');
  const rol = datos.rol === ROL.ADMIN ? ROL.ADMIN : ROL.MONITORA;
  const activa = datos.activa === false ? NO : SI;
  if (email === correoPropietario_() && (rol !== ROL.ADMIN || activa === NO)) {
    throw errorApp_('Es la cuenta propietaria de la aplicación: siempre es administración y está activa.');
  }
  return conBloqueo_(function () {
    completarCabeceras_(hoja_(HOJAS.MONITORAS), HOJAS.MONITORAS);
    const existente = leerTabla_(HOJAS.MONITORAS).find(function (m) { return String(m.email).toLowerCase() === email; });
    if (nuevo) {
      if (existente) throw errorApp_('Ya hay una monitora con el correo ' + email + '.');
      anadirFilas_(HOJAS.MONITORAS, [{ email: email, nombre: nombre, rol: rol, activa: activa, clave_hash: '' }]);
    } else {
      if (!existente) throw errorApp_('No se encuentra la monitora. Vuelve a abrir la pantalla.');
      Object.assign(existente, { nombre: nombre, rol: rol, activa: activa });
      actualizarFilas_(HOJAS.MONITORAS, [existente]);
    }
    return { email: email };
  });
}

/** Crea una clave nueva para una monitora (la anterior deja de valer). Devuelve { email, clave }: es la única vez que se ve. */
function nuevaClaveMonitora_(monitora, email) {
  comprobarAdmin_(monitora);
  const correo = String(email || '').trim().toLowerCase();
  return conBloqueo_(function () {
    completarCabeceras_(hoja_(HOJAS.MONITORAS), HOJAS.MONITORAS);
    const fila = leerTabla_(HOJAS.MONITORAS).find(function (m) { return String(m.email).toLowerCase() === correo; });
    if (!fila) throw errorApp_('No se encuentra la monitora. Vuelve a abrir la pantalla.');
    if (fila.activa !== SI) throw errorApp_('La monitora está desactivada. Actívala antes de darle una clave.');
    const clave = claveNueva_();
    fila.clave_hash = huellaClave_(clave);
    actualizarFilas_(HOJAS.MONITORAS, [fila]);
    // Para el enlace que conecta la app solo (Cliente.html, enlaceConexion): la PWA usa su propia dirección del
    // servidor; desde la web app, esta (la de la implementación con la que se ha abierto) y la de la PWA.
    let url = '';
    try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { url = ''; }
    return { email: correo, clave: clave, url: url, urlApp: URL_PWA };
  });
}
