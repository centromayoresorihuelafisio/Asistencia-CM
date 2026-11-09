// Simulación del servidor para la app instalable (PWA, 6-nov-2026). La carga `node pwa/build.js --sim`, después de
// mock.js, los .gs y datos.js. Hace que fetch a script.google.com llame a doPost (Main.gs) en el propio navegador,
// como haría Google, y quita google.script para que la app use el camino de la PWA (pwa/api.js).
// Cuentas de prueba (9-nov-2026): «carmen» y «lucia», las dos con la contraseña «prueba»; con ?temporal=lucia
// (o carmen), esa cuenta tiene la contraseña temporal «123456» y tendrá que cambiarla al entrar.
// En la consola: SIM.offline = true, SIM.peticiones (cuerpos enviados, sin token ni contraseñas).
(function () {
  window.SIM.peticiones = [];
  window.ContentService = {
    MimeType: { JSON: 'application/json' },
    createTextOutput: function (texto) {
      return { tipo: '', setMimeType: function (t) { this.tipo = t; return this; }, getContent: function () { return texto; } };
    }
  };
  window.Utilities.sleep = function () {};
  window.SIM.correoActivo = '';   // la PWA llega sin cuenta de Google: quién es lo dice la sesión

  // La app se recarga al entrar, al salir y con «ver como», y la simulación perdería las hojas (están en memoria).
  // Monitoras y Accesos se guardan en sessionStorage de la pestaña tras cada petición y se recuperan al cargar.
  const GUARDADAS = [HOJAS.MONITORAS, HOJAS.ACCESOS];
  const CLAVE_SIM = 'SIM|hojasPWA|' + window.SIM.escenario + '|' + (new URLSearchParams(location.search).get('temporal') || '');
  function guardarHojas() {
    try {
      const o = {};
      GUARDADAS.forEach(function (n) { const h = window.SIM.libro.getSheetByName(n); if (h) o[n] = h.datos; });
      sessionStorage.setItem(CLAVE_SIM, JSON.stringify(o));
    } catch (e) { /* sin sessionStorage: se pierde al recargar */ }
  }
  let recuperadas = null;
  try { recuperadas = JSON.parse(sessionStorage.getItem(CLAVE_SIM) || 'null'); } catch (e) { recuperadas = null; }
  window.SIM.olvidarHojas = function () { sessionStorage.removeItem(CLAVE_SIM); };

  // Usuario y contraseña para cada monitora de datos.js
  const temporal = new URLSearchParams(location.search).get('temporal') || '';
  if (recuperadas) {
    GUARDADAS.forEach(function (n) { const h = window.SIM.libro.getSheetByName(n); if (h && recuperadas[n]) h.datos = recuperadas[n]; });
    invalidarTodo_();
  } else if (existeHoja_(HOJAS.MONITORAS)) {
    const filas = leerTabla_(HOJAS.MONITORAS);
    filas.forEach(function (f) {
      f.usuario = String(f.nombre).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      ponerContrasena_(f, f.usuario === temporal ? '123456' : 'prueba');
      f.debe_cambiar = f.usuario === temporal ? SI : NO;
    });
    actualizarFilas_(HOJAS.MONITORAS, filas);
  }

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
        try {
          const c = JSON.parse(op.body);
          delete c.token;
          if (c.action === 'entrar' || c.action === 'cambiarContrasena') c.args = ['…'];
          window.SIM.peticiones.push(c);
        } catch (e) { /* se ignora */ }
        if (!/\/exec$/.test(String(url))) {   // dirección equivocada: Google devuelve una página
          resolver(new Response('<html>Página no encontrada</html>', { status: 404, headers: { 'Content-Type': 'text/html' } })); return;
        }
        let salida;
        try { salida = doPost({ postData: { contents: op.body, type: tipo } }); } catch (e) { console.error(e); rechazar(e); return; }
        guardarHojas();
        resolver(new Response(salida.getContent(), { status: 200, headers: { 'Content-Type': salida.tipo } }));
      }, window.SIM.delay);
    });
  };

  delete window.google;   // la PWA no tiene google.script.run ni google.script.history
})();
