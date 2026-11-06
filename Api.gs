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

// ---------- Gestión (solo admin) ----------

function api_gestion() {
  return responder_(function (m) { return datosGestion_(m); });
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

// ---------- App instalable (PWA, 6-nov-2026) ----------
// doPost (Main.gs) recibe { action, args, clave }: action es el nombre de la función sin «api_» y args, sus
// argumentos en el mismo orden. Solo se puede llamar a las funciones de esta lista.

function accionesPWA_() {
  return {
    init: api_init, inicio: api_inicio, sesion: api_sesion, guardarSesion: api_guardarSesion,
    cancelarSesion: api_cancelarSesion, grupo: api_grupo, usuariosAlta: api_usuariosAlta,
    altaUsuario: api_altaUsuario, baja: api_baja, cambiarGrupo: api_cambiarGrupo,
    deshacerBaja: api_deshacerBaja, deshacerAlta: api_deshacerAlta, deshacerCancelar: api_deshacerCancelar,
    historial: api_historial, informe: api_informe, exportarInforme: api_exportarInforme,
    enviarInforme: api_enviarInforme, gestion: api_gestion, guardarGrupo: api_guardarGrupo,
    usuariosGestion: api_usuariosGestion, usuario: api_usuario, guardarUsuario: api_guardarUsuario,
    guardarDiaEspecial: api_guardarDiaEspecial, borrarDiaEspecial: api_borrarDiaEspecial,
    guardarEstado: api_guardarEstado, guardarConfig: api_guardarConfig, guardarLista: api_guardarLista
  };
}

/** Atiende una petición de la PWA (el cuerpo del POST, en JSON). Devuelve { ok, data } o { ok: false, error[, codigo] }. */
function atenderPWA_(cuerpo) {
  let peticion;
  try { peticion = JSON.parse(cuerpo || ''); } catch (e) { peticion = null; }
  if (!peticion || typeof peticion !== 'object') return { ok: false, error: 'Petición no válida.' };
  const clave = comprobarClavePWA_(peticion.clave);
  if (clave === 'sin-clave') {
    return { ok: false, codigo: CODIGO_CLAVE_PWA, error: 'Esta copia de la aplicación todavía no tiene clave. Hay que ponerla en las propiedades del proyecto de Apps Script (' + PROP_CLAVE_PWA + ').' };
  }
  if (clave !== 'ok') {
    Utilities.sleep(ESPERA_CLAVE_MAL_MS);
    return { ok: false, codigo: CODIGO_CLAVE_PWA, error: 'La clave no es correcta.' };
  }
  const acciones = accionesPWA_();
  const accion = String(peticion.action || '');
  if (!Object.prototype.hasOwnProperty.call(acciones, accion)) return { ok: false, error: 'Acción desconocida: ' + accion + '.' };
  return acciones[accion].apply(null, Array.isArray(peticion.args) ? peticion.args : []);
}
