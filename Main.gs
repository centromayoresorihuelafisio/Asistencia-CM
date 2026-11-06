/**
 * Main.gs — Entrada de la web app y menú de la hoja.
 */

/**
 * Icono de la app en la pestaña del navegador y en la pantalla de inicio del móvil (5-nov-2026): una lista con una
 * marca, en el azul pizarra de la app. Apps Script solo lo pone con setFaviconUrl, que pide una URL.
 * - ICONO_APP_URL: si algún día el icono está alojado en una dirección https (por ejemplo, un PNG de 192 × 192 en
 *   un sitio web del centro), se pone aquí y se usa esa.
 * - Si está vacía, se prueba con el propio dibujo como dirección data: (no hay que alojar nada). Si Google no la
 *   acepta, se sigue sin icono, como hasta ahora: la app se abre igual.
 */
const ICONO_APP_URL = '';
const ICONO_APP_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">' +
  '<rect width="96" height="96" rx="22" fill="#34507a"/>' +
  '<g fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M44 30h28M44 48h28M44 66h18"/><path d="M20 30l5 5 9-10"/></g>' +
  '<circle cx="26" cy="48" r="4.5" fill="#fff"/><circle cx="26" cy="66" r="4.5" fill="#fff"/></svg>';

/**
 * Enlace de la web app (/exec o /dev). Desde el 6-nov-2026 solo abre la app a quien Google identifique con su
 * correo (la propietaria o una monitora activa de la hoja Monitoras, Auth.gs). A cualquier otra persona le
 * enseña una página que la manda a la app instalable, que va con clave.
 */
function doGet() {
  if (!identificarMonitora_()) return paginaUsarApp_();
  const salida = HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('Asistencia talleres')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  try {
    salida.setFaviconUrl(ICONO_APP_URL ||
      'data:image/svg+xml;base64,' + Utilities.base64Encode(ICONO_APP_SVG, Utilities.Charset.UTF_8));
  } catch (e) {
    console.warn('No se ha podido poner el icono de la app: ' + e);
  }
  return salida;
}

/** Página del enlace /exec para quien no tiene acceso por su cuenta de Google: lleva a la app instalable. */
function paginaUsarApp_() {
  const html = '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Asistencia talleres</title>' +
    '<style>body{margin:0;font-family:system-ui,Roboto,Arial,sans-serif;background:#f3f6fb;color:#1f2a3a}' +
    'main{max-width:440px;margin:48px auto;padding:28px 24px;background:#fff;border-radius:28px;text-align:center;' +
    'box-shadow:0 1px 2px rgba(60,64,67,.3),0 1px 3px 1px rgba(60,64,67,.15)}h1{font-size:22px;margin:0 0 12px}' +
    'p{font-size:17px;line-height:1.45;color:#5f6368;margin:0 0 20px}a{display:inline-block;padding:14px 24px;border-radius:999px;' +
    'background:#34507a;color:#fff;text-decoration:none;font-weight:600;font-size:17px}</style></head><body><main>' +
    '<h1>Asistencia talleres</h1><p>Esta aplicación se usa desde la app instalada, con la clave que te ha dado la ' +
    'administración.</p><a href="' + URL_PWA + '" target="_top">Abrir la app</a></main></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('Asistencia talleres')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Entrada de la app instalable (PWA, 6-nov-2026). La PWA envía un POST con Content-Type text/plain (así el
 * navegador no hace la consulta previa de CORS) y el cuerpo { action, args, clave } en JSON. Responde en JSON lo
 * mismo que las funciones api_* (Api.gs, atenderPWA_). Quién entra lo dice la clave (Auth.gs, comprobarClavePWA_).
 */
function doPost(e) {
  let respuesta;
  try {
    respuesta = atenderPWA_(e && e.postData ? e.postData.contents : '');
  } catch (err) {
    console.error(err && err.stack ? err.stack : String(err));
    respuesta = { ok: false, error: 'Ha ocurrido un error inesperado. Inténtalo de nuevo y, si se repite, avisa a la persona administradora.' };
  }
  return ContentService.createTextOutput(JSON.stringify(respuesta)).setMimeType(ContentService.MimeType.JSON);
}

function include(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Asistencia')
    .addItem('Configuración inicial (setup)', 'menuSetup')
    .addItem('Importar usuarios desde hoja…', 'menuImportar')
    .addItem('Importar usuarios del documento del centro…', 'menuImportarCentro')
    .addItem('Validar datos', 'menuValidar')
    .addToUi();
}

/** Ejecuta una acción del menú y muestra el error de forma comprensible. */
function ejecutarMenu_(fn) {
  const ui = SpreadsheetApp.getUi();
  try {
    soloAdmin_();
    fn(ui);
  } catch (e) {
    if (!(e && e.paraUsuario)) console.error(e && e.stack ? e.stack : String(e));
    ui.alert('No se ha podido completar', e && e.paraUsuario ? e.message : 'Error inesperado: ' + e, ui.ButtonSet.OK);
  }
}

function menuSetup() {
  ejecutarMenu_(function (ui) {
    const informe = setup();
    ui.alert('Configuración inicial', informe.join('\n'), ui.ButtonSet.OK);
  });
}

function menuValidar() {
  ejecutarMenu_(function (ui) {
    const avisos = validarDatos();
    const texto = avisos.length
      ? avisos.slice(0, 40).join('\n') + (avisos.length > 40 ? '\n… y ' + (avisos.length - 40) + ' avisos más.' : '')
      : 'Todo correcto: no se ha encontrado ningún problema.';
    ui.alert('Validar datos', texto, ui.ButtonSet.OK);
  });
}
