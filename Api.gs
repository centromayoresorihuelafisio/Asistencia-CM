/**
 * Api.gs — Funciones que llama el navegador con google.script.run.
 * Todas devuelven { ok: true, data } o { ok: false, error: 'mensaje en español' } y nunca lanzan excepciones.
 * Cada una identifica a la monitora y comprueba sus permisos en el servidor.
 */

function responder_(fn) {
  try {
    const monitora = identificarMonitora_();
    if (!monitora) {
      return { ok: false, error: 'No tienes acceso a esta aplicación. Pide a la persona administradora que te dé de alta.' };
    }
    return { ok: true, data: fn(monitora) };
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

function api_buscarUsuarios(texto, grupo_id) {
  return responder_(function (m) { return buscarUsuarios_(m, texto, grupo_id); });
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
