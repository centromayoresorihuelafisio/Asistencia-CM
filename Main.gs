/**
 * Main.gs — Entrada de la web app y menú de la hoja.
 */

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('Asistencia talleres')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Asistencia')
    .addItem('Configuración inicial (setup)', 'menuSetup')
    .addItem('Importar usuarios desde hoja…', 'menuImportar')
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
