/**
 * Auth.gs — Identifica a la monitora y calcula sus permisos.
 * Todo el sistema de identificación está aquí: cambiarlo no debe afectar al resto.
 *
 * Modo actual (9-nov-2026): una sola hoja para todas y una cuenta por monitora, como en la app de fisio.
 * - En la app instalable (PWA) cada monitora entra con su usuario y contraseña (hoja Monitoras: usuario, y la
 *   contraseña con sal e iteraciones en clave_hash). Al entrar se abre una sesión en ese aparato (hoja Accesos, solo
 *   la huella del token) que dura hasta que se cierra: «Cerrar sesión», cambio de contraseña, monitora desactivada o
 *   «Cerrar sus sesiones» en Ajustes › Monitoras. La PWA manda el token en cada petición (atenderPWA_ en Api.gs).
 * - «Ver como» (solo admin, en la PWA): la sesión guarda a qué monitora está mirando (Accesos.ver_como) y cada
 *   petición se atiende como esa monitora, con sus grupos y su rol. Lo que se guarda lleva en registrada_por el
 *   correo de la persona real (emailRegistro_).
 * - El enlace de la web app (doGet, google.script.run) solo lo puede usar quien Google identifique con su correo
 *   (la propietaria o una monitora activa de la hoja). Al resto, doGet le enseña una página con el enlace a la app
 *   instalable y las api_* le dicen que no tiene acceso.
 * La web app se publica para «Cualquier usuario, incluso anónimo» (`access: ANYONE_ANONYMOUS` en appsscript.json),
 * para que la PWA pueda llamar a doPost sin cuenta de Google.
 */

// Monitora de la sesión de esta petición de la PWA (la de «ver como», si la hay) y la sesión misma
// ({ huella, email, ver_como, dia, real }). Cada ejecución de Apps Script es independiente.
let monitoraDeSesion_ = null;
let sesionEnCurso_ = null;

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
  return {
    email: email, nombre: fila.nombre || email, usuario: fila.usuario || '',
    rol: fila.rol === ROL.ADMIN ? ROL.ADMIN : ROL.MONITORA
  };
}

/** La propietaria es siempre admin, esté o no en la hoja Monitoras. */
function monitoraPropietaria_() {
  const email = correoPropietario_();
  const fila = filaMonitora_(email);
  return { email: email, nombre: fila && fila.nombre ? fila.nombre : email, usuario: fila ? fila.usuario || '' : '', rol: ROL.ADMIN };
}

/**
 * Devuelve { email, nombre, rol } o null si quien llama no tiene acceso.
 * PWA: la monitora de la sesión (o la de «ver como»). Web app y menú de la hoja: quien Google identifique con su correo.
 */
function identificarMonitora_() {
  if (monitoraDeSesion_) return monitoraDeSesion_;
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

/** Correo que se apunta en registrada_por: con «ver como», el de la persona real, no el de la monitora que se mira. */
function emailRegistro_(monitora) {
  return monitora.real ? monitora.real.email : monitora.email;
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

// ---------- Cuentas: usuario y contraseña (9-nov-2026) ----------

function usuarioNormal_(usuario) {
  return String(usuario || '').trim().toLowerCase();
}

function ahoraTexto_() {
  return Utilities.formatDate(new Date(), ZONA_HORARIA, 'yyyy-MM-dd HH:mm');
}

/** Resumen de una contraseña (como en la app de fisio): «iteraciones$base64», para poder cambiar las iteraciones sin invalidar cuentas. */
function resumenContrasena_(contrasena, sal, iteraciones) {
  const salBytes = Utilities.newBlob(sal).getBytes();
  let d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sal + ':' + contrasena, Utilities.Charset.UTF_8);
  for (let i = 0; i < iteraciones; i++) {
    d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salBytes.concat(d));
  }
  return iteraciones + '$' + Utilities.base64Encode(d);
}

/** ¿Tiene contraseña? Las huellas de las claves antiguas (6-nov-2026, sin «$» ni sal) ya no valen. */
function tieneContrasena_(fila) {
  return /^\d+\$/.test(String(fila.clave_hash || '')) && !!fila.sal;
}

function contrasenaCorrecta_(contrasena, fila) {
  if (!tieneContrasena_(fila)) return false;
  const iteraciones = Number(String(fila.clave_hash).split('$')[0]);
  return resumenContrasena_(String(contrasena), fila.sal, iteraciones) === fila.clave_hash;
}

/** Pone una contraseña nueva en la fila (sal nueva), sin escribirla en la hoja. */
function ponerContrasena_(fila, contrasena) {
  fila.sal = Utilities.getUuid();
  fila.clave_hash = resumenContrasena_(String(contrasena), fila.sal, CONTRASENA_ITERACIONES);
  fila.intentos = 0;
  fila.bloqueada_hasta = '';
}

function comprobarContrasenaNueva_(contrasena) {
  const c = String(contrasena || '');
  if (c.length < CONTRASENA_MIN) throw errorApp_('La contraseña tiene que tener al menos ' + CONTRASENA_MIN + ' caracteres.');
  if (c.length > CONTRASENA_MAX) throw errorApp_('La contraseña es demasiado larga.');
}

/** Contraseña temporal de 6 cifras, sacada de un UUID al azar. */
function contrasenaTemporal_() {
  return ('000000' + (parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 12), 16) % 1000000)).slice(-6);
}

function filaPorUsuario_(filas, usuario) {
  const u = usuarioNormal_(usuario);
  return u ? filas.find(function (m) { return usuarioNormal_(m.usuario) === u; }) || null : null;
}

/** Aviso a la propietaria cuando una cuenta se bloquea por intentos fallidos. Si el correo falla, se sigue. */
function avisarBloqueo_(fila) {
  try {
    MailApp.sendEmail(correoPropietario_(), 'Asistencia talleres: cuenta bloqueada',
      'La cuenta «' + fila.usuario + '» (' + (fila.nombre || fila.email) + ') ha fallado la contraseña ' + MAX_FALLOS +
      ' veces seguidas y queda bloqueada ' + BLOQUEO_MIN + ' minutos.\n\nSi no ha sido ella, puede ser alguien probando ' +
      'contraseñas: cámbiale la contraseña en Ajustes › Monitoras.');
  } catch (e) {
    console.warn('No se ha podido enviar el aviso de bloqueo: ' + e);
  }
}

// ---------- Sesiones de la app instalable (hoja Accesos) ----------
// El token (64 caracteres hexadecimales al azar) solo lo tiene el aparato; en la hoja va su huella. Cada sesión se
// guarda además en CacheService (hasta 6 horas) para no leer la hoja en cada petición. Toda forma de cerrar una
// sesión quita también su copia de la caché (cerrarSesiones_).

const CACHE_SESION_S = 21600;
const LARGO_APARATO = 60;

function huellaToken_(token) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token), Utilities.Charset.UTF_8));
}

function claveCacheSesion_(huella) {
  return 'acceso:' + huella;
}

function guardarSesionEnCache_(s) {
  CacheService.getScriptCache().put(claveCacheSesion_(s.huella),
    JSON.stringify({ huella: s.huella, email: s.email, ver_como: s.ver_como || '', dia: s.dia || '' }), CACHE_SESION_S);
}

/** Abre una sesión para esa monitora en este aparato. Hay que llamarla dentro de conBloqueo_. Devuelve el token. */
function abrirSesion_(email, aparato) {
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  const ahora = ahoraTexto_();
  const s = { huella: huellaToken_(token), email: email, ver_como: '', dia: hoy_() };
  anadirFilas_(HOJAS.ACCESOS, [{
    token_hash: s.huella, email: email, aparato: String(aparato || '').replace(/\s+/g, ' ').trim().slice(0, LARGO_APARATO),
    creada: ahora, ultimo_uso: ahora, ver_como: ''
  }]);
  guardarSesionEnCache_(s);
  return token;
}

/** La sesión del token ({ huella, email, ver_como, dia }), o null si no existe o se ha cerrado. */
function leerSesion_(token) {
  if (!/^[0-9a-f]{64}$/.test(String(token || ''))) return null;
  const huella = huellaToken_(token);
  const guardada = CacheService.getScriptCache().get(claveCacheSesion_(huella));
  if (guardada) return JSON.parse(guardada);
  if (!existeHoja_(HOJAS.ACCESOS)) return null;
  const fila = leerTabla_(HOJAS.ACCESOS).find(function (a) { return a.token_hash === huella; });
  if (!fila) return null;
  const s = { huella: huella, email: String(fila.email).toLowerCase(), ver_como: fila.ver_como || '', dia: String(fila.ultimo_uso || '').slice(0, 10) };
  guardarSesionEnCache_(s);
  return s;
}

/** Cambia campos de la fila de una sesión (dentro de conBloqueo_). Devuelve false si la sesión ya no está. */
function cambiarFilaSesion_(huella, campos) {
  const fila = leerTabla_(HOJAS.ACCESOS).find(function (a) { return a.token_hash === huella; });
  if (!fila) return false;
  Object.assign(fila, campos);
  actualizarFilas_(HOJAS.ACCESOS, [fila]);
  return true;
}

/** Apunta el último uso de la sesión, como mucho una vez al día (para no escribir en cada petición). */
function tocarSesion_(s) {
  const hoy = hoy_();
  if (s.dia === hoy) return;
  try {
    conBloqueo_(function () { cambiarFilaSesion_(s.huella, { ultimo_uso: ahoraTexto_() }); });
    s.dia = hoy;
    guardarSesionEnCache_(s);
  } catch (e) {
    // Si la hoja está ocupada, se apuntará otro día: no impide atender la petición.
  }
}

/** Cierra las sesiones de una monitora, salvo la de la huella «excepto». Hay que llamarla dentro de conBloqueo_. */
function cerrarSesiones_(email, excepto) {
  if (!existeHoja_(HOJAS.ACCESOS)) return 0;
  const correo = String(email || '').toLowerCase();
  const quitar = leerTabla_(HOJAS.ACCESOS).filter(function (a) {
    return String(a.email).toLowerCase() === correo && a.token_hash !== excepto;
  });
  borrarFilas_(HOJAS.ACCESOS, quitar.map(function (a) { return a._fila; }));
  if (quitar.length) CacheService.getScriptCache().removeAll(quitar.map(function (a) { return claveCacheSesion_(a.token_hash); }));
  return quitar.length;
}

/** Sesiones abiertas de una monitora, para Ajustes › Monitoras: { aparato, creada, ultimo_uso, actual }. */
function sesionesDe_(email, accesos) {
  const correo = String(email || '').toLowerCase();
  return accesos.filter(function (a) { return String(a.email).toLowerCase() === correo; }).map(function (a) {
    return {
      aparato: a.aparato || 'Aparato sin nombre', creada: a.creada, ultimo_uso: a.ultimo_uso,
      actual: !!(sesionEnCurso_ && sesionEnCurso_.huella === a.token_hash)
    };
  }).sort(function (a, b) { return String(b.ultimo_uso).localeCompare(String(a.ultimo_uso)); });
}

/**
 * Comprueba el token de una petición de la PWA y, si vale, deja identificada a su monitora para esta petición
 * (o a la de «ver como», con los datos de la persona real en .real). Devuelve 'ok', 'cambiar' (tiene que cambiar la
 * contraseña temporal antes de seguir) o 'mal' (sin sesión, cerrada o monitora desactivada).
 */
function comprobarSesionPWA_(token) {
  monitoraDeSesion_ = null;
  sesionEnCurso_ = null;
  const s = leerSesion_(token);
  if (!s) return 'mal';
  const fila = filaMonitora_(s.email);
  if (!fila) return 'mal';
  const real = monitoraDeFila_(fila);
  s.real = real;
  sesionEnCurso_ = s;
  if (fila.debe_cambiar === SI) return 'cambiar';
  tocarSesion_(s);
  let efectiva = real;
  if (s.ver_como && real.rol === ROL.ADMIN && s.ver_como !== real.email) {
    const otra = filaMonitora_(s.ver_como);
    if (otra) efectiva = Object.assign(monitoraDeFila_(otra), { real: { email: real.email, nombre: real.nombre } });
  }
  monitoraDeSesion_ = efectiva;
  return 'ok';
}

// ---------- Acciones de la sesión (PWA): entrar, salir, cambiar la contraseña y «ver como» ----------
// Las llama atenderPWA_ (Api.gs) antes de las api_* de siempre. Lanzan errorApp_ con el mensaje para la pantalla.

/** Entrar con usuario y contraseña. Devuelve { token, nombre, debeCambiar }. */
function entrarPWA_(usuario, contrasena, aparato) {
  if (!usuarioNormal_(usuario) || !String(contrasena || '')) throw errorApp_('Escribe tu usuario y tu contraseña.');
  const r = conBloqueo_(function () {
    if (!existeHoja_(HOJAS.ACCESOS)) throw errorApp_('Falta la hoja «' + HOJAS.ACCESOS + '». Ejecuta «Configuración inicial» desde el menú de la hoja.');
    completarCabeceras_(hoja_(HOJAS.MONITORAS), HOJAS.MONITORAS);
    const filas = leerTabla_(HOJAS.MONITORAS);
    if (!filas.some(tieneContrasena_)) return { sinCuentas: true };
    const fila = filaPorUsuario_(filas, usuario);
    if (!fila || fila.activa !== SI || !tieneContrasena_(fila)) return { mal: true };
    if (Number(fila.bloqueada_hasta) > Date.now()) return { bloqueada: true };
    if (!contrasenaCorrecta_(contrasena, fila)) {
      fila.intentos = (Number(fila.intentos) || 0) + 1;
      let bloqueo = false;
      if (fila.intentos >= MAX_FALLOS) {
        fila.intentos = 0;
        fila.bloqueada_hasta = String(Date.now() + BLOQUEO_MIN * 60000);
        bloqueo = true;
      }
      actualizarFilas_(HOJAS.MONITORAS, [fila]);
      return { mal: true, bloqueo: bloqueo ? fila : null };
    }
    fila.intentos = 0;
    fila.bloqueada_hasta = '';
    fila.ultimo_acceso = ahoraTexto_();
    actualizarFilas_(HOJAS.MONITORAS, [fila]);
    const email = String(fila.email).toLowerCase();
    return { token: abrirSesion_(email, aparato), nombre: fila.nombre || email, debeCambiar: fila.debe_cambiar === SI };
  });
  if (r.sinCuentas) {
    throw errorApp_('La aplicación todavía no tiene ninguna cuenta con contraseña. En la hoja de cálculo, menú Asistencia › «Crear o recuperar el acceso de administración».');
  }
  if (r.bloqueada) throw errorApp_('Demasiados intentos. Espera ' + BLOQUEO_MIN + ' minutos y vuelve a probar.');
  if (r.mal) {
    if (r.bloqueo) avisarBloqueo_(r.bloqueo);
    Utilities.sleep(ESPERA_CLAVE_MAL_MS);
    throw errorApp_('Usuario o contraseña incorrectos.');
  }
  return r;
}

/** Cierra la sesión de este aparato (si ya no existía, no pasa nada). */
function salirPWA_() {
  const s = sesionEnCurso_;
  if (!s) return { hecho: true };
  conBloqueo_(function () {
    const fila = leerTabla_(HOJAS.ACCESOS).find(function (a) { return a.token_hash === s.huella; });
    if (fila) borrarFilas_(HOJAS.ACCESOS, [fila._fila]);
  });
  CacheService.getScriptCache().remove(claveCacheSesion_(s.huella));
  return { hecho: true };
}

/** Cambia la contraseña de quien tiene la sesión (también la temporal). Cierra sus sesiones en otros aparatos. */
function cambiarContrasenaPWA_(actual, nueva) {
  const s = sesionEnCurso_;
  comprobarContrasenaNueva_(nueva);
  if (String(nueva) === String(actual)) throw errorApp_('La contraseña nueva tiene que ser distinta de la que tienes.');
  return conBloqueo_(function () {
    const fila = leerTabla_(HOJAS.MONITORAS).find(function (m) { return String(m.email).toLowerCase() === s.email; });
    if (!fila || fila.activa !== SI) throw errorApp_('Tu cuenta ya no está activa.');
    if (!contrasenaCorrecta_(actual, fila)) throw errorApp_('La contraseña actual no es correcta.');
    ponerContrasena_(fila, nueva);
    fila.debe_cambiar = NO;
    actualizarFilas_(HOJAS.MONITORAS, [fila]);
    return { hecho: true, otrasCerradas: cerrarSesiones_(s.email, s.huella) };
  });
}

/** «Ver como» (solo admin): email de una monitora activa para ver la app como ella, o vacío para volver a la cuenta propia. */
function verComoPWA_(email) {
  const s = sesionEnCurso_;
  if (s.real.rol !== ROL.ADMIN) throw errorApp_('Solo la persona administradora puede ver la app como otra monitora.');
  const correo = String(email || '').trim().toLowerCase();
  let nombre = '';
  if (correo) {
    if (correo === s.email) throw errorApp_('Esa es tu propia cuenta.');
    const otra = filaMonitora_(correo);
    if (!otra) throw errorApp_('Esa monitora no existe o está desactivada.');
    nombre = otra.nombre || correo;
  }
  conBloqueo_(function () {
    if (!cambiarFilaSesion_(s.huella, { ver_como: correo })) throw errorApp_('La sesión se ha cerrado. Vuelve a entrar.');
  });
  s.ver_como = correo;
  guardarSesionEnCache_(s);
  return { verComo: correo, nombre: nombre };
}

// ---------- Recuperar el acceso (menú de la hoja) ----------

/**
 * Para quien ejecuta el menú (admin identificada por Google): le pone usuario (si no tenía; «admin» por defecto) y una
 * contraseña temporal, la activa y la desbloquea. Si no está en la hoja Monitoras (la propietaria), la añade como admin.
 * Sirve para la primera cuenta y para recuperar el acceso. Devuelve { usuario, contrasena }.
 */
function recuperarAccesoAdmin_(admin) {
  return conBloqueo_(function () {
    completarCabeceras_(hoja_(HOJAS.MONITORAS), HOJAS.MONITORAS);
    const filas = leerTabla_(HOJAS.MONITORAS);
    let fila = filas.find(function (m) { return String(m.email).toLowerCase() === admin.email; });
    const nueva = !fila;
    if (nueva) fila = { email: admin.email, nombre: admin.nombre && admin.nombre !== admin.email ? admin.nombre : 'Administración', rol: ROL.ADMIN };
    if (!fila.usuario) {
      let usuario = 'admin';
      for (let n = 2; filaPorUsuario_(filas, usuario); n++) usuario = 'admin' + n;
      fila.usuario = usuario;
    }
    const contrasena = contrasenaTemporal_();
    ponerContrasena_(fila, contrasena);
    fila.activa = SI;
    fila.debe_cambiar = SI;
    if (nueva) anadirFilas_(HOJAS.MONITORAS, [fila]); else actualizarFilas_(HOJAS.MONITORAS, [fila]);
    return { usuario: fila.usuario, contrasena: contrasena };
  });
}
