// pwa/api.js — Cliente de la app instalable (PWA, 6-nov-2026; usuario y contraseña desde el 9-nov-2026).
// Sustituye a google.script.run: Cliente.html llama a window.PWA.llamar(funcion, args) y recibe lo mismo,
// { ok, data | error }. Va con fetch a doPost de Apps Script (Main.gs), con POST en text/plain para que el
// navegador no haga la consulta previa de CORS, y el token de la sesión en cada petición.
// - Dirección del servidor (la que acaba en /exec): la pone pwa/build.js al publicar (variable URL_SERVIDOR de
//   GitHub Actions). Si no la tiene, la trae el enlace de Ajustes › Monitoras (#conectar=…) o se escribe en la
//   pantalla de entrada; entonces se guarda en el aparato. No está en el repositorio.
// - Sesión: al entrar con usuario y contraseña, el servidor da un token que se guarda en el aparato (localStorage)
//   y vale hasta que se cierra: «Cerrar sesión», cambio de contraseña o el admin desde Ajustes › Monitoras.
// También da el historial del navegador para el botón y el gesto atrás (PWA.historia).
(function () {
  'use strict';

  const URL_PUBLICADA = '__URL_SERVIDOR__';            // pwa/build.js la sustituye (vacía si no hay)
  const CLAVE_SERVIDOR = 'asistencia|servidorPWA';    // dirección /exec escrita o traída por el enlace
  const CLAVE_SESION = 'asistencia|sesionPWA';        // { token, usuario, nombre }
  const CLAVE_ANTIGUA = 'asistencia|conexionPWA';     // { url, clave } de antes del 9-nov-2026: se aprovecha la dirección
  const CODIGO_SESION = 'sesion';                     // mismo valor que CODIGO_SESION_PWA de Config.gs
  const CODIGO_CAMBIAR = 'cambiar';                   // mismo valor que CODIGO_CAMBIAR_PWA de Config.gs
  const MIN_CONTRASENA = 4;                           // mismo valor que CONTRASENA_MIN de Config.gs
  const URL_VALIDA = /^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[\w-]+\/exec$/;
  const NO_RESPONDE = 'La dirección no responde como la aplicación. Comprueba que es la de la implementación ' +
    '(acaba en /exec) y que la implementación tiene la última versión del código.';

  // ---------- Lo guardado en el aparato ----------

  function leer(clave) {
    try { return JSON.parse(window.localStorage.getItem(clave) || 'null'); } catch (e) { return null; }
  }
  function guardar(clave, valor) {
    try {
      if (valor === null) window.localStorage.removeItem(clave);
      else window.localStorage.setItem(clave, JSON.stringify(valor));
      return true;
    } catch (e) { return false; }
  }

  function urlPublicada() {
    return URL_VALIDA.test(URL_PUBLICADA) ? URL_PUBLICADA : '';
  }
  function urlServidor() {
    return urlPublicada() || leer(CLAVE_SERVIDOR) || '';
  }
  function leerSesion() {
    const s = leer(CLAVE_SESION);
    return s && s.token ? s : null;
  }

  (function migrar() {
    const antigua = leer(CLAVE_ANTIGUA);
    if (!antigua) return;
    if (antigua.url && !leer(CLAVE_SERVIDOR)) guardar(CLAVE_SERVIDOR, antigua.url);
    guardar(CLAVE_ANTIGUA, null);
  })();

  // ---------- Enlace de Ajustes › Monitoras ----------
  // …/#conectar=<dirección /exec>&usuario=<usuario>. Lo que va detrás de «#» no llega a ningún servidor. Se lee, se
  // quita de la dirección y sirve para guardar la dirección del servidor y dejar el usuario escrito en la entrada.
  let usuarioDelEnlace = '';
  (function leerEnlace() {
    const h = String(window.location.hash || '').replace(/^#/, '');
    if (h.indexOf('conectar=') < 0 && h.indexOf('usuario=') < 0) return;
    const p = new URLSearchParams(h);
    const url = (p.get('conectar') || '').trim();
    if (URL_VALIDA.test(url) && !urlPublicada()) guardar(CLAVE_SERVIDOR, url);
    usuarioDelEnlace = (p.get('usuario') || '').trim();
    try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) { /* se ignora */ }
  })();

  /** Nombre corto del aparato para Ajustes › Monitoras («Android · Chrome», «iPhone · Safari»). */
  function aparato() {
    const ua = navigator.userAgent || '';
    const sistema = /Android/i.test(ua) ? 'Android' : /iPhone/i.test(ua) ? 'iPhone' : /iPad/i.test(ua) ? 'iPad'
      : /Windows/i.test(ua) ? 'Windows' : /Macintosh/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'Otro';
    const nav = /SamsungBrowser/i.test(ua) ? 'Samsung Internet' : /Edg\//i.test(ua) ? 'Edge' : /Firefox|FxiOS/i.test(ua) ? 'Firefox'
      : /Chrome|CriOS/i.test(ua) ? 'Chrome' : /Safari/i.test(ua) ? 'Safari' : 'navegador';
    let instalada = false;
    try { instalada = window.matchMedia('(display-mode: standalone)').matches; } catch (e) { /* se ignora */ }
    return sistema + ' · ' + nav + (instalada ? ' (app instalada)' : '');
  }

  // ---------- Peticiones ----------

  /** Una petición a doPost. Se resuelve con { ok, ... } y se rechaza solo si falla la conexión. */
  function enviar(url, accion, args, token) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: String(accion).replace(/^api_/, ''), args: args || [], token: token || '' }),
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

  /** Lo que llama Cliente.html. Sin sesión, o si el servidor la da por cerrada, sale la pantalla de entrada (que recarga la app). */
  function llamar(funcion, args) {
    const url = urlServidor();
    const s = leerSesion();
    if (!url || !s) { abrirEntrada(); return sinFin; }
    return enviar(url, funcion, args, s.token).then(function (r) {
      if (r && r.codigo === CODIGO_SESION) {
        guardar(CLAVE_SESION, null);
        abrirEntrada(r.error, s.usuario);
        return sinFin;
      }
      if (r && r.codigo === CODIGO_CAMBIAR) { abrirCambio(true, ''); return sinFin; }
      return r;
    });
  }

  /** Acción de la sesión (salir, cambiar la contraseña, ver como) con el token guardado. Se resuelve con data o se rechaza con un Error. */
  function accionSesion(accion, args) {
    const s = leerSesion();
    if (!s) return Promise.reject(new Error('No hay ninguna sesión abierta.'));
    return enviar(urlServidor(), accion, args, s.token).then(function (r) {
      if (r.ok) return r.data;
      const e = new Error(r.error || 'Respuesta no válida del servidor.');
      e.codigo = r.codigo;
      throw e;
    }, function () {
      throw new Error('No se ha podido conectar con el servidor. Comprueba la conexión e inténtalo de nuevo.');
    });
  }

  /** Cierra la sesión de este aparato y vuelve a la pantalla de entrada. Si no hay conexión, se cierra igual aquí. */
  function salir() {
    const s = leerSesion();
    const fin = function () {
      guardar(CLAVE_SESION, null);
      window.location.reload();
    };
    if (!s) { fin(); return sinFin; }
    accionSesion('salir', []).then(fin, fin);
    return sinFin;
  }

  /** «Ver como» (admin): email de una monitora, o vacío para volver. Al terminar, recarga la app. */
  function verComo(email) {
    return accionSesion('verComo', [email || '']).then(function (d) {
      window.location.reload();
      return d;
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

  // ---------- Pantallas de entrada y de cambio de contraseña ----------
  // Ocupan toda la pantalla, por encima de la app. La de entrada sale sin sesión o cuando el servidor la da por cerrada;
  // la de cambio, tras entrar con una contraseña temporal (obligatoria) o desde Gestión › Tu cuenta (se puede cancelar).

  let pantalla = null;

  function crearPantalla(html) {
    cerrarPantalla();
    pantalla = document.createElement('div');
    pantalla.className = 'pwa-conexion';
    pantalla.setAttribute('role', 'dialog');
    pantalla.setAttribute('aria-modal', 'true');
    pantalla.setAttribute('aria-labelledby', 'pwaTitulo');
    pantalla.innerHTML = '<form class="pwa-conexion-caja" novalidate>' +
      '<img class="pwa-conexion-icono" src="iconos/icono-192.png" alt="" width="64" height="64">' + html + '</form>';
    document.body.appendChild(pantalla);
    document.body.classList.add('pwa-sin-scroll');
    return pantalla;
  }

  function cerrarPantalla() {
    if (!pantalla) return;
    pantalla.remove();
    pantalla = null;
    document.body.classList.remove('pwa-sin-scroll');
  }

  function campo(id, etiqueta, atributos, valor, ayuda) {
    return '<div class="campo"><label for="' + id + '">' + etiqueta + '</label>' +
      '<input id="' + id + '" ' + atributos + ' value="' + String(valor || '').replace(/"/g, '&quot;') + '">' +
      (ayuda ? '<p class="ayuda">' + ayuda + '</p>' : '') + '</div>';
  }

  function quitarErrores() {
    pantalla.querySelectorAll('.error-campo').forEach(function (p) { p.remove(); });
    pantalla.querySelectorAll('.con-error').forEach(function (el) { el.classList.remove('con-error'); });
  }

  function mostrarError(id, texto) {
    quitarErrores();
    const input = pantalla.querySelector('#' + id);
    const c = input.closest('.campo');
    c.classList.add('con-error');
    const p = document.createElement('p');
    p.className = 'error-campo';
    p.setAttribute('role', 'alert');
    p.textContent = texto;
    c.appendChild(p);
    input.focus();
  }

  function ocupar(boton, texto) {
    boton.disabled = true;
    boton.classList.add('ocupado');
    const antes = boton.innerHTML;
    boton.innerHTML = '<span class="girador-boton" aria-hidden="true"></span>' + texto;
    return function () {
      boton.disabled = false;
      boton.classList.remove('ocupado');
      boton.innerHTML = antes;
    };
  }

  function valorDe(id) {
    const el = pantalla.querySelector('#' + id);
    return el ? el.value : '';
  }

  const SIN_CONEXION = 'No se ha podido conectar. Comprueba la conexión a internet y vuelve a probar.';

  /** Pantalla de entrada. aviso: texto de por qué sale (sesión cerrada…); usuario: el que se deja escrito. */
  function abrirEntrada(aviso, usuario, pedirDireccion) {
    if (pantalla && pantalla.getAttribute('data-tipo') === 'entrada') return;
    const conDireccion = pedirDireccion || !urlServidor();
    crearPantalla(
      '<h1 id="pwaTitulo">Asistencia talleres</h1>' +
      '<p class="ayuda">' + (aviso ? escapar(aviso) : 'Entra con el usuario y la contraseña que te ha dado la administración. ' +
        'La sesión se queda abierta en este móvil hasta que la cierres.') + '</p>' +
      (conDireccion ? campo('pwaUrl', 'Dirección de la aplicación', 'type="url" inputmode="url" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="https://script.google.com/macros/s/…/exec"',
        urlServidor(), 'La de la implementación de Apps Script (acaba en <b>/exec</b>). Solo hace falta una vez.') : '') +
      campo('pwaUsuario', 'Usuario', 'type="text" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" enterkeyhint="next"',
        usuario || usuarioDelEnlace || '') +
      campo('pwaContrasena', 'Contraseña', 'type="password" name="password" autocomplete="current-password" enterkeyhint="go"', '') +
      '<label class="check"><input type="checkbox" id="pwaMostrar"> Mostrar la contraseña</label>' +
      '<div class="botones"><button type="submit" class="boton lleno" id="pwaEntrar">Entrar</button></div>' +
      (conDireccion || urlPublicada() ? '' : '<button type="button" class="boton-texto" id="pwaDireccion">Cambiar la dirección de la aplicación</button>'));
    pantalla.setAttribute('data-tipo', 'entrada');
    pantalla.querySelector('#pwaMostrar').addEventListener('change', function () {
      pantalla.querySelector('#pwaContrasena').type = this.checked ? 'text' : 'password';
    });
    const dir = pantalla.querySelector('#pwaDireccion');
    if (dir) dir.addEventListener('click', function () { cerrarPantalla(); abrirEntrada(aviso, valorDe('pwaUsuario'), true); });
    pantalla.querySelector('form').addEventListener('submit', function (ev) { ev.preventDefault(); entrar(); });
    pantalla.querySelector(conDireccion && !urlServidor() ? '#pwaUrl' : (valorDe('pwaUsuario') ? '#pwaContrasena' : '#pwaUsuario')).focus();
  }

  function escapar(t) {
    return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  function entrar() {
    const boton = pantalla.querySelector('#pwaEntrar');
    if (boton.disabled) return;
    quitarErrores();
    const conDireccion = !!pantalla.querySelector('#pwaUrl');
    const url = conDireccion ? valorDe('pwaUrl').trim() : urlServidor();
    const usuario = valorDe('pwaUsuario').trim().toLowerCase();
    const contrasena = valorDe('pwaContrasena');
    if (conDireccion && !URL_VALIDA.test(url)) return mostrarError('pwaUrl', 'Pega la dirección completa: empieza por https://script.google.com/ y acaba en /exec.');
    if (!usuario) return mostrarError('pwaUsuario', 'Escribe tu usuario.');
    if (!contrasena) return mostrarError('pwaContrasena', 'Escribe tu contraseña.');
    const soltar = ocupar(boton, 'Entrando…');
    enviar(url, 'entrar', [usuario, contrasena, aparato()], '').then(function (r) {
      if (!r.ok) {
        soltar();
        return mostrarError(r.error === NO_RESPONDE && conDireccion ? 'pwaUrl' : 'pwaContrasena', r.error || NO_RESPONDE);
      }
      if (conDireccion && !urlPublicada()) guardar(CLAVE_SERVIDOR, url);
      if (!guardar(CLAVE_SESION, { token: r.data.token, usuario: usuario, nombre: r.data.nombre })) {
        soltar();
        return mostrarError('pwaContrasena', 'Este navegador no deja guardar datos. Sal del modo incógnito o revisa los permisos del sitio.');
      }
      if (r.data.debeCambiar) { abrirCambio(true, contrasena); return; }
      window.location.reload();
    }, function () {
      soltar();
      mostrarError(conDireccion ? 'pwaUrl' : 'pwaContrasena', navigator.onLine === false ? SIN_CONEXION
        : conDireccion ? 'No se ha podido conectar con esa dirección. Comprueba que está bien copiada y que la implementación permite «Cualquier usuario, incluso anónimo».'
          : SIN_CONEXION);
    });
  }

  let alCambiar = null;   // { resolver, rechazar } de cambiarContrasena (desde Gestión › Tu cuenta)

  /**
   * Pantalla de cambio de contraseña. obligatoria: tras una contraseña temporal (sin «Cancelar»; al terminar, recarga).
   * actual: la temporal, si se acaba de escribir al entrar (así no se pide otra vez).
   */
  function abrirCambio(obligatoria, actual) {
    if (pantalla && pantalla.getAttribute('data-tipo') === 'cambio') return;
    const s = leerSesion() || {};
    crearPantalla(
      '<h1 id="pwaTitulo">' + (obligatoria ? 'Pon una contraseña tuya' : 'Cambiar mi contraseña') + '</h1>' +
      '<p class="ayuda">' + (obligatoria ? 'Has entrado con una contraseña temporal. Elige una que recuerdes, de al menos '
        : 'La contraseña nueva tiene que tener al menos ') +
        MIN_CONTRASENA + ' caracteres (vale un número de 4 cifras). Se cerrará la sesión en tus otros aparatos.</p>' +
      '<input type="text" name="username" autocomplete="username" value="' + escapar(s.usuario || '') + '" hidden>' +
      (actual ? '' : campo('pwaActual', obligatoria ? 'Contraseña temporal' : 'Contraseña actual', 'type="password" autocomplete="current-password" enterkeyhint="next"', '')) +
      campo('pwaNueva', 'Contraseña nueva', 'type="password" autocomplete="new-password" enterkeyhint="next"', '') +
      campo('pwaRepetir', 'Repite la contraseña nueva', 'type="password" autocomplete="new-password" enterkeyhint="go"', '') +
      '<label class="check"><input type="checkbox" id="pwaMostrar"> Mostrar las contraseñas</label>' +
      '<div class="botones">' + (obligatoria ? '<button type="button" class="boton" id="pwaSalir">Salir</button>'
        : '<button type="button" class="boton" id="pwaCancelar">Cancelar</button>') +
      '<button type="submit" class="boton lleno" id="pwaGuardar">Guardar</button></div>');
    pantalla.setAttribute('data-tipo', 'cambio');
    pantalla.querySelector('#pwaMostrar').addEventListener('change', function () {
      const tipo = this.checked ? 'text' : 'password';
      pantalla.querySelectorAll('input[type="password"], input[data-contrasena]').forEach(function (i) {
        i.setAttribute('data-contrasena', '1');
        i.type = tipo;
      });
    });
    const salirBoton = pantalla.querySelector('#pwaSalir');
    if (salirBoton) salirBoton.addEventListener('click', salir);
    const cancelar = pantalla.querySelector('#pwaCancelar');
    if (cancelar) cancelar.addEventListener('click', function () {
      cerrarPantalla();
      if (alCambiar) { alCambiar.rechazar(null); alCambiar = null; }
    });
    pantalla.querySelector('form').addEventListener('submit', function (ev) { ev.preventDefault(); guardarCambio(obligatoria, actual); });
    pantalla.querySelector(actual ? '#pwaNueva' : '#pwaActual').focus();
  }

  function guardarCambio(obligatoria, actualDada) {
    const boton = pantalla.querySelector('#pwaGuardar');
    if (boton.disabled) return;
    quitarErrores();
    const actual = actualDada || valorDe('pwaActual');
    const nueva = valorDe('pwaNueva');
    if (!actualDada && !actual) return mostrarError('pwaActual', 'Escribe la contraseña que tienes ahora.');
    if (nueva.length < MIN_CONTRASENA) return mostrarError('pwaNueva', 'Tiene que tener al menos ' + MIN_CONTRASENA + ' caracteres.');
    if (nueva === actual) return mostrarError('pwaNueva', 'Tiene que ser distinta de la que tienes.');
    if (valorDe('pwaRepetir') !== nueva) return mostrarError('pwaRepetir', 'No coincide con la contraseña nueva.');
    const soltar = ocupar(boton, 'Guardando…');
    accionSesion('cambiarContrasena', [actual, nueva]).then(function (d) {
      if (obligatoria) { window.location.reload(); return; }
      cerrarPantalla();
      if (alCambiar) { alCambiar.resolver(d); alCambiar = null; }
    }, function (e) {
      soltar();
      if (e.codigo === CODIGO_SESION) { guardar(CLAVE_SESION, null); abrirEntrada(e.message); return; }
      mostrarError(!actualDada && /actual/.test(e.message) ? 'pwaActual' : 'pwaNueva', e.message);
    });
  }

  /** Desde Gestión › Tu cuenta: abre la pantalla de cambio. Se resuelve al guardar y se rechaza (con null) al cancelar. */
  function cambiarContrasena() {
    return new Promise(function (resolver, rechazar) {
      alCambiar = { resolver: resolver, rechazar: rechazar };
      abrirCambio(false, '');
    });
  }

  /**
   * Botón atrás con la pantalla de cambiar la contraseña abierta desde Tu cuenta: la cierra como «Cancelar».
   * Devuelve si la ha cerrado (la de entrada y la de cambio obligatorio no se cierran).
   */
  function cerrarCambio() {
    const cancelar = pantalla && pantalla.querySelector('#pwaCancelar');
    if (!cancelar) return false;
    cancelar.click();
    return true;
  }

  /** Quién tiene la sesión en este aparato: { usuario, nombre }. */
  function cuenta() {
    const s = leerSesion();
    return s ? { usuario: s.usuario, nombre: s.nombre } : null;
  }

  window.PWA = {
    llamar: llamar,
    historia: historia,
    salir: salir,
    verComo: verComo,
    cambiarContrasena: cambiarContrasena,
    cerrarCambio: cerrarCambio,
    cuenta: cuenta,
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
