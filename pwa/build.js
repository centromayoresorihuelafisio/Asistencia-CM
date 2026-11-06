// pwa/build.js — Monta la app instalable (PWA, 6-nov-2026) con el mismo código que la web app de Apps Script:
// Index.html, Estilos.html y Cliente.html tal cual, más pwa/api.js (fetch en vez de google.script.run),
// pwa/pwa.css, el manifiesto, el service worker y los iconos. No hay una segunda copia del cliente.
//
// Uso (desde la raíz del repositorio):
//   node pwa/build.js         → pwa/dist/  (lo que se publica; lo hace solo .github/workflows/pwa.yml)
//   node pwa/build.js --sim   → sim/pwa/   (para probar en el ordenador con la simulación de hojas, sin Google)
// Servir la prueba: python -m http.server 8932 --bind 127.0.0.1 --directory sim/pwa
// Abrir: http://127.0.0.1:8932/index.html (parámetros de sim/build.js y ?clave=… para la clave del «servidor»;
// la clave de prueba es «prueba»).
'use strict';
const fs = require('fs'), p = require('path'), crypto = require('crypto');
const iconos = require('./iconos');

const PWA = __dirname, RAIZ = p.join(PWA, '..'), SIM = p.join(RAIZ, 'sim');
const conSim = process.argv.indexOf('--sim') >= 0;
const SALIDA = conSim ? p.join(SIM, 'pwa') : p.join(PWA, 'dist');

const leer = function (ruta) { return fs.readFileSync(ruta, 'utf8'); };
const script = function (codigo) { return '<script>\n' + codigo + '\n</script>'; };

function reemplazarUnaVez(texto, buscado, nuevo) {
  const partes = texto.split(buscado);
  if (partes.length !== 2) throw new Error('En Index.html tiene que haber exactamente un «' + buscado + '».');
  return partes[0] + nuevo + partes[1];
}

// ---------- Página ----------

const cabeza = [
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<meta name="theme-color" content="#ffffff">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<link rel="manifest" href="manifest.json">',
  '<link rel="icon" href="iconos/icono.svg" type="image/svg+xml">',
  '<link rel="icon" href="iconos/icono-192.png" sizes="192x192" type="image/png">',
  '<link rel="apple-touch-icon" href="iconos/icono-192.png">'
].join('\n    ');

let codigoAntes = '';
if (conSim) {
  // La simulación de hojas y del servidor: el código real de los .gs, en el navegador
  const gs = ['Config', 'Repo', 'Auth', 'Servicio', 'Api', 'Admin', 'Informes', 'Importar', 'Setup', 'Main']
    .map(function (n) { return script(leer(p.join(RAIZ, n + '.gs'))); }).join('\n');
  codigoAntes = '<script src="../mock.js"></script>\n' + gs + '\n<script src="../datos.js"></script>\n' +
    '<script src="../pwa-mock.js"></script>\n';
}

let pagina = leer(p.join(RAIZ, 'Index.html'));
pagina = reemplazarUnaVez(pagina, "<?!= include('Estilos'); ?>",
  cabeza + '\n' + leer(p.join(RAIZ, 'Estilos.html')) + '\n<style>\n' + leer(p.join(PWA, 'pwa.css')) + '</style>');
pagina = reemplazarUnaVez(pagina, "<?!= include('Cliente'); ?>",
  codigoAntes + script(leer(p.join(PWA, 'api.js'))) + '\n' + leer(p.join(RAIZ, 'Cliente.html')));
if (pagina.indexOf('<?') >= 0) throw new Error('Queda alguna etiqueta de plantilla de Apps Script (<? … ?>) en la página.');

// ---------- Iconos ----------

// El SVG es el mismo de Main.gs (ICONO_APP_SVG), que se lee de allí para no copiarlo.
const mainGs = leer(p.join(RAIZ, 'Main.gs'));
const svg = (mainGs.match(/const ICONO_APP_SVG = ([\s\S]*?);\n/) || [])[1];
if (!svg) throw new Error('No se encuentra ICONO_APP_SVG en Main.gs.');
const iconoSvg = new Function('return ' + svg)();
const pngs = iconos();

// ---------- Escribir ----------

const manifiesto = leer(p.join(PWA, 'manifest.json'));
const version = crypto.createHash('sha1').update(pagina + manifiesto + iconoSvg).digest('hex').slice(0, 10);
const sw = leer(p.join(PWA, 'sw.js')).split('__VERSION__').join(version);
if (sw.indexOf(version) < 0) throw new Error('Falta __VERSION__ en pwa/sw.js.');

fs.rmSync(SALIDA, { recursive: true, force: true });
fs.mkdirSync(p.join(SALIDA, 'iconos'), { recursive: true });
fs.writeFileSync(p.join(SALIDA, 'index.html'), pagina);
fs.writeFileSync(p.join(SALIDA, 'manifest.json'), manifiesto);
fs.writeFileSync(p.join(SALIDA, 'sw.js'), sw);
fs.writeFileSync(p.join(SALIDA, 'iconos', 'icono.svg'), iconoSvg);
Object.keys(pngs).forEach(function (n) { fs.writeFileSync(p.join(SALIDA, 'iconos', n), pngs[n]); });
fs.writeFileSync(p.join(SALIDA, '.nojekyll'), '');   // GitHub Pages: servir tal cual

console.log(p.relative(RAIZ, SALIDA) + '/ listo · versión ' + version + ' · ' + pagina.length + ' caracteres');
