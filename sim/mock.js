// Simulación de Apps Script en el navegador: hojas en memoria, google.script.run con retardo.
(function () {
  const q = new URLSearchParams(location.search);
  window.SIM = { delay: Number(q.get('delay') || 1500), offline: q.get('offline') === '1', error: q.get('error') || '', escenario: q.get('e') || 'normal', llamadas: [] };

  function pad(n) { return String(n).padStart(2, '0'); }
  function fmt(d, p) {
    return p.replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate()))
      .replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes())).replace('ss', pad(d.getSeconds()));
  }
  // Cadena que acepta cualquier método (formatos, validaciones, colores…)
  function cadena() {
    const p = new Proxy(function () {}, { get: function (t, k) { if (k === 'build') return function () { return {}; }; return function () { return p; }; }, apply: function () { return p; } });
    return p;
  }
  function Hoja(nombre, datos) { this.nombre = nombre; this.datos = datos || []; }
  Hoja.prototype.getLastRow = function () { return this.datos.length; };
  Hoja.prototype.getLastColumn = function () { return this.datos[0] ? this.datos[0].length : 0; };
  Hoja.prototype.getMaxRows = function () { return Math.max(1000, this.datos.length); };
  Hoja.prototype.getName = function () { return this.nombre; };
  Hoja.prototype.setName = function (n) { this.nombre = n; return this; };
  Hoja.prototype.clear = function () { this.datos = []; return this; };
  Hoja.prototype.deleteRows = function (r, n) { this.datos.splice(r - 1, n); };
  Hoja.prototype.appendRow = function (f) { this.datos.push(f.slice()); };
  Hoja.prototype.getRange = function (r, c, nr, nc) {
    const h = this; nr = nr || 1; nc = nc || 1;
    const rango = new Proxy({}, { get: function (t, k) {
      if (k === 'getValues') return function () {
        const out = [];
        for (let i = 0; i < nr; i++) { const fila = h.datos[r - 1 + i] || []; const o = []; for (let j = 0; j < nc; j++) { const v = fila[c - 1 + j]; o.push(v === undefined ? '' : v); } out.push(o); }
        return out;
      };
      if (k === 'getValue') return function () { const f = h.datos[r - 1] || []; return f[c - 1] === undefined ? '' : f[c - 1]; };
      if (k === 'setValues') return function (v) { v.forEach(function (fila, i) { const idx = r - 1 + i; while (h.datos.length <= idx) h.datos.push([]); fila.forEach(function (x, j) { h.datos[idx][c - 1 + j] = x; }); }); return rango; };
      if (k === 'setValue') return function (x) { while (h.datos.length < r) h.datos.push([]); h.datos[r - 1][c - 1] = x; return rango; };
      return function () { return rango; };
    } });
    return rango;
  };
  Hoja.prototype.setFrozenRows = function () { return this; };
  ['setColumnWidth', 'autoResizeColumns', 'setTabColor', 'hideSheet'].forEach(function (m) { Hoja.prototype[m] = function () { return this; }; });

  function Libro() { this.hojas = []; }
  Libro.prototype.getSheetByName = function (n) { return this.hojas.find(function (h) { return h.nombre === n; }) || null; };
  Libro.prototype.insertSheet = function (n) { const h = new Hoja(n); this.hojas.push(h); return h; };
  Libro.prototype.getSheets = function () { return this.hojas; };
  Libro.prototype.getUrl = function () { return 'https://docs.google.com/spreadsheets/d/simulado'; };
  Libro.prototype.setSpreadsheetTimeZone = function () {};
  const libro = new Libro();
  window.SIM.libro = libro;

  window.SpreadsheetApp = {
    getActiveSpreadsheet: function () { return libro; },
    openById: function () { throw new Error('openById no simulado'); },
    create: function (n) { const l = new Libro(); l.insertSheet('Hoja 1'); return l; },
    flush: function () {},
    newDataValidation: cadena,
    getUi: cadena
  };
  const cache = {};
  window.CacheService = { getScriptCache: function () { return { get: function (k) { return null; }, put: function () {}, remove: function () {}, removeAll: function () {} }; } };
  window.LockService = { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } };
  window.Utilities = {
    formatDate: function (d, z, p) { return fmt(d, p); },
    getUuid: function () { return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); },
    // Exportar el informe (5-nov-2026): el «PDF» y el «Excel» simulados son texto (el HTML o una línea), para ver que se descargan.
    base64Encode: function (bytes) { return btoa(String.fromCharCode.apply(null, bytes)); },
    newBlob: function (texto, tipo) { return new Blob_(texto, tipo); }
  };
  function Blob_(texto, tipo) { this.texto = texto; this.tipo = tipo; this.nombre = ''; }
  Blob_.prototype.getAs = function (tipo) { return new Blob_(this.texto, tipo); };
  Blob_.prototype.setName = function (n) { this.nombre = n; return this; };
  Blob_.prototype.getBytes = function () { return Array.from(new TextEncoder().encode(this.texto)); };
  Libro.prototype.getId = function () { return 'simulado'; };
  window.SIM.borrados = [];
  window.SIM.correos = [];
  window.ScriptApp = { getOAuthToken: function () { return 'token'; } };
  window.UrlFetchApp = { fetch: function (url, op) {
    if (op && op.method === 'delete') window.SIM.borrados.push(url);
    return { getResponseCode: function () { return op && op.method === 'delete' ? 204 : 200; }, getBlob: function () { return new Blob_('xlsx simulado de ' + url, 'xlsx'); } };
  } };
  window.DriveApp = { getFileById: function () { return { setTrashed: function () {} }; } };
  window.MailApp = { getRemainingDailyQuota: function () { return 100; }, sendEmail: function (o) { window.SIM.correos.push(o); } };
  const correo = 'admin@ejemplo.test';
  window.Session = { getActiveUser: function () { return { getEmail: function () { return correo; } }; }, getEffectiveUser: function () { return { getEmail: function () { return correo; } }; } };

  // google.script.run
  function runner(ok, ko) {
    return new Proxy({}, { get: function (t, k) {
      if (k === 'withSuccessHandler') return function (f) { return runner(f, ko); };
      if (k === 'withFailureHandler') return function (f) { return runner(ok, f); };
      return function () {
        const args = JSON.parse(JSON.stringify(Array.prototype.slice.call(arguments)));
        window.SIM.llamadas.push(k + '(' + args.map(function (a) { return JSON.stringify(a); }).join(', ').slice(0, 80) + ')');
        setTimeout(function () {
          if (window.SIM.offline) { if (ko) ko(new Error('NetworkError: Connection failure due to HTTP 0')); return; }
          if (window.SIM.error && (window.SIM.error === '*' || window.SIM.error === k)) {
            ok && ok({ ok: false, error: 'Ha ocurrido un error inesperado. Inténtalo de nuevo y, si se repite, avisa a la persona administradora.' }); return;
          }
          let r;
          try { r = JSON.parse(JSON.stringify(window[k].apply(null, args))); } catch (e) { console.error(e); if (ko) ko(e); return; }
          if (ok) ok(r);
        }, window.SIM.delay);
      };
    } });
  }
  // google.script.history: en Apps Script cambia el historial de la página de arriba (fuera del marco).
  // Aquí, con history.pushState y popstate, sin tocar la dirección (que lleva los parámetros de la simulación).
  // En la consola, SIM.historial lista las entradas añadidas.
  window.SIM.historial = [];
  // En Apps Script la app va en un marco y el navegador no mueve su scroll al ir atrás: aquí tampoco.
  history.scrollRestoration = 'manual';
  const historia = {
    push: function (estado) { window.SIM.historial.push(JSON.stringify(estado)); history.pushState(estado === undefined ? null : estado, ''); },
    replace: function (estado) { history.replaceState(estado === undefined ? null : estado, ''); },
    setChangeHandler: function (fn) {
      window.addEventListener('popstate', function (e) { fn({ state: e.state, location: { hash: location.hash.replace(/^#/, ''), parameter: {}, parameters: {} } }); });
    }
  };
  window.google = { script: { run: runner(null, null), history: historia } };
})();
