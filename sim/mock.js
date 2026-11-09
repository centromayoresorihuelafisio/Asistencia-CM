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
  ['setColumnWidth', 'autoResizeColumns', 'setTabColor', 'hideSheet', 'setRowHeight', 'setHiddenGridlines', 'setFrozenColumns'].forEach(function (m) { Hoja.prototype[m] = function () { return this; }; });

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
    BorderStyle: { SOLID: 'SOLID' },
    newDataValidation: cadena,
    getUi: cadena
  };
  const cache = {};
  window.CacheService = { getScriptCache: function () { return { get: function (k) { return null; }, put: function () {}, remove: function () {}, removeAll: function () {} }; } };
  window.LockService = { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } };
  window.Utilities = {
    formatDate: function (d, z, p) { return fmt(d, p); },
    // UUID v4 de verdad (9-nov-2026): los tokens de sesión salen de dos UUID y tienen que ser hexadecimales
    getUuid: function () {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 3 | 8)).toString(16);
      });
    },
    // Exportar el informe (5-nov-2026): el «PDF» y el «Excel» simulados son texto (el HTML o una línea), para ver que se descargan.
    base64Encode: function (bytes) { return btoa(String.fromCharCode.apply(null, bytes)); },
    newBlob: function (texto, tipo) { return new Blob_(texto, tipo); },
    // Claves de la app (6-nov-2026): huella SHA-256 como la de Apps Script (bytes; base64Encode los acepta)
    Charset: { UTF_8: 'UTF-8' },
    DigestAlgorithm: { SHA_256: 'SHA-256' },
    // Con texto o con bytes (las contraseñas, 9-nov-2026, resumen de sal + resumen anterior)
    computeDigest: function (algoritmo, texto) {
      if (Array.isArray(texto)) return sha256_(texto.map(function (b) { return b & 0xff; }));
      return sha256_(Array.from(new TextEncoder().encode(String(texto))));
    },
    sleep: function () {}
  };
  // SHA-256 síncrono (Apps Script lo da hecho; en el navegador, crypto.subtle es asíncrono)
  function sha256_(bytes) {
    const K = [];
    const H = [];
    let n = 2;
    const primo = function (x) { for (let d = 2; d * d <= x; d++) if (x % d === 0) return false; return true; };
    const frac = function (x) { return ((x - Math.floor(x)) * 4294967296) >>> 0; };
    for (let i = 0; i < 64; n++) { if (!primo(n)) continue; if (i < 8) H[i] = frac(Math.pow(n, 1 / 2)); K[i++] = frac(Math.pow(n, 1 / 3)); }
    const largo = bytes.length * 8;
    const m = bytes.slice();
    m.push(0x80);
    while (m.length % 64 !== 56) m.push(0);
    for (let i = 7; i >= 0; i--) m.push(i > 3 ? 0 : (largo >>> (i * 8)) & 0xff);
    const rot = function (x, r) { return (x >>> r) | (x << (32 - r)); };
    for (let b = 0; b < m.length; b += 64) {
      const w = [];
      for (let i = 0; i < 16; i++) w[i] = (m[b + i * 4] << 24) | (m[b + i * 4 + 1] << 16) | (m[b + i * 4 + 2] << 8) | m[b + i * 4 + 3];
      for (let i = 16; i < 64; i++) {
        const s0 = rot(w[i - 15], 7) ^ rot(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rot(w[i - 2], 17) ^ rot(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let a = H[0], bb = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + bb) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    const salida = [];
    H.forEach(function (x) { salida.push(x >>> 24, (x >>> 16) & 0xff, (x >>> 8) & 0xff, x & 0xff); });
    return salida;
  }
  window.SIM.sha256 = sha256_;
  function Blob_(texto, tipo) { this.texto = texto; this.tipo = tipo; this.nombre = ''; }
  Blob_.prototype.getAs = function (tipo) { return new Blob_(this.texto, tipo); };
  Blob_.prototype.setName = function (n) { this.nombre = n; return this; };
  Blob_.prototype.getBytes = function () { return Array.from(new TextEncoder().encode(this.texto)); };
  Libro.prototype.getId = function () { return 'simulado'; };
  window.SIM.borrados = [];
  window.SIM.correos = [];
  window.ScriptApp = { getOAuthToken: function () { return 'token'; }, getService: function () { return { getUrl: function () { return 'https://script.google.com/macros/s/SIMULADA/exec'; } }; } };
  window.UrlFetchApp = { fetch: function (url, op) {
    if (op && op.method === 'delete') window.SIM.borrados.push(url);
    return { getResponseCode: function () { return op && op.method === 'delete' ? 204 : 200; }, getBlob: function () { return new Blob_('xlsx simulado de ' + url, 'xlsx'); } };
  } };
  window.DriveApp = { getFileById: function () { return { setTrashed: function () { window.SIM.papelera = (window.SIM.papelera || 0) + 1; } }; } };
  window.Drive = { Files: { remove: function (id) { window.SIM.borrados.push(id); } } };
  window.MailApp = { getRemainingDailyQuota: function () { return 100; }, sendEmail: function (o) { window.SIM.correos.push(o); } };
  // Quien abre la app (activo) y la propietaria de la copia (efectivo). Con ?e=monitora la propietaria es otra cuenta,
  // así Carmen entra con su rol de la hoja Monitoras (Auth.gs, 6-nov-2026). SIM.correoActivo = '' simula un anónimo.
  window.SIM.correoActivo = 'admin@ejemplo.test';
  const propietaria = window.SIM.escenario === 'monitora' ? 'propietaria@ejemplo.test' : 'admin@ejemplo.test';
  window.Session = { getActiveUser: function () { return { getEmail: function () { return window.SIM.correoActivo; } }; }, getEffectiveUser: function () { return { getEmail: function () { return propietaria; } }; } };

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
