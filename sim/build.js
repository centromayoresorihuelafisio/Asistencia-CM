// Monta sim/index.html con el código real del proyecto y la simulación de Apps Script.
// Uso (desde la raíz del repositorio): node sim/build.js
// Servir: python -m http.server 8931 --bind 127.0.0.1 --directory sim
// Abrir: http://127.0.0.1:8931/index.html  (parámetros: ?e=normal|monitora|vacio, ?delay=1500, ?offline=1, ?error=*|api_x)
// En la consola: SIM.offline = true, SIM.error = 'api_guardarSesion', SIM.llamadas
const fs = require('fs'), p = require('path');
const S = __dirname, R = p.join(S, '..');
let idx = fs.readFileSync(p.join(R, 'Index.html'), 'utf8');
const gs = ['Config', 'Repo', 'Auth', 'Servicio', 'Api', 'Admin', 'Informes', 'Importar', 'Setup', 'Main']
  .map(n => '<script>\n' + fs.readFileSync(p.join(R, n + '.gs'), 'utf8') + '\n</script>').join('\n');
idx = idx.replace("<?!= include('Estilos'); ?>", '<meta name="viewport" content="width=device-width, initial-scale=1">' + fs.readFileSync(p.join(R, 'Estilos.html'), 'utf8'));
idx = idx.replace("<?!= include('Cliente'); ?>", '<script src="mock.js"></script>\n' + gs + '\n<script src="datos.js"></script>\n' + fs.readFileSync(p.join(R, 'Cliente.html'), 'utf8'));
fs.writeFileSync(p.join(S, 'index.html'), idx);
console.log('sim/index.html listo,', idx.length, 'caracteres');
