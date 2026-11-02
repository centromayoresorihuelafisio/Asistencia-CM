/**
 * Auth.gs — Identifica a la monitora y calcula sus permisos.
 * Todo el sistema de identificación está aquí: cambiarlo (PIN, otra cuenta…) no debe afectar al resto.
 *
 * Modo actual (decidido el 2-nov-2026): cada monitora tiene su propia copia de la hoja y de la app,
 * con su Gmail personal. La persona propietaria de la copia (quien despliega la web app) es siempre admin.
 * Además, cualquier correo de la hoja Monitoras con activa = SI entra con su rol, si Google lo entrega.
 */

function correoActivo_() {
  return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
}

function correoPropietario_() {
  return String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
}

/** Devuelve { email, nombre, rol } o null si quien entra no tiene acceso. */
function identificarMonitora_() {
  const email = correoActivo_();
  if (!email) return null;
  if (existeHoja_(HOJAS.MONITORAS)) {
    const fila = leerTabla_(HOJAS.MONITORAS).find(function (m) {
      return String(m.email).toLowerCase() === email && m.activa === SI;
    });
    if (fila) return { email: email, nombre: fila.nombre || email, rol: fila.rol === ROL.ADMIN ? ROL.ADMIN : ROL.MONITORA };
  }
  if (email === correoPropietario_()) return { email: email, nombre: email, rol: ROL.ADMIN };
  return null;
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
