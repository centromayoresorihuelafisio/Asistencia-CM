// Datos de prueba. Escenarios: normal (admin), monitora (sin admin), vacio (primer uso).
(function () {
  const L = window.SIM.libro;
  const esc = window.SIM.escenario;
  function hoja(nombre, objetos) {
    const cols = ESQUEMA[nombre].columnas;
    const fechas = ESQUEMA[nombre].fecha || [];
    const filas = [cols.slice()].concat((objetos || []).map(function (o) {
      return cols.map(function (c) { const v = o[c]; if (v === undefined || v === null) return ''; return fechas.indexOf(c) >= 0 && v ? textoAFecha_(v) : v; });
    }));
    const h = L.insertSheet(nombre); h.datos = filas;
  }
  const yo = 'admin@ejemplo.test';
  const estados = DATOS_INICIALES.estados;
  const listas = DATOS_INICIALES.listas;
  const config = [
    { clave: 'curso_activo', valor: '2026-2027' }, { clave: 'inicio_curso', valor: '2026-09-01' }, { clave: 'fin_curso', valor: '2027-06-30' },
    { clave: 'dias_pendientes', valor: '14' }, { clave: 'faltas_seguidas', valor: '3' }];

  if (esc === 'vacio') {
    ['Monitoras', 'Talleres', 'Grupos', 'Usuarios', 'Inscripciones', 'Sesiones', 'Asistencia', 'Dias especiales'].forEach(function (n) { hoja(n, []); });
    hoja('Estados', estados); hoja('Listas', listas); hoja('Config', config);
    return;
  }

  const monitoras = [{ email: yo, nombre: 'Carmen', rol: esc === 'monitora' ? 'monitora' : 'admin', activa: 'SI' }];
  const talleres = [{ taller_id: 'YOGA', nombre: 'Yoga', activo: 'SI' }, { taller_id: 'PILATES', nombre: 'Pilates', activo: 'SI' },
    { taller_id: 'MEMORIA', nombre: 'Memoria', activo: 'SI' }, { taller_id: 'COSTURA', nombre: 'Costura', activo: 'SI' }];
  const grupos = [
    { grupo_id: 'YOGA-SUELO', taller_id: 'YOGA', nombre: 'Yoga suelo', monitoras: yo, dias: 'L,X', hora: '10:00', curso: '2026-2027', activo: 'SI' },
    { grupo_id: 'YOGA-SILLA', taller_id: 'YOGA', nombre: 'Yoga silla', monitoras: yo, dias: 'M,J', hora: '11:00', curso: '2026-2027', activo: 'SI' },
    { grupo_id: 'PILATES-MANANA', taller_id: 'PILATES', nombre: 'Pilates mañana lunes y miércoles esterilla', monitoras: yo, dias: 'L,X', hora: '12:00', curso: '2026-2027', activo: 'SI' },
    { grupo_id: 'MEMORIA-TARDE', taller_id: 'MEMORIA', nombre: 'Memoria tarde', monitoras: yo, dias: 'X', hora: '17:00', curso: '2026-2027', activo: 'SI' },
    { grupo_id: 'COSTURA', taller_id: 'COSTURA', nombre: 'Costura', monitoras: yo, dias: 'X,V', hora: '18:30', curso: '2026-2027', activo: 'SI' }
  ];
  const ape = ['GARCIA', 'MARTINEZ', 'LOPEZ', 'SANCHEZ', 'PEREZ', 'GOMEZ', 'MARTIN', 'JIMENEZ', 'RUIZ', 'HERNANDEZ', 'DIAZ', 'MORENO', 'MUÑOZ', 'ALVAREZ', 'ROMERO', 'ALONSO', 'GUTIERREZ', 'NAVARRO', 'TORRES', 'DOMINGUEZ'];
  const nom = ['MARIA', 'CARMEN', 'JOSEFA', 'ISABEL', 'ANA', 'DOLORES', 'PILAR', 'TERESA', 'ROSA', 'FRANCISCA', 'ANTONIA', 'MERCEDES', 'JOSE', 'ANTONIO', 'MANUEL', 'FRANCISCO', 'ENCARNACION', 'CONCEPCION'];
  const usuarios = [];
  let n = 1400;
  function nuevo(nombre, tel) { const u = { usuario_id: String(n++), nombre: nombre, telefono: tel || '', activo: 'SI' }; usuarios.push(u); return u; }
  for (let i = 0; i < 70; i++) nuevo(ape[i % 20] + ' ' + ape[(i * 7 + 3) % 20] + ' ' + nom[(i * 5) % 18], i % 3 ? '6' + String(10000000 + i * 1234567).slice(0, 8) : '');
  const largos = [nuevo('FERNANDEZ DE LA TORRE Y MONTALBAN MARIA DE LOS ANGELES', '600111222'), nuevo('RODRIGUEZ-ALCANTARA GONZALEZ MARIA DEL CARMEN ENCARNACION', '600333444'),
    nuevo('PEREZ PEREZ ANA', ''), nuevo('VILLANUEVA DE CASTELLANOS MARIA INMACULADA CONCEPCION', '966777888')];
  const insc = [];
  function inscribir(u, g, alta, baja, motivo) { insc.push({ inscripcion_id: 'i' + insc.length, usuario_id: u.usuario_id, grupo_id: g, fecha_alta: alta || '2026-09-01', fecha_baja: baja || '', motivo_baja: motivo || '' }); }
  usuarios.slice(0, 14).forEach(function (u) { inscribir(u, 'YOGA-SUELO'); });
  usuarios.slice(14, 24).forEach(function (u) { inscribir(u, 'YOGA-SILLA'); });
  usuarios.slice(24, 54).forEach(function (u) { inscribir(u, 'PILATES-MANANA'); });
  usuarios.slice(54, 60).concat(largos).forEach(function (u) { inscribir(u, 'MEMORIA-TARDE'); });
  inscribir(usuarios[60], 'YOGA-SUELO', '2026-09-01', '2026-10-20', 'Motivos de salud');
  // Costura: sin inscritos.

  // Sesiones y asistencia de septiembre-octubre (no las de los últimos días: salen como pendientes)
  const sesiones = []; const asis = [];
  const corte = { 'YOGA-SUELO': '2026-11-02', 'YOGA-SILLA': '2026-11-03', 'PILATES-MANANA': '2026-10-28', 'MEMORIA-TARDE': '2026-11-01', 'COSTURA': '2026-09-01' };
  const nombres = { 'YOGA-SUELO': ['Yoga', 'Yoga suelo'], 'YOGA-SILLA': ['Yoga', 'Yoga silla'], 'PILATES-MANANA': ['Pilates', 'Pilates mañana lunes y miércoles esterilla'], 'MEMORIA-TARDE': ['Memoria', 'Memoria tarde'] };
  const especiales = [{ fecha: '2026-10-12', tipo: 'Festivo', descripcion: 'Fiesta Nacional', grupo_id: '' }, { fecha: '2026-12-08', tipo: 'Festivo', descripcion: 'Inmaculada', grupo_id: '' },
    { fecha: '2026-11-04', tipo: 'Asunto propio', descripcion: '', grupo_id: 'MEMORIA-TARDE' }];
  let semilla = 7;
  function azar() { semilla = (semilla * 9301 + 49297) % 233280; return semilla / 233280; }
  grupos.forEach(function (g) {
    for (let f = '2026-09-01'; f < corte[g.grupo_id]; f = sumarDias_(f, 1)) {
      if (g.dias.split(',').indexOf(letraDia_(f)) < 0) continue;
      if (especiales.some(function (e) { return e.fecha === f; })) continue;
      if (f === '2026-10-07' && g.grupo_id === 'YOGA-SUELO') { sesiones.push({ fecha: f, grupo_id: g.grupo_id, estado: 'cancelada', nota: 'Monitora enferma', registrada_por: yo, timestamp: f + ' 10:05:00' }); continue; }
      sesiones.push({ fecha: f, grupo_id: g.grupo_id, estado: 'realizada', nota: '', registrada_por: yo, timestamp: f + ' 11:02:00' });
      insc.filter(function (i) { return i.grupo_id === g.grupo_id && i.fecha_alta <= f && (!i.fecha_baja || f <= i.fecha_baja); }).forEach(function (i, k) {
        const r = azar(); let e = r < .78 ? 'ASI' : r < .9 ? 'NOJ' : r < .96 ? 'JUS' : 'EVE';
        if (k === 2 && f > '2026-10-10') e = 'NOJ';   // una persona con faltas seguidas
        asis.push({ clave: f + '|' + g.grupo_id + '|' + i.usuario_id, fecha: f, grupo_id: g.grupo_id, usuario_id: i.usuario_id, estado: e, taller: nombres[g.grupo_id][0], grupo: nombres[g.grupo_id][1], mes: f.substring(0, 7), observaciones: '', registrada_por: yo, timestamp: f + ' 11:02:00' });
      });
    }
  });
  hoja('Monitoras', monitoras); hoja('Talleres', talleres); hoja('Grupos', grupos); hoja('Usuarios', usuarios); hoja('Inscripciones', insc);
  hoja('Sesiones', sesiones); hoja('Asistencia', asis); hoja('Estados', estados); hoja('Listas', listas); hoja('Config', config); hoja('Dias especiales', especiales);
})();
