/**
 * Api.gs — Funciones que llama el navegador con google.script.run.
 * Todas devuelven { ok: true, data } o { ok: false, error: 'mensaje en español' } y nunca lanzan excepciones.
 * Cada una identifica a la monitora y comprueba sus permisos en el servidor.
 */

function responder_(fn) {
  const monitora = identificarMonitora_();
  if (!monitora) {
    return { ok: false, error: 'No tienes acceso a esta aplicación. Úsala desde la app instalada con tu usuario y contraseña o pide acceso a la persona administradora.' };
  }
  return sinIdentificar_(function () { return fn(monitora); });
}

/** Como responder_, sin identificar a nadie: para entrar y las demás acciones de la sesión de la PWA (atenderPWA_). */
function sinIdentificar_(fn) {
  try {
    return { ok: true, data: fn() };
  } catch (e) {
    if (e && e.paraUsuario) return { ok: false, error: e.message };
    console.error(e && e.stack ? e.stack : String(e));
    return { ok: false, error: 'Ha ocurrido un error inesperado. Inténtalo de nuevo y, si se repite, avisa a la persona administradora.' };
  }
}

function api_init() {
  return responder_(function (m) { return datosIniciales_(m); });
}

function api_inicio(fecha) {
  return responder_(function (m) { return datosInicio_(m, fecha); });
}

function api_sesion(grupo_id, fecha) {
  return responder_(function (m) { return datosSesion_(m, grupo_id, fecha); });
}

function api_guardarSesion(payload) {
  return responder_(function (m) { return guardarSesion_(m, payload); });
}

function api_cancelarSesion(grupo_id, fecha, nota) {
  return responder_(function (m) { return cancelarSesion_(m, grupo_id, fecha, nota); });
}

function api_grupo(grupo_id) {
  return responder_(function (m) { return datosGrupo_(m, grupo_id); });
}

function api_usuariosAlta() {
  return responder_(function (m) { return usuariosParaAlta_(m); });
}

function api_altaUsuario(grupo_id, datos) {
  return responder_(function (m) { return altaUsuario_(m, grupo_id, datos); });
}

function api_baja(inscripcion_id, fecha_baja, motivo) {
  return responder_(function (m) { return baja_(m, inscripcion_id, fecha_baja, motivo); });
}

function api_cambiarGrupo(inscripcion_id, grupo_destino, fecha) {
  return responder_(function (m) { return cambiarGrupo_(m, inscripcion_id, grupo_destino, fecha); });
}

// Deshacer desde el aviso de abajo (4-nov-2026)

function api_deshacerBaja(inscripcion_id) {
  return responder_(function (m) { return deshacerBaja_(m, inscripcion_id); });
}

function api_deshacerAlta(inscripcion_id) {
  return responder_(function (m) { return deshacerAlta_(m, inscripcion_id); });
}

function api_deshacerCancelar(grupo_id, fecha) {
  return responder_(function (m) { return deshacerCancelar_(m, grupo_id, fecha); });
}

// ---------- Historial e informe ----------

function api_historial(grupo_id, mes) {
  return responder_(function (m) { return historialGrupo_(m, grupo_id, mes); });
}

function api_informe(desde, hasta, taller_id) {
  return responder_(function (m) { return informeParaCliente_(m, desde, hasta, taller_id); });
}

function api_exportarInforme(desde, hasta, taller_id, formato) {
  return responder_(function (m) { return exportarInforme_(m, desde, hasta, taller_id, formato); });
}

function api_enviarInforme(desde, hasta, taller_id, formato, correo) {
  return responder_(function (m) { return enviarInforme_(m, desde, hasta, taller_id, formato, correo); });
}

// ---------- Gestión (todas, cada una con lo suyo) y Configuración (solo admin), 6-nov-2026 ----------

function api_gestion() {
  return responder_(function (m) { return datosGestion_(m); });
}

function api_configuracion() {
  return responder_(function (m) { return datosConfiguracion_(m); });
}

function api_guardarGrupo(datos) {
  return responder_(function (m) { return guardarGrupo_(m, datos); });
}

function api_usuariosGestion(texto) {
  return responder_(function (m) { return usuariosGestion_(m, texto); });
}

function api_usuario(usuario_id) {
  return responder_(function (m) { return fichaUsuario_(m, usuario_id); });
}

function api_guardarUsuario(datos, nuevo) {
  return responder_(function (m) { return guardarUsuario_(m, datos, !!nuevo); });
}

function api_guardarDiaEspecial(datos) {
  return responder_(function (m) { return guardarDiaEspecial_(m, datos); });
}

function api_borrarDiaEspecial(fecha, grupo_id) {
  return responder_(function (m) { return borrarDiaEspecial_(m, fecha, grupo_id); });
}

function api_guardarEstado(datos, nuevo) {
  return responder_(function (m) { return guardarEstado_(m, datos, !!nuevo); });
}

function api_guardarConfig(datos) {
  return responder_(function (m) { return guardarConfig_(m, datos); });
}

function api_guardarLista(lista, valores) {
  return responder_(function (m) { return guardarLista_(m, lista, valores); });
}

// Monitoras y sus cuentas de la app (6-nov-2026; usuario y contraseña desde el 9-nov-2026)

function api_guardarMonitora(datos, nuevo) {
  return responder_(function (m) { return guardarMonitora_(m, datos, !!nuevo); });
}

function api_nuevaContrasenaMonitora(email) {
  return responder_(function (m) { return nuevaContrasenaMonitora_(m, email); });
}

function api_cerrarSesionesMonitora(email) {
  return responder_(function (m) { return cerrarSesionesMonitora_(m, email); });
}

// ---------- App instalable (PWA, 6-nov-2026; usuario y contraseña desde el 9-nov-2026) ----------
// doPost (Main.gs) recibe { action, args, token }: action es el nombre de la función sin «api_» y args, sus
// argumentos en el mismo orden. Solo se puede llamar a las funciones de esta lista, y solo con una sesión abierta.

function accionesPWA_() {
  return {
    init: api_init, inicio: api_inicio, sesion: api_sesion, guardarSesion: api_guardarSesion,
    cancelarSesion: api_cancelarSesion, grupo: api_grupo, usuariosAlta: api_usuariosAlta,
    altaUsuario: api_altaUsuario, baja: api_baja, cambiarGrupo: api_cambiarGrupo,
    deshacerBaja: api_deshacerBaja, deshacerAlta: api_deshacerAlta, deshacerCancelar: api_deshacerCancelar,
    historial: api_historial, informe: api_informe, exportarInforme: api_exportarInforme,
    enviarInforme: api_enviarInforme, gestion: api_gestion, configuracion: api_configuracion, guardarGrupo: api_guardarGrupo,
    usuariosGestion: api_usuariosGestion, usuario: api_usuario, guardarUsuario: api_guardarUsuario,
    guardarDiaEspecial: api_guardarDiaEspecial, borrarDiaEspecial: api_borrarDiaEspecial,
    guardarEstado: api_guardarEstado, guardarConfig: api_guardarConfig, guardarLista: api_guardarLista,
    guardarMonitora: api_guardarMonitora, nuevaContrasenaMonitora: api_nuevaContrasenaMonitora,
    cerrarSesionesMonitora: api_cerrarSesionesMonitora
  };
}

/**
 * Atiende una petición de la PWA (el cuerpo del POST, en JSON). Devuelve { ok, data } o { ok: false, error[, codigo] }.
 * - «entrar» (usuario, contraseña, aparato) no lleva token: abre la sesión y devuelve { token, nombre, debeCambiar }.
 * - El resto necesita el token de una sesión abierta (si no, codigo 'sesion'). «salir» la cierra.
 * - Con una contraseña temporal solo se puede «cambiarContrasena» (actual, nueva); lo demás responde codigo 'cambiar'.
 * - «verComo» (email o vacío), solo admin: las peticiones siguientes se atienden como esa monitora.
 */
function atenderPWA_(cuerpo) {
  let peticion;
  try { peticion = JSON.parse(cuerpo || ''); } catch (e) { peticion = null; }
  if (!peticion || typeof peticion !== 'object') return { ok: false, error: 'Petición no válida.' };
  const accion = String(peticion.action || '');
  const args = Array.isArray(peticion.args) ? peticion.args : [];
  if (accion === 'entrar') return sinIdentificar_(function () { return entrarPWA_(args[0], args[1], args[2]); });
  const estado = comprobarSesionPWA_(peticion.token);
  if (accion === 'salir') return sinIdentificar_(salirPWA_);
  if (estado === 'mal') {
    return { ok: false, codigo: CODIGO_SESION_PWA, error: 'La sesión se ha cerrado. Vuelve a entrar con tu usuario y tu contraseña.' };
  }
  if (accion === 'cambiarContrasena') return sinIdentificar_(function () { return cambiarContrasenaPWA_(args[0], args[1]); });
  if (estado === 'cambiar') {
    return { ok: false, codigo: CODIGO_CAMBIAR_PWA, error: 'Antes de seguir, cambia la contraseña temporal por una tuya.' };
  }
  if (accion === 'verComo') return sinIdentificar_(function () { return verComoPWA_(args[0]); });
  const acciones = accionesPWA_();
  if (!Object.prototype.hasOwnProperty.call(acciones, accion)) return { ok: false, error: 'Acción desconocida: ' + accion + '.' };
  return acciones[accion].apply(null, args);
}
