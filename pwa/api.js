// pwa/api.js — Cliente de la app instalable (PWA, 6-nov-2026).
// Sustituye a google.script.run: Cliente.html llama a window.PWA.llamar(funcion, args) y recibe lo mismo,
// { ok, data | error }. Va con fetch a doPost de la copia de Apps Script (Main.gs), con POST en text/plain para
// que el navegador no haga la consulta previa de CORS, y una clave en cada petición.
// La dirección de la copia (la que acaba en /exec) y la clave se escriben una vez en la pantalla de conexión y se
// guardan en el aparato (localStorage). No están en el código ni en el repositorio.
// También da el historial del navegador para el botón y el gesto atrás (PWA.historia).
(function () {
  'use strict';

  const CLAVE_CONEXION = 'asistencia|conexionPWA';   // { url, clave } en localStorage
  const CODIGO_CLAVE = 'clave';                      // mismo valor que CODIGO_CLAVE_PWA de Config.gs
  const URL_VALIDA = /^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[\w-]+\/exec$/;
  const NO_RESPONDE = 'La dirección no responde como la aplicación. Comprueba que es la de la implementación ' +
    '(acaba en /exec) y que la implementación tiene la última versión del código.';

  function leerConexion() {
    try {
      const c = JSON.parse(window.localStorage.getItem(CLAVE_CONEXION) || 'null');
      return c && c.url && c.clave ? c : null;
    } catch (e) { return null; }
  }
  function guardarConexion(c) {
    try { window.localStorage.setItem(CLAVE_CONEXION, JSON.stringify(c)); return true; } catch (e) { return false; }
  }

  /** Una petición a doPost. Se resuelve con { ok, ... } y se rechaza solo si falla la conexión. */
  function enviar(conexion, funcion, args) {
    return fetch(conexion.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: String(funcion).replace(/^api_/, ''), args: args || [], clave: conexion.clave }),
      redirect: 'follow',
      cache: 'no-store'
    }).then(function (r) {
      return r.text().then(function (texto) {
        try {
          const datos = JSON.parse(texto);
          if (datos && typeof datos.ok === 'boolean') return datos;
        } catch (e) { /* no es JSON: más abajo */ }
        // Google devuelve una página (no JSON) si la dirección no es de la app o la versión no tiene doPost.
        if (r.status >= 500) throw new Error('HTTP ' + r.status);   // fallo pasajero de Google: se puede reintentar
        return { ok: false, error: NO_RESPONDE };
      });
    });
  }

  const sinFin = new Promise(function () {});

  function llamar(funcion, args) {
    if (enlace) { abrirConexionConEnlace(); return sinFin; }   // la pantalla de conexión recarga la app al terminar
    const c = leerConexion();
    if (!c) { abrirConexion(false); return sinFin; }   // la pantalla de conexión recarga la app al terminar
    return enviar(c, funcion, args).then(function (r) {
      if (r && r.codigo === CODIGO_CLAVE) abrirConexion(false, r.error);
      return r;
    });
  }

  // ---------- Historial (botón y gesto atrás) ----------
  // La misma forma que google.script.history, sobre el historial normal del navegador.
  try { history.scrollRestoration = 'manual'; } catch (e) { /* sin control del scroll: se ignora */ }
  const historia = {
    push: function (estado) { history.pushState(estado === undefined ? null : estado, ''); },
    replace: function (estado) { history.replaceState(estado === undefined ? null : estado, ''); },
    setChangeHandler: function (fn) {
      window.addEventListener('popstate', function (e) { fn({ state: e.state }); });
    }
  };

  // ---------- Pantalla de conexión ----------
  // Sale la primera vez, cuando el servidor rechaza la clave y desde Gestión › Conexión de la app.
  // Antes de guardar, prueba la dirección y la clave con api_init; al guardar, recarga la app.

  let pantalla = null;

  function descripcion() {
    const c = leerConexion();
    if (!c) return 'Sin conectar';
    const id = (c.url.match(/\/s\/([\w-]+)\/exec$/) || [])[1] || '';
    return 'Conectada a la copia …' + id.slice(-6) + ' · cambiar la dirección o la clave';
  }

  function abrirConexion(sePuedeCancelar, error) {
    if (pantalla) {
      if (error) mostrarError('pwaClave', error);
      return;
    }
    const c = leerConexion() || { url: '', clave: '' };
    pantalla = document.createElement('div');
    pantalla.className = 'pwa-conexion';
    pantalla.setAttribute('role', 'dialog');
    pantalla.setAttribute('aria-modal', 'true');
    pantalla.setAttribute('aria-labelledby', 'pwaTitulo');
    pantalla.innerHTML =
      '<div class="pwa-conexion-caja">' +
        '<img class="pwa-conexion-icono" src="iconos/icono-192.png" alt="" width="64" height="64">' +
        '<h1 id="pwaTitulo">Conectar la app</h1>' +
        '<p class="ayuda">Escribe la dirección de tu copia de la aplicación (la de la implementación, acaba en ' +
          '<b>/exec</b>) y su clave. Solo hay que hacerlo una vez en este móvil.</p>' +
        '<div class="campo"><label for="pwaUrl">Dirección de la aplicación</label>' +
          '<input id="pwaUrl" type="url" inputmode="url" autocomplete="off" autocapitalize="none" spellcheck="false" ' +
          'placeholder="https://script.google.com/macros/s/…/exec"></div>' +
        '<div class="campo"><label for="pwaClave">Clave</label>' +
          '<input id="pwaClave" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="go"></div>' +
        '<div class="botones">' +
          (sePuedeCancelar ? '<button type="button" class="boton" id="pwaCancelar">Cancelar</button>' : '') +
          '<button type="button" class="boton lleno" id="pwaConectar">Conectar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(pantalla);
    document.body.classList.add('pwa-sin-scroll');
    pantalla.querySelector('#pwaUrl').value = c.url;
    pantalla.querySelector('#pwaClave').value = c.clave;
    pantalla.querySelector('#pwaConectar').addEventListener('click', conectar);
    pantalla.querySelector('#pwaClave').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') conectar(); });
    const cancelar = pantalla.querySelector('#pwaCancelar');
    if (cancelar) cancelar.addEventListener('click', cerrarConexion);
    if (error) mostrarError('pwaClave', error);
    else pantalla.querySelector(c.url ? '#pwaClave' : '#pwaUrl').focus();
  }

  /** Abre la pantalla de conexión con lo que trae el enlace y la pone a conectar. */
  function abrirConexionConEnlace() {
    if (pantalla) return;
    const e = enlace;
    abrirConexion(false);
    pantalla.querySelector('#pwaUrl').value = e.url;
    pantalla.querySelector('#pwaClave').value = e.clave;
    conectar();
  }

  function cerrarConexion() {
    if (!pantalla) return;
    pantalla.remove();
    pantalla = null;
    document.body.classList.remove('pwa-sin-scroll');
  }

  function quitarErrores() {
    pantalla.querySelectorAll('.error-campo').forEach(function (p) { p.remove(); });
    pantalla.querySelectorAll('.con-error').forEach(function (el) { el.classList.remove('con-error'); });
  }

  function mostrarError(id, texto) {
    quitarErrores();
    const input = pantalla.querySelector('#' + id);
    const campo = input.closest('.campo');
    campo.classList.add('con-error');
    const p = document.createElement('p');
    p.className = 'error-campo';
    p.setAttribute('role', 'alert');
    p.textContent = texto;
    campo.appendChild(p);
    input.focus();
  }

  function conectar() {
    const boton = pantalla.querySelector('#pwaConectar');
    if (boton.disabled) return;
    quitarErrores();
    const url = pantalla.querySelector('#pwaUrl').value.trim();
    const clave = pantalla.querySelector('#pwaClave').value.trim();
    if (!URL_VALIDA.test(url)) return mostrarError('pwaUrl', 'Pega la dirección completa: empieza por https://script.google.com/ y acaba en /exec.');
    if (!clave) return mostrarError('pwaClave', 'Escribe la clave.');
    boton.disabled = true;
    boton.classList.add('ocupado');
    boton.innerHTML = '<span class="girador-boton" aria-hidden="true"></span>Comprobando…';
    const soltar = function () {
      boton.disabled = false;
      boton.classList.remove('ocupado');
      boton.textContent = 'Conectar';
    };
    enviar({ url: url, clave: clave }, 'api_init', []).then(function (r) {
      if (r.ok) {
        if (!guardarConexion({ url: url, clave: clave })) {
          soltar();
          return mostrarError('pwaClave', 'Este navegador no deja guardar datos. Sal del modo incógnito o revisa los permisos del sitio.');
        }
        window.location.reload();
        return;
      }
      soltar();
      mostrarError(r.codigo === CODIGO_CLAVE ? 'pwaClave' : 'pwaUrl', r.error || NO_RESPONDE);
    }, function () {
      soltar();
      mostrarError('pwaUrl', navigator.onLine === false
        ? 'No hay conexión. Conéctate a internet y vuelve a probar.'
        : 'No se ha podido conectar con esa dirección. Comprueba que está bien copiada y que la implementación permite «Cualquier usuario, incluso anónimo».');
    });
  }

  /** Dirección /exec a la que está conectada esta app (para el enlace de las claves de Gestión › Monitoras). */
  function urlServidor() {
    const c = leerConexion();
    return c ? c.url : '';
  }

  // ---------- Enlace de conexión (6-nov-2026) ----------
  // Gestión › Monitoras envía a cada monitora un enlace …/#conectar=<dirección /exec>&clave=<clave>. Lo que va
  // detrás de «#» no llega a ningún servidor. Al abrirlo, la app lo lee, lo quita de la dirección y se conecta
  // sola (la pantalla de conexión, rellena, comprueba la clave y recarga).
  let enlace = null;
  (function leerEnlace() {
    const h = String(window.location.hash || '').replace(/^#/, '');
    if (h.indexOf('conectar=') < 0) return;
    const p = new URLSearchParams(h);
    enlace = { url: (p.get('conectar') || '').trim(), clave: (p.get('clave') || '').trim() };
    try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) { /* se ignora */ }
  })();

  window.PWA = {
    llamar: llamar,
    historia: historia,
    descripcion: descripcion,
    abrirConexion: abrirConexion,
    urlServidor: urlServidor
  };

  // ---------- Service worker ----------
  // Guarda los archivos de la app para que arranque rápido. No guarda datos ni llamadas al servidor.
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* sin service worker: la app va igual */ });
    });
  }
})();
