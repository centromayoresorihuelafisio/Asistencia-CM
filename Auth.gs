/**
 * Auth.gs — Identifica a la monitora y calcula sus permisos.
 * Todo el sistema de identificación está aquí: cambiarlo (PIN, otra cuenta…) no debe afectar al resto.
 *
 * Modo actual (6-nov-2026): una sola hoja para todas y una clave por monitora.
 * - La app instalable (PWA) llama a doPost con una clave en cada petición (atenderPWA_ en Api.gs).
 *   La clave CLAVE_PWA de las propiedades del proyecto es la de la propietaria (admin). Cada monitora tiene
 *   la suya, creada en Gestión › Monitoras; en la hoja Monitoras solo se guarda su huella (clave_hash), y la
 *   monitora entra con su rol mientras esté activa.
 * - El enlace de la web app (doGet, google.script.run) ya no lo puede usar cualquiera que lo tenga: solo entra
 *   quien Google identifique con su correo (la propietaria o una monitora activa de la hoja). Al resto, doGet le
 *   enseña una página con el enlace a la app instalable y las api_* le dicen que no tiene acceso.
 * La web app se publica para «Cualquier usuario, incluso anónimo» (`access: ANYONE_ANONYMOUS` en appsscript.json),
 * para que la PWA pueda llamar a doPost sin cuenta de Google.
 */

// Monitora identificada por la clave en esta petición de la PWA (cada ejecución de Apps Script es independiente).
let monitoraPorClave_ = null;

function correoActivo_() {
  return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
}

function correoPropietario_() {
  return String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
}

function filaMonitora_(email) {
  if (!email || !existeHoja_(HOJAS.MONITORAS)) return null;
  return leerTabla_(HOJAS.MONITORAS).find(function (m) {
    return String(m.email).toLowerCase() === email && m.activa === SI;
  }) || null;
}

function monitoraDeFila_(fila) {
  const email = String(fila.email).toLowerCase();
  return { email: email, nombre: fila.nombre || email, rol: fila.rol === ROL.ADMIN ? ROL.ADMIN : ROL.MONITORA };
}

/** La propietaria es siempre admin, esté o no en la hoja Monitoras. */
function monitoraPropietaria_() {
  const email = correoPropietario_();
  const fila = filaMonitora_(email);
  return { email: email, nombre: fila && fila.nombre ? fila.nombre : email, rol: ROL.ADMIN };
}

/**
 * Devuelve { email, nombre, rol } o null si quien llama no tiene acceso.
 * PWA: la monitora de la clave. Web app y menú de la hoja: quien Google identifique con su correo.
 */
function identificarMonitora_() {
  if (monitoraPorClave_) return monitoraPorClave_;
  const email = correoActivo_();
  if (!email) return null;
  if (email === correoPropietario_()) return monitoraPropietaria_();
  const fila = filaMonitora_(email);
  return fila ? monitoraDeFila_(fila) : null;
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

// ---------- Claves de la app instalable (PWA) ----------

/** Huella SHA-256 de una clave, en base64. Es lo que se guarda en Monitoras.clave_hash. */
function huellaClave_(clave) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(clave), Utilities.Charset.UTF_8));
}

/** Clave nueva al azar: 32 caracteres hexadecimales (122 bits al azar de un UUID v4). */
function claveNueva_() {
  return Utilities.getUuid().replace(/-/g, '');
}

/**
 * Comprueba la clave de una petición de la PWA y, si vale, deja identificada a su monitora para esta petición.
 * Devuelve 'ok', 'sin-clave' (la copia no tiene CLAVE_PWA ni ninguna monitora con clave) o 'mal'.
 */
function comprobarClavePWA_(clave) {
  monitoraPorClave_ = null;
  const texto = String(clave || '').trim();
  const propietaria = String(PropertiesService.getScriptProperties().getProperty(PROP_CLAVE_PWA) || '').trim();
  if (propietaria && texto === propietaria) {
    monitoraPorClave_ = monitoraPropietaria_();
    return 'ok';
  }
  const conClave = existeHoja_(HOJAS.MONITORAS)
    ? leerTabla_(HOJAS.MONITORAS).filter(function (m) { return m.clave_hash; }) : [];
  if (!propietaria && !conClave.length) return 'sin-clave';
  if (!texto) return 'mal';
  const huella = huellaClave_(texto);
  const fila = conClave.find(function (m) { return m.clave_hash === huella && m.activa === SI; });
  if (!fila) return 'mal';
  monitoraPorClave_ = monitoraDeFila_(fila);
  return 'ok';
}
