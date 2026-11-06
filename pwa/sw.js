// pwa/sw.js — Service worker de la app instalable (PWA, 6-nov-2026).
// Solo guarda los archivos de la propia app (página, manifiesto, iconos) para que arranque rápido.
// No guarda datos: las llamadas al servidor (POST a script.google.com) no pasan por aquí.
// La página se pide primero a la red, así una versión nueva llega en cuanto hay conexión; sin red, la guardada.
// pwa/build.js pone en CACHE una huella de los archivos: al publicar otra versión se tiran los de antes.
'use strict';

const CACHE = 'asistencia-__VERSION__';
const ARCHIVOS = ['./', 'index.html', 'manifest.json', 'iconos/icono-192.png', 'iconos/icono-512.png',
  'iconos/icono-maskable-512.png', 'iconos/icono.svg'];

self.addEventListener('install', function (ev) {
  ev.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ARCHIVOS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(caches.keys().then(function (claves) {
    return Promise.all(claves.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (ev) {
  const pet = ev.request;
  if (pet.method !== 'GET' || new URL(pet.url).origin !== self.location.origin) return;
  if (pet.mode === 'navigate') {
    // Primero la red; sin red, la página guardada
    ev.respondWith(fetch(pet).then(function (r) {
      if (r.ok) {
        const copia = r.clone();
        caches.open(CACHE).then(function (c) { c.put('index.html', copia); });
      }
      return r;
    }).catch(function () {
      return caches.match('index.html');
    }));
    return;
  }
  ev.respondWith(caches.match(pet).then(function (r) { return r || fetch(pet); }));
});
