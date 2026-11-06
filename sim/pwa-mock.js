// Simulación del servidor para la app instalable (PWA, 6-nov-2026). La carga `node pwa/build.js --sim`, después de
// mock.js, los .gs y datos.js. Hace que fetch a script.google.com llame a doPost (Main.gs) en el propio navegador,
// como haría Google, y quita google.script para que la app use el camino de la PWA (pwa/api.js).
// Clave del «servidor»: ?clave=… (por defecto «prueba»; ?clave= vacía = copia sin clave).
// En la consola: SIM.props.CLAVE_PWA = '…', SIM.offline = true, SIM.peticiones (cuerpos enviados, sin la clave).
(function () {
  const param = new URLSearchParams(location.search).get('clave');
  const props = { CLAVE_PWA: param === null ? 'prueba' : param };
  window.SIM.props = props;
  window.SIM.peticiones = [];
  window.PropertiesService = { getScriptProperties: function () { return { getProperty: function (k) { return props[k] || null; } }; } };
  window.ContentService = {
    MimeType: { JSON: 'application/json' },
    createTextOutput: function (texto) {
      return { tipo: '', setMimeType: function (t) { this.tipo = t; return this; }, getContent: function () { return texto; } };
    }
  };
  window.Utilities.sleep = function () {};
  window.SIM.correoActivo = '';   // la PWA llega sin cuenta de Google: quién es lo dice la clave

  const fetchReal = window.fetch.bind(window);
  window.fetch = function (url, op) {
    if (!/^https:\/\/script\.google\.com\//.test(String(url))) return fetchReal(url, op);
    return new Promise(function (resolver, rechazar) {
      setTimeout(function () {
        if (window.SIM.offline) { rechazar(new TypeError('Failed to fetch')); return; }
        const tipo = op && op.headers && op.headers['Content-Type'];
        if (!op || op.method !== 'POST' || !/^text\/plain/.test(tipo)) {
          rechazar(new TypeError('CORS: Google solo acepta aquí un POST text/plain sin consulta previa')); return;
        }
        try { const c = JSON.parse(op.body); delete c.clave; window.SIM.peticiones.push(c); } catch (e) { /* se ignora */ }
        if (!/\/exec$/.test(String(url))) {   // dirección equivocada: Google devuelve una página
          resolver(new Response('<html>Página no encontrada</html>', { status: 404, headers: { 'Content-Type': 'text/html' } })); return;
        }
        let salida;
        try { salida = doPost({ postData: { contents: op.body, type: tipo } }); } catch (e) { console.error(e); rechazar(e); return; }
        resolver(new Response(salida.getContent(), { status: 200, headers: { 'Content-Type': salida.tipo } }));
      }, window.SIM.delay);
    });
  };

  delete window.google;   // la PWA no tiene google.script.run ni google.script.history
})();
