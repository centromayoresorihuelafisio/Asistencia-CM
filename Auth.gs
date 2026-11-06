/**
 * Auth.gs — Identifica a la monitora y calcula sus permisos.
 * Todo el sistema de identificación está aquí: cambiarlo (PIN, otra cuenta…) no debe afectar al resto.
 *
 * Modo actual (5-nov-2026): la web app se publica para «Cualquier usuario, incluso anónimo»
 * (`access: ANYONE_ANONYMOUS` en appsscript.json), como la de fisio, pero sin login propio:
 * quien tenga el enlace entra, con cualquier cuenta de Google o sin ninguna.
 * Google no da el correo de quien entra con otra cuenta, así que en ese caso se entra como
 * la persona propietaria de la copia (quien despliega), que es admin.
 * Si Google sí da el correo y está en la hoja Monitoras con activa = SI, entra con su rol.
 */

function correoActivo_() {
  return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
}

function correoPropietario_() {
  return String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
}

/** Devuelve { email, nombre, rol }. Quien no tiene correo conocido entra como la propietaria (admin). */
function identificarMonitora_() {
  const propietario = correoPropietario_();
  const email = correoActivo_() || propietario;
  if (existeHoja_(HOJAS.MONITORAS)) {
    const fila = leerTabla_(HOJAS.MONITORAS).find(function (m) {
      return String(m.email).toLowerCase() === email && m.activa === SI;
    });
    if (fila) return { email: email, nombre: fila.nombre || email, rol: fila.rol === ROL.ADMIN ? ROL.ADMIN : ROL.MONITORA };
  }
  return { email: email, nombre: email, rol: ROL.ADMIN };
}

/** Para las funciones del menú de la hoja: lanza un error si quien ejecuta no es admin. */
function soloAdmin_() {
  const m = identificarMonitora_();
  if (!m || m.rol !== ROL.ADMIN) throw errorApp_('Esta acción solo la puede hacer una persona administradora.');
  return m;
}

function correosDeGrupo_(grupo) {
  return String(grupo.monitoras || '').toLowerCase().split(/[,;\s]+/).filter(Boolean);
}

function puedeGrupo_(monitora, grupo) {
  if (!grupo) return false;
  if (monitora.rol === ROL.ADMIN) return true;
  return correosDeGrupo_(grupo).indexOf(monitora.email) >= 0;
}

function comprobarAccesoGrupo_(monitora, grupo) {
  if (!grupo) throw errorApp_('El grupo no existe.');
  if (!puedeGrupo_(monitora, grupo)) throw errorApp_('No tienes acceso a este grupo.');
}

// ---------- App instalable (PWA, 6-nov-2026) ----------
// La PWA no pasa por el enlace de la web app, sino por doPost, con una clave en cada petición.
// Quien la usa entra igual que con el enlace: como la propietaria (identificarMonitora_).

/** Devuelve 'ok', 'sin-clave' (la copia aún no tiene CLAVE_PWA) o 'mal'. */
function comprobarClavePWA_(clave) {
  const buena = String(PropertiesService.getScriptProperties().getProperty(PROP_CLAVE_PWA) || '').trim();
  if (!buena) return 'sin-clave';
  return String(clave || '').trim() === buena ? 'ok' : 'mal';
}
