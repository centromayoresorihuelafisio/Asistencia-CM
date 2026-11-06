/**
 * Informes.gs — Historial de asistencia por grupo y mes, informe para la memoria y exportación a una hoja nueva.
 * % de asistencia = presentes ÷ (presentes + ausentes). Los estados «neutro» (eventos…) no cuentan (sección 14).
 * Este archivo solo define funciones (nada a nivel superior que dependa de otros archivos).
 */

/** Todos los estados, también los desactivados, para interpretar el histórico. */
function tiposEstado_() {
  const mapa = {};
  leerTabla_(HOJAS.ESTADOS).forEach(function (e) {
    if (e.codigo) mapa[e.codigo] = estadoParaCliente_(e);
  });
  return mapa;
}

/** Suma un registro en presentes / ausentes / neutros según el tipo de su estado. */
function sumarTipo_(acumulado, tipos, codigo) {
  const t = tipos[codigo] ? tipos[codigo].tipo : '';
  if (t === TIPO_ESTADO.PRESENTE) acumulado.presentes++;
  else if (t === TIPO_ESTADO.AUSENTE) acumulado.ausentes++;
  else acumulado.neutros++;
}

function porcentaje_(presentes, ausentes) {
  const total = presentes + ausentes;
  return total ? Math.round(presentes * 1000 / total) / 10 : null;
}

function finDeMes_(mes) {
  const p = mes.split('-').map(Number);
  return fechaATexto_(new Date(p[0], p[1], 0));
}

/** Grupos que la monitora puede ver, también los desactivados (para el histórico). */
function gruposVisibles_(monitora) {
  return leerTabla_(HOJAS.GRUPOS).filter(function (g) { return g.grupo_id && puedeGrupo_(monitora, g); });
}

// ---------- Historial de un grupo en un mes ----------

function historialGrupo_(monitora, grupoId, mes) {
  if (!/^\d{4}-\d{2}$/.test(String(mes || ''))) throw errorApp_('El mes no es válido.');
  const grupo = grupoPorId_(grupoId);
  comprobarAccesoGrupo_(monitora, grupo);
  const inicioMes = mes + '-01';
  const finMes = finDeMes_(mes);
  const hoy = hoy_();
  const cfg = config_();
  const tipos = tiposEstado_();

  const sesiones = {};
  leerTabla_(HOJAS.SESIONES).forEach(function (s) {
    if (s.grupo_id === grupoId && s.fecha >= inicioMes && s.fecha <= finMes) sesiones[s.fecha] = s;
  });

  // Columnas: días con clase (o con sesión guardada) hasta hoy.
  const columnas = [];
  for (let f = inicioMes; f <= finMes && f <= hoy; f = sumarDias_(f, 1)) {
    const s = sesiones[f];
    const dentroCurso = (!cfg.inicio || f >= cfg.inicio) && (!cfg.fin || f <= cfg.fin);
    if (!s && !(tocaClase_(grupo, f) && dentroCurso)) continue;
    const especial = diaEspecial_(grupoId, f);
    columnas.push({
      fecha: f,
      estado: s ? s.estado : (especial ? 'especial' : 'pendiente'),
      nota: s ? s.nota : '',
      especial: especial,
      presentes: 0,
      ausentes: 0
    });
  }
  const indice = {};
  columnas.forEach(function (c, i) { indice[c.fecha] = i; });

  // Filas: usuarios inscritos algún día del mes.
  const periodos = {};
  leerTabla_(HOJAS.INSCRIPCIONES).forEach(function (i) {
    if (i.grupo_id !== grupoId || !i.fecha_alta || i.fecha_alta > finMes) return;
    if (i.fecha_baja && i.fecha_baja < inicioMes) return;
    const id = normalizarId_(i.usuario_id);
    (periodos[id] = periodos[id] || []).push(i);
  });
  const marcas = {};
  asistenciaQueCuenta_().forEach(function (a) {   // sin las de sesiones canceladas (regla 5)
    if (a.grupo_id !== grupoId || indice[a.fecha] === undefined) return;
    const id = normalizarId_(a.usuario_id);
    (marcas[id] = marcas[id] || {})[a.fecha] = a.estado;
    if (!periodos[id]) periodos[id] = [];
  });

  const usuarios = usuariosPorId_();
  const filas = Object.keys(periodos).map(function (id) {
    const fila = { usuario_id: id, nombre: (usuarios[id] || {}).nombre || ('(ID ' + id + ')'), celdas: [], presentes: 0, ausentes: 0, neutros: 0 };
    columnas.forEach(function (c) {
      const codigo = (marcas[id] || {})[c.fecha];
      const inscrito = periodos[id].some(function (i) {
        return i.fecha_alta <= c.fecha && (!i.fecha_baja || c.fecha <= i.fecha_baja);
      });
      if (codigo) {
        fila.celdas.push(codigo);
        sumarTipo_(fila, tipos, codigo);
        const t = tipos[codigo] ? tipos[codigo].tipo : '';
        if (t === TIPO_ESTADO.PRESENTE) c.presentes++;
        if (t === TIPO_ESTADO.AUSENTE) c.ausentes++;
      } else {
        fila.celdas.push(inscrito ? '' : '-');
      }
    });
    fila.porcentaje = porcentaje_(fila.presentes, fila.ausentes);
    return fila;
  }).sort(compararNombres_);

  const resumen = { realizadas: 0, canceladas: 0, pendientes: 0, especiales: 0, presentes: 0, ausentes: 0 };
  columnas.forEach(function (c) {
    if (c.estado === ESTADO_SESION.REALIZADA) resumen.realizadas++;
    else if (c.estado === ESTADO_SESION.CANCELADA) resumen.canceladas++;
    else if (c.estado === 'especial') resumen.especiales++;
    else resumen.pendientes++;
    resumen.presentes += c.presentes;
    resumen.ausentes += c.ausentes;
  });
  resumen.porcentaje = porcentaje_(resumen.presentes, resumen.ausentes);

  return {
    grupo: grupoParaCliente_(grupo, talleresPorId_()),
    mes: mes,
    columnas: columnas,
    filas: filas,
    resumen: resumen,
    estados: Object.keys(tipos).map(function (k) { return tipos[k]; })
  };
}

// ---------- Informe para la memoria ----------

function nuevoAcumulado_(extra) {
  return Object.assign({ realizadas: 0, canceladas: 0, presentes: 0, ausentes: 0, neutros: 0, usuarios: {} }, extra || {});
}

function cerrarAcumulado_(a) {
  const usuarios = Object.keys(a.usuarios).length;
  const r = Object.assign({}, a, { usuarios: usuarios, porcentaje: porcentaje_(a.presentes, a.ausentes) });
  return r;
}

/**
 * Informe de un periodo. tallerId vacío = todos los talleres.
 * Devuelve totales y tablas por taller, por grupo, por mes, por estado, altas y bajas por mes y motivos de baja.
 */
function informe_(monitora, desde, hasta, tallerId) {
  comprobarFecha_(desde, 'de inicio');
  comprobarFecha_(hasta, 'de fin');
  if (hasta < desde) throw errorApp_('La fecha final no puede ser anterior a la inicial.');
  const talleres = talleresPorId_();
  const tipos = tiposEstado_();
  const grupos = {};
  gruposVisibles_(monitora).forEach(function (g) {
    if (!tallerId || g.taller_id === tallerId) grupos[g.grupo_id] = g;
  });

  const total = nuevoAcumulado_();
  const porTaller = {};
  const porGrupo = {};
  const porMes = {};
  const porEstado = {};

  const acumular = function (destinos, campo, valor) {
    destinos.forEach(function (d) { d[campo] += valor; });
  };
  const destinosDe = function (grupoId, mes) {
    const g = grupos[grupoId];
    const nombreT = nombreTaller_(g, talleres);
    porTaller[nombreT] = porTaller[nombreT] || nuevoAcumulado_({ taller: nombreT });
    porGrupo[grupoId] = porGrupo[grupoId] || nuevoAcumulado_({ taller: nombreT, grupo: g.nombre || grupoId, grupo_id: grupoId });
    porMes[mes] = porMes[mes] || nuevoAcumulado_({ mes: mes });
    return [total, porTaller[nombreT], porGrupo[grupoId], porMes[mes]];
  };

  leerTabla_(HOJAS.SESIONES).forEach(function (s) {
    if (!grupos[s.grupo_id] || s.fecha < desde || s.fecha > hasta) return;
    acumular(destinosDe(s.grupo_id, s.fecha.substring(0, 7)),
      s.estado === ESTADO_SESION.CANCELADA ? 'canceladas' : 'realizadas', 1);
  });

  const detalle = [];
  asistenciaQueCuenta_().forEach(function (a) {   // sin las de sesiones canceladas (regla 5)
    if (!grupos[a.grupo_id] || a.fecha < desde || a.fecha > hasta) return;
    const destinos = destinosDe(a.grupo_id, a.fecha.substring(0, 7));
    const id = normalizarId_(a.usuario_id);
    const t = tipos[a.estado] ? tipos[a.estado].tipo : '';
    destinos.forEach(function (d) {
      sumarTipo_(d, tipos, a.estado);
      if (t === TIPO_ESTADO.PRESENTE) d.usuarios[id] = true;
    });
    porEstado[a.estado] = (porEstado[a.estado] || 0) + 1;
    detalle.push(a);
  });

  // Altas y bajas del periodo.
  const movimientos = {};
  const motivos = {};
  leerTabla_(HOJAS.INSCRIPCIONES).forEach(function (i) {
    if (!grupos[i.grupo_id]) return;
    if (i.fecha_alta >= desde && i.fecha_alta <= hasta) {
      const m = i.fecha_alta.substring(0, 7);
      (movimientos[m] = movimientos[m] || { mes: m, altas: 0, bajas: 0 }).altas++;
    }
    if (i.fecha_baja && i.fecha_baja >= desde && i.fecha_baja <= hasta) {
      const m = i.fecha_baja.substring(0, 7);
      (movimientos[m] = movimientos[m] || { mes: m, altas: 0, bajas: 0 }).bajas++;
      const motivo = i.motivo_baja || '(sin motivo)';
      motivos[motivo] = (motivos[motivo] || 0) + 1;
    }
  });

  const ordenarPor = function (campos) {
    return function (a, b) {
      for (let k = 0; k < campos.length; k++) {
        const c = String(a[campos[k]]).localeCompare(String(b[campos[k]]), 'es');
        if (c) return c;
      }
      return 0;
    };
  };
  const valores = function (o) { return Object.keys(o).map(function (k) { return o[k]; }); };

  return {
    desde: desde,
    hasta: hasta,
    taller: tallerId ? nombreTaller_({ taller_id: tallerId }, talleres) : '',
    total: cerrarAcumulado_(total),
    porTaller: valores(porTaller).map(cerrarAcumulado_).sort(ordenarPor(['taller'])),
    porGrupo: valores(porGrupo).map(cerrarAcumulado_).sort(ordenarPor(['taller', 'grupo'])),
    porMes: valores(porMes).map(cerrarAcumulado_).sort(ordenarPor(['mes'])),
    porEstado: Object.keys(porEstado).map(function (c) {
      const e = tipos[c] || { etiqueta: c, tipo: '', color: '#9e9e9e' };
      return { codigo: c, etiqueta: e.etiqueta, tipo: e.tipo, color: e.color, registros: porEstado[c] };
    }).sort(function (a, b) { return b.registros - a.registros; }),
    altasBajas: valores(movimientos).sort(ordenarPor(['mes'])),
    motivosBaja: Object.keys(motivos).map(function (m) { return { motivo: m, bajas: motivos[m] }; })
      .sort(function (a, b) { return b.bajas - a.bajas; }),
    _detalle: detalle
  };
}

/** Versión para la pantalla: sin el detalle registro a registro. */
function informeParaCliente_(monitora, desde, hasta, tallerId) {
  const r = informe_(monitora, desde, hasta, tallerId);
  delete r._detalle;
  return r;
}

// ---------- Exportar: descargar o enviar por correo (5-nov-2026) ----------
// El archivo se crea, se manda al móvil (o por correo) y no se queda en el Drive de quien despliega:
// el PDF se hace desde HTML, sin Drive; la hoja de cálculo necesita una hoja de paso, que se borra al terminar.

const FORMATOS_EXPORTAR_ = {
  pdf: { extension: 'pdf', tipo: 'application/pdf' },
  xlsx: { extension: 'xlsx', tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
};

const COLUMNAS_ACUMULADO_ = [
  ['Sesiones realizadas', 'realizadas'], ['Sesiones canceladas', 'canceladas'], ['Asistencias', 'presentes'],
  ['Ausencias', 'ausentes'], ['Otros (eventos…)', 'neutros'], ['% asistencia', 'porcentaje'], ['Usuarios distintos', 'usuarios']
];

function escribirTabla_(hoja, cabecera, filas, formatos) {
  hoja.clear();
  hoja.getRange(1, 1, 1, cabecera.length).setValues([cabecera]).setFontWeight('bold').setBackground('#e8eaf6');
  hoja.setFrozenRows(1);
  if (filas.length) {
    Object.keys(formatos || {}).forEach(function (col) {
      hoja.getRange(2, Number(col) + 1, filas.length, 1).setNumberFormat(formatos[col]);
    });
    hoja.getRange(2, 1, filas.length, cabecera.length).setValues(filas);
  }
  hoja.autoResizeColumns(1, cabecera.length);
}

function filasAcumulado_(lista, primeras) {
  return lista.map(function (r) {
    return primeras.map(function (c) { return r[c]; }).concat(COLUMNAS_ACUMULADO_.map(function (c) {
      return r[c[1]] === null || r[c[1]] === undefined ? '' : r[c[1]];
    }));
  });
}

/** Todas las tablas del informe: [{ nombre, cabecera, filas, formatos, enPdf }]. El detalle solo va en la hoja de cálculo. */
function tablasInforme_(r, desde, hasta) {
  const cabAcum = COLUMNAS_ACUMULADO_.map(function (c) { return c[0]; });
  const t = r.total;
  const usuarios = usuariosPorId_();
  const tipos = tiposEstado_();
  const detalle = r._detalle
    .sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; })
    .map(function (a) {
      const id = normalizarId_(a.usuario_id);
      const e = tipos[a.estado] || { etiqueta: a.estado, tipo: '' };
      return [textoAFecha_(a.fecha), a.mes, a.taller, a.grupo, id, (usuarios[id] || {}).nombre || '', e.etiqueta, e.tipo, a.observaciones];
    });
  return [
    { nombre: 'Resumen', enPdf: true, cabecera: ['Dato', 'Valor'], filas: [
      ['Periodo', fechaNumerica_(desde) + ' a ' + fechaNumerica_(hasta)],
      ['Taller', r.taller || 'Todos'],
      ['Sesiones realizadas', t.realizadas],
      ['Sesiones canceladas', t.canceladas],
      ['Usuarios distintos atendidos', t.usuarios],
      ['Asistencias', t.presentes],
      ['Ausencias', t.ausentes],
      ['Otros registros (eventos…)', t.neutros],
      ['% asistencia', t.porcentaje === null ? '' : t.porcentaje],
      ['Altas', r.altasBajas.reduce(function (s, m) { return s + m.altas; }, 0)],
      ['Bajas', r.altasBajas.reduce(function (s, m) { return s + m.bajas; }, 0)],
      ['% asistencia = asistencias ÷ (asistencias + ausencias). Los eventos no cuentan.', '']
    ] },
    { nombre: 'Asistencia por grupo', enPdf: false, escribir: hojaAsistenciaPorGrupo_(r, desde, hasta, usuarios, tipos) },
    { nombre: 'Historial', enPdf: false, escribir: hojaHistorial_(r, desde, hasta, usuarios, tipos) },
    { nombre: 'Por taller', enPdf: true, cabecera: ['Taller'].concat(cabAcum), filas: filasAcumulado_(r.porTaller, ['taller']) },
    { nombre: 'Por grupo', enPdf: true, cabecera: ['Taller', 'Grupo'].concat(cabAcum), filas: filasAcumulado_(r.porGrupo, ['taller', 'grupo']) },
    { nombre: 'Por mes', enPdf: true, cabecera: ['Mes'].concat(cabAcum), filas: filasAcumulado_(r.porMes, ['mes']), formatos: { 0: '@' } },
    { nombre: 'Por estado', enPdf: true, cabecera: ['Estado', 'Cuenta como', 'Registros'],
      filas: r.porEstado.map(function (e) { return [e.etiqueta, e.tipo, e.registros]; }) },
    { nombre: 'Altas y bajas', enPdf: true, cabecera: ['Mes', 'Altas', 'Bajas'],
      filas: r.altasBajas.map(function (m) { return [m.mes, m.altas, m.bajas]; }), formatos: { 0: '@' } },
    { nombre: 'Motivos de baja', enPdf: true, cabecera: ['Motivo', 'Bajas'],
      filas: r.motivosBaja.map(function (m) { return [m.motivo, m.bajas]; }) },
    { nombre: 'Detalle', enPdf: false,
      cabecera: ['Fecha', 'Mes', 'Taller', 'Grupo', 'ID usuario', 'Usuario', 'Estado', 'Cuenta como', 'Observaciones'],
      filas: detalle, formatos: { 0: 'dd/mm/yyyy', 1: '@', 4: '@' } }
  ];
}

// ---------- Hoja «Asistencia por grupo» (solo en la hoja de cálculo; 5-nov-2026) ----------
// Para leerla tal cual: un bloque por grupo con su horario y resumen, una fila por usuario con cuántas veces
// tuvo cada estado, su % de asistencia y si sigue en el grupo, y una fila de total.

const DIAS_LEGIBLES_ = [['L', 'Lun'], ['M', 'Mar'], ['X', 'Mié'], ['J', 'Jue'], ['V', 'Vie'], ['S', 'Sáb'], ['D', 'Dom']];
const PARTICULAS_NOMBRE_ = { DE: 1, DEL: 1, LA: 1, LAS: 1, LOS: 1, Y: 1, I: 1, E: 1 };

/** «GARCIA DE LA FUENTE MARIA» → «Garcia de la Fuente Maria» (como nombreVisible del cliente). */
function nombreLegible_(texto) {
  return String(texto || '').split(' ').map(function (palabra, i) {
    if (i > 0 && PARTICULAS_NOMBRE_[palabra.toUpperCase()]) return palabra.toLowerCase();
    return palabra.toLowerCase().replace(/(^|[-'])(\S)/g, function (m, antes, letra) { return antes + letra.toUpperCase(); });
  }).join(' ');
}

/** «Mié y vie · 18:30». */
function horarioLegible_(g) {
  const letras = diasDeGrupo_(g);
  const nombres = DIAS_LEGIBLES_.filter(function (d) { return letras.indexOf(d[0]) >= 0; })
    .map(function (d, i) { return i ? d[1].toLowerCase() : d[1]; });
  const dias = nombres.length < 2 ? nombres.join('') : nombres.slice(0, -1).join(', ') + ' y ' + nombres[nombres.length - 1];
  return [dias, g.hora || ''].filter(Boolean).join(' · ');
}

/** «2026-10-08» → «8/10». */
function diaCorto_(fecha) {
  const p = String(fecha).split('-');
  return Number(p[2]) + '/' + Number(p[1]);
}

function porcentajeTexto_(p) {
  return p === null || p === undefined ? '—' : String(p).replace('.', ',') + ' %';
}

/** Devuelve la función que escribe la hoja (la llama informeXlsx_ con la hoja ya creada). */
function hojaAsistenciaPorGrupo_(r, desde, hasta, usuarios, tipos) {
  const ordenTipo = {};
  ordenTipo[TIPO_ESTADO.PRESENTE] = 0;
  ordenTipo[TIPO_ESTADO.AUSENTE] = 1;
  // Columnas de estado: los que tienen algún registro en el informe, primero los de asistencia, luego faltas y otros.
  const usados = {};
  r._detalle.forEach(function (a) { usados[a.estado] = true; });
  const estados = Object.keys(tipos).filter(function (c) { return usados[c]; });
  Object.keys(usados).forEach(function (c) { if (!tipos[c]) estados.push(c); });
  const posicion = {};
  estados.forEach(function (c, i) { posicion[c] = i; });
  estados.sort(function (a, b) {
    const ta = tipos[a] && ordenTipo[tipos[a].tipo] !== undefined ? ordenTipo[tipos[a].tipo] : 2;
    const tb = tipos[b] && ordenTipo[tipos[b].tipo] !== undefined ? ordenTipo[tipos[b].tipo] : 2;
    return ta - tb || posicion[a] - posicion[b];
  });

  // Registros por grupo y usuario.
  const porGrupo = {};
  r._detalle.forEach(function (a) {
    const id = normalizarId_(a.usuario_id);
    const g = porGrupo[a.grupo_id] = porGrupo[a.grupo_id] || {};
    const u = g[id] = g[id] || { id: id, cuenta: {}, presentes: 0, ausentes: 0, total: 0, faltas: {} };
    u.cuenta[a.estado] = (u.cuenta[a.estado] || 0) + 1;
    u.total++;
    const t = tipos[a.estado] ? tipos[a.estado].tipo : '';
    if (t === TIPO_ESTADO.PRESENTE) u.presentes++;
    else if (t === TIPO_ESTADO.AUSENTE) {
      u.ausentes++;
      (u.faltas[a.estado] = u.faltas[a.estado] || []).push(a.fecha);
    }
  });
  // «Falta: 8/10, 15/10 · Justificada: 22/10», en el orden de las columnas de estado.
  const diasFalta = function (u) {
    return estados.filter(function (c) { return u.faltas[c]; }).map(function (c) {
      return (tipos[c] ? tipos[c].etiqueta : c) + ': ' + u.faltas[c].sort().map(diaCorto_).join(', ');
    }).join(' · ');
  };

  // Inscripciones por grupo y usuario, para la columna «Situación».
  const inscripciones = {};
  leerTabla_(HOJAS.INSCRIPCIONES).forEach(function (i) {
    if (!i.fecha_alta || i.fecha_alta > hasta) return;
    const k = i.grupo_id + '|' + normalizarId_(i.usuario_id);
    const previa = inscripciones[k];
    if (!previa || i.fecha_alta > previa.fecha_alta) inscripciones[k] = i;
  });
  const situacion = function (grupoId, id) {
    const i = inscripciones[grupoId + '|' + id];
    if (!i) return '';
    const partes = [];
    if (i.fecha_alta > desde) partes.push('Alta el ' + fechaNumerica_(i.fecha_alta));
    if (i.fecha_baja && i.fecha_baja < hasta) {
      partes.push((partes.length ? 'baja el ' : 'Baja el ') + fechaNumerica_(i.fecha_baja) + (i.motivo_baja ? ' (' + i.motivo_baja + ')' : ''));
    }
    return partes.length ? partes.join(', ') : 'En el grupo';
  };

  const grupos = {};
  leerTabla_(HOJAS.GRUPOS).forEach(function (g) { grupos[g.grupo_id] = g; });
  const cabecera = ['Usuario', 'ID'].concat(estados.map(function (c) { return tipos[c] ? tipos[c].etiqueta : c; }))
    .concat(['Total registros', '% asistencia', 'Situación', 'Días que faltó']);
  const ancho = cabecera.length;
  const colPct = ancho - 2;   // 1-based
  const vacia = function () { const f = []; for (let k = 0; k < ancho; k++) f.push(''); return f; };
  const conTexto = function (texto) { const f = vacia(); f[0] = texto; return f; };

  const filas = [];
  const formatos = [];   // { fila, tipo }
  filas.push(conTexto('Asistencia por grupo'));
  formatos.push({ fila: 1, tipo: 'titulo' });
  filas.push(conTexto('Del ' + fechaNumerica_(desde) + ' al ' + fechaNumerica_(hasta) + ' · ' + (r.taller || 'Todos los talleres')));
  filas.push(conTexto('% asistencia = asistencias ÷ (asistencias + faltas). Los eventos y otros estados neutros no cuentan.'));
  formatos.push({ fila: 2, tipo: 'nota' }, { fila: 3, tipo: 'nota' });
  filas.push(vacia());

  r.porGrupo.forEach(function (resumen) {
    const g = grupos[resumen.grupo_id] || {};
    const nombre = resumen.grupo;
    const conTaller = resumen.taller && sinTildes_(nombre).indexOf(sinTildes_(resumen.taller)) !== 0
      ? nombre + ' (' + resumen.taller + ')' : nombre;
    const horario = horarioLegible_(g);
    filas.push(conTexto(conTaller + (horario ? ' · ' + horario : '')));
    formatos.push({ fila: filas.length, tipo: 'grupo' });
    filas.push(conTexto('Clases hechas: ' + resumen.realizadas + ' · Sin clase: ' + resumen.canceladas +
      ' · Usuarios con asistencia: ' + resumen.usuarios + ' · Asistencia del grupo: ' + porcentajeTexto_(resumen.porcentaje)));
    formatos.push({ fila: filas.length, tipo: 'nota' });

    const lista = Object.keys(porGrupo[resumen.grupo_id] || {}).map(function (id) { return porGrupo[resumen.grupo_id][id]; });
    if (!lista.length) {
      filas.push(conTexto('Sin registros de asistencia en este periodo.'));
      formatos.push({ fila: filas.length, tipo: 'nota' });
      filas.push(vacia());
      return;
    }
    filas.push(cabecera.slice());
    formatos.push({ fila: filas.length, tipo: 'cabecera' });
    lista.forEach(function (u) { u.nombreHoja = (usuarios[u.id] || {}).nombre || ''; });
    lista.sort(function (a, b) { return a.nombreHoja.localeCompare(b.nombreHoja, 'es') || a.id.localeCompare(b.id); });
    const suma = { cuenta: {}, presentes: 0, ausentes: 0, total: 0 };
    lista.forEach(function (u) {
      const pct = u.presentes + u.ausentes ? u.presentes / (u.presentes + u.ausentes) : '';
      filas.push([u.nombreHoja ? nombreLegible_(u.nombreHoja) : '(ID ' + u.id + ' sin ficha)', u.id]
        .concat(estados.map(function (c) { return u.cuenta[c] || 0; }))
        .concat([u.total, pct, situacion(resumen.grupo_id, u.id), diasFalta(u)]));
      estados.forEach(function (c) { suma.cuenta[c] = (suma.cuenta[c] || 0) + (u.cuenta[c] || 0); });
      suma.presentes += u.presentes;
      suma.ausentes += u.ausentes;
      suma.total += u.total;
    });
    filas.push(['Total del grupo', ''].concat(estados.map(function (c) { return suma.cuenta[c]; }))
      .concat([suma.total, suma.presentes + suma.ausentes ? suma.presentes / (suma.presentes + suma.ausentes) : '', '', '']));
    formatos.push({ fila: filas.length, tipo: 'total' });
    filas.push(vacia());
  });

  return function (hoja) {
    hoja.clear();
    hoja.getRange(1, 2, filas.length, 1).setNumberFormat('@');            // ID como texto
    hoja.getRange(1, colPct, filas.length, 1).setNumberFormat('0.0%');
    hoja.getRange(1, 1, filas.length, ancho).setValues(filas).setVerticalAlignment('middle');
    hoja.getRange(1, 3, filas.length, ancho - 4).setHorizontalAlignment('center');
    formatos.forEach(function (f) {
      const fila = hoja.getRange(f.fila, 1, 1, ancho);
      if (f.tipo === 'titulo') hoja.getRange(f.fila, 1).setFontSize(15).setFontWeight('bold').setHorizontalAlignment('left');
      else if (f.tipo === 'nota') hoja.getRange(f.fila, 1).setFontColor('#5f6368').setHorizontalAlignment('left');
      else if (f.tipo === 'grupo') {
        fila.setBackground('#e8eaf6');
        hoja.getRange(f.fila, 1).setFontSize(12).setFontWeight('bold').setHorizontalAlignment('left');
        hoja.setRowHeight(f.fila, 28);
      } else if (f.tipo === 'cabecera') {
        fila.setFontWeight('bold').setBackground('#f1f3f4').setWrap(true)
          .setBorder(null, null, true, null, null, null, '#9aa0a6', SpreadsheetApp.BorderStyle.SOLID);
      } else if (f.tipo === 'total') {
        fila.setFontWeight('bold').setBorder(true, null, null, null, null, null, '#9aa0a6', SpreadsheetApp.BorderStyle.SOLID);
      }
    });
    hoja.setColumnWidth(1, 280);
    hoja.setColumnWidth(2, 70);
    for (let c = 3; c < ancho - 1; c++) hoja.setColumnWidth(c, 100);
    hoja.setColumnWidth(ancho - 1, 260);
    hoja.setColumnWidth(ancho, 360);
    hoja.getRange(1, ancho, filas.length, 1).setWrap(true);   // los días que faltó, en varias líneas si no caben
    hoja.setHiddenGridlines(true);
  };
}

// ---------- Hoja «Historial» (solo en la hoja de cálculo; 5-nov-2026) ----------
// La cuadrícula del Historial de la app para todo el periodo: un bloque por grupo, una fila por usuario,
// una columna por día de clase (hasta hoy) con la letra y el color del estado.

const DIAS_CORTOS_ = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const COLOR_HIST_ = { texto: '#202124', gris: '#80868b', nota: '#5f6368', blanco: '#ffffff', grupo: '#e8eaf6',
  cabecera: '#f1f3f4', sinClase: '#e8eaed', sinLista: '#fce8e6', diaLibre: '#fef7e0' };

/** Color de la hoja Estados mezclado con blanco (como los chips suaves de la app). */
function aclarar_(hex, cuanto) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return COLOR_HIST_.blanco;
  const n = parseInt(m[1], 16);
  return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(function (c) {
    return ('0' + Math.round(c + (255 - c) * cuanto).toString(16)).slice(-2);
  }).join('');
}

/** Devuelve la función que escribe la hoja (la llama informeXlsx_ con la hoja ya creada). */
function hojaHistorial_(r, desde, hasta, usuarios, tipos) {
  const fin = hasta < hoy_() ? hasta : hoy_();
  const cfg = config_();
  const grupos = {};
  leerTabla_(HOJAS.GRUPOS).forEach(function (g) { grupos[g.grupo_id] = g; });
  const sesiones = {};
  leerTabla_(HOJAS.SESIONES).forEach(function (s) {
    if (s.fecha >= desde && s.fecha <= fin) sesiones[s.grupo_id + '|' + s.fecha] = s;
  });
  const periodos = {};   // grupo → usuario → inscripciones que tocan el periodo
  leerTabla_(HOJAS.INSCRIPCIONES).forEach(function (i) {
    if (!i.fecha_alta || i.fecha_alta > fin || (i.fecha_baja && i.fecha_baja < desde)) return;
    const id = normalizarId_(i.usuario_id);
    const g = periodos[i.grupo_id] = periodos[i.grupo_id] || {};
    (g[id] = g[id] || []).push(i);
  });
  const marcas = {};   // grupo → usuario → fecha → estado (solo las que cuentan, como el resto del informe)
  r._detalle.forEach(function (a) {
    const id = normalizarId_(a.usuario_id);
    const g = marcas[a.grupo_id] = marcas[a.grupo_id] || {};
    (g[id] = g[id] || {})[a.fecha] = a.estado;
  });

  // Cada bloque: { titulo, columnas: [{ fecha, tipo, asistieron }], filas: [[celda…]], total } con celda = { v, fondo, letra }.
  const bloques = r.porGrupo.map(function (resumen) {
    const grupo = grupos[resumen.grupo_id] || { grupo_id: resumen.grupo_id };
    const columnas = [];
    for (let f = desde; f <= fin; f = sumarDias_(f, 1)) {
      const s = sesiones[resumen.grupo_id + '|' + f];
      const dentroCurso = (!cfg.inicio || f >= cfg.inicio) && (!cfg.fin || f <= cfg.fin);
      if (!s && !(tocaClase_(grupo, f) && dentroCurso)) continue;
      columnas.push({ fecha: f, tipo: s ? s.estado : (diaEspecial_(resumen.grupo_id, f) ? 'especial' : 'pendiente'), asistieron: 0 });
    }
    const insc = periodos[resumen.grupo_id] || {};
    const marc = marcas[resumen.grupo_id] || {};
    const ids = Object.keys(insc);
    Object.keys(marc).forEach(function (id) { if (!insc[id]) ids.push(id); });
    ids.sort(function (a, b) {
      return String((usuarios[a] || {}).nombre || '').localeCompare(String((usuarios[b] || {}).nombre || ''), 'es') || a.localeCompare(b);
    });
    let presentesG = 0;
    let ausentesG = 0;
    const filas = ids.map(function (id) {
      let presentes = 0;
      let ausentes = 0;
      const celdas = columnas.map(function (c) {
        if (c.tipo === ESTADO_SESION.CANCELADA) return { v: '–', fondo: COLOR_HIST_.sinClase, letra: COLOR_HIST_.gris };
        const codigo = (marc[id] || {})[c.fecha];
        if (codigo) {
          const e = tipos[codigo] || { letra: codigo, color: '', tipo: '' };
          if (e.tipo === TIPO_ESTADO.PRESENTE) { presentes++; c.asistieron++; }
          else if (e.tipo === TIPO_ESTADO.AUSENTE) ausentes++;
          return { v: e.letra, fondo: aclarar_(e.color, 0.7), letra: COLOR_HIST_.texto };
        }
        const inscrito = (insc[id] || []).some(function (i) {
          return i.fecha_alta <= c.fecha && (!i.fecha_baja || c.fecha <= i.fecha_baja);
        });
        const fondo = c.tipo === 'pendiente' ? COLOR_HIST_.sinLista : c.tipo === 'especial' ? COLOR_HIST_.diaLibre : COLOR_HIST_.blanco;
        return { v: inscrito ? '' : '·', fondo: fondo, letra: COLOR_HIST_.gris };
      });
      presentesG += presentes;
      ausentesG += ausentes;
      const nombre = (usuarios[id] || {}).nombre;
      return [{ v: nombre ? nombreLegible_(nombre) : '(ID ' + id + ' sin ficha)' }, { v: id },
        { v: presentes + ausentes ? presentes / (presentes + ausentes) : '' }].concat(celdas);
    });
    const horario = horarioLegible_(grupo);
    const nombre = resumen.grupo;
    const conTaller = resumen.taller && sinTildes_(nombre).indexOf(sinTildes_(resumen.taller)) !== 0
      ? nombre + ' (' + resumen.taller + ')' : nombre;
    return {
      titulo: conTaller + (horario ? ' · ' + horario : ''),
      columnas: columnas,
      filas: filas,
      total: presentesG + ausentesG ? presentesG / (presentesG + ausentesG) : ''
    };
  });

  const ancho = 3 + bloques.reduce(function (m, b) { return Math.max(m, b.columnas.length); }, 0);
  const valores = [];
  const fondos = [];
  const letras = [];
  const formatos = [];   // { fila, tipo }
  const fila = function (celdas, tipo) {
    const v = [], fo = [], le = [];
    for (let k = 0; k < ancho; k++) {
      const c = celdas[k] || {};
      v.push(c.v === undefined ? '' : c.v);
      fo.push(c.fondo || (tipo === 'grupo' ? COLOR_HIST_.grupo : tipo === 'cabecera' ? COLOR_HIST_.cabecera : COLOR_HIST_.blanco));
      le.push(c.letra || (tipo === 'nota' ? COLOR_HIST_.nota : COLOR_HIST_.texto));
    }
    valores.push(v);
    fondos.push(fo);
    letras.push(le);
    if (tipo) formatos.push({ fila: valores.length, tipo: tipo });
  };

  const leyenda = Object.keys(tipos).filter(function (c) { return tipos[c].activo; })
    .map(function (c) { return tipos[c].letra + ' = ' + tipos[c].etiqueta; }).join(' · ');
  fila([{ v: 'Historial de asistencia' }], 'titulo');
  fila([{ v: 'Del ' + fechaNumerica_(desde) + ' al ' + fechaNumerica_(fin) + ' · ' + (r.taller || 'Todos los talleres') }], 'nota');
  fila([{ v: leyenda }], 'nota');
  fila([{ v: '– = no hubo clase · · = no estaba inscrito' }], 'nota');
  fila([{ v: 'Rosa = sin pasar lista · amarillo = día libre' }], 'nota');
  fila([]);

  bloques.forEach(function (b) {
    fila([{ v: b.titulo }], 'grupo');
    if (!b.filas.length || !b.columnas.length) {
      fila([{ v: b.columnas.length ? 'Nadie inscrito en este periodo.' : 'Sin días de clase en este periodo.' }], 'nota');
      fila([]);
      return;
    }
    fila([{}, {}, {}].concat(b.columnas.map(function (c) { return { v: DIAS_CORTOS_[textoAFecha_(c.fecha).getDay()] }; })), 'cabecera');
    fila([{ v: 'Usuario' }, { v: 'ID' }, { v: '% asist.' }].concat(b.columnas.map(function (c) { return { v: diaCorto_(c.fecha) }; })), 'cabecera');
    b.filas.forEach(function (f) { fila(f); });
    fila([{ v: 'Asistieron' }, {}, { v: b.total }].concat(b.columnas.map(function (c) {
      if (c.tipo === ESTADO_SESION.CANCELADA) return { v: '–', letra: COLOR_HIST_.gris };
      return c.tipo === ESTADO_SESION.REALIZADA || c.asistieron ? { v: c.asistieron } : {};   // sin lista: en blanco
    })), 'total');
    fila([]);
  });

  return function (hoja) {
    hoja.clear();
    hoja.getRange(1, 2, valores.length, 1).setNumberFormat('@');          // ID como texto
    formatos.forEach(function (f) {   // «8/10» como texto, no como fecha
      if (f.tipo === 'cabecera') hoja.getRange(f.fila, 1, 1, ancho).setNumberFormat('@');
    });
    hoja.getRange(1, 3, valores.length, 1).setNumberFormat('0%');
    hoja.getRange(1, 1, valores.length, ancho).setValues(valores).setBackgrounds(fondos).setFontColors(letras)
      .setVerticalAlignment('middle');
    hoja.getRange(1, 3, valores.length, ancho - 2).setHorizontalAlignment('center');
    formatos.forEach(function (f) {
      const rango = hoja.getRange(f.fila, 1, 1, ancho);
      if (f.tipo === 'titulo') hoja.getRange(f.fila, 1).setFontSize(15).setFontWeight('bold').setHorizontalAlignment('left');
      else if (f.tipo === 'nota') hoja.getRange(f.fila, 1).setHorizontalAlignment('left');
      else if (f.tipo === 'grupo') {
        hoja.getRange(f.fila, 1).setFontSize(12).setFontWeight('bold').setHorizontalAlignment('left');
        hoja.setRowHeight(f.fila, 28);
      } else if (f.tipo === 'cabecera') rango.setFontWeight('bold');
      else if (f.tipo === 'total') {
        rango.setFontWeight('bold').setBorder(true, null, null, null, null, null, '#9aa0a6', SpreadsheetApp.BorderStyle.SOLID);
      }
    });
    hoja.setColumnWidth(1, 300);
    hoja.setColumnWidth(2, 60);
    hoja.setColumnWidth(3, 70);
    for (let c = 4; c <= ancho; c++) hoja.setColumnWidth(c, 42);
    hoja.setFrozenColumns(3);
    hoja.setHiddenGridlines(true);
  };
}

/**
 * El archivo del informe: { titulo, nombre, tipo, blob }. formato: 'pdf' o 'xlsx'.
 * Nombre del archivo sin barras: «Asistencia talleres 2026-09-01 a 2026-11-05 - Pilates.pdf».
 */
// Desde el 6-nov-2026 también exportan las monitoras: informe_ solo lleva sus grupos (gruposVisibles_).
function archivoInforme_(monitora, desde, hasta, tallerId, formato) {
  const f = FORMATOS_EXPORTAR_[formato];
  if (!f) throw errorApp_('Elige el formato: PDF u hoja de cálculo.');
  const r = informe_(monitora, desde, hasta, tallerId);
  const titulo = 'Asistencia talleres ' + fechaNumerica_(desde) + ' a ' + fechaNumerica_(hasta) + (r.taller ? ' – ' + r.taller : '');
  const nombre = ('Asistencia talleres ' + desde + ' a ' + hasta + (r.taller ? ' - ' + r.taller : ''))
    .replace(/[\\/:*?"<>|]/g, '-') + '.' + f.extension;
  const tablas = tablasInforme_(r, desde, hasta);
  const blob = formato === 'pdf' ? informePdf_(tablas, titulo) : informeXlsx_(tablas, titulo);
  blob.setName(nombre);
  return { titulo: titulo, nombre: nombre, tipo: f.tipo, blob: blob };
}

/** Para descargar en el dispositivo: { nombre, tipo, base64 }. */
function exportarInforme_(monitora, desde, hasta, tallerId, formato) {
  const a = archivoInforme_(monitora, desde, hasta, tallerId, formato);
  return { nombre: a.nombre, tipo: a.tipo, base64: Utilities.base64Encode(a.blob.getBytes()) };
}

/** Envía el informe como adjunto, desde la cuenta de quien despliega. Devuelve { correo }. */
function enviarInforme_(monitora, desde, hasta, tallerId, formato, correo) {
  const para = String(correo || '').trim().toLowerCase();
  if (!/^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(para)) throw errorApp_('Escribe un correo como nombre@gmail.com.');
  if (MailApp.getRemainingDailyQuota() < 1) throw errorApp_('Hoy ya no se pueden enviar más correos. Descárgalo o inténtalo mañana.');
  const a = archivoInforme_(monitora, desde, hasta, tallerId, formato);
  MailApp.sendEmail({
    to: para,
    subject: a.titulo,
    body: 'Adjunto el informe de asistencia a los talleres (' + a.nombre + ').',
    name: 'Asistencia talleres',
    attachments: [a.blob]
  });
  return { correo: para };
}

function escHtml_(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** PDF hecho desde HTML (sin pasar por Drive), con las tablas en las que enPdf es true. */
function informePdf_(tablas, titulo) {
  const celda = function (v) {
    const esNumero = typeof v === 'number';
    return '<td' + (esNumero ? '' : ' class="t"') + '>' + escHtml_(esNumero ? String(v).replace('.', ',') : v) + '</td>';
  };
  const css = 'body{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#202124}' +
    'h1{font-size:15pt;margin:0 0 12px}h2{font-size:11pt;margin:18px 0 6px}' +
    'table{border-collapse:collapse;width:100%}th,td{border:1px solid #dadce0;padding:3px 5px;text-align:right}' +
    'th{background:#e8eaf6}.t{text-align:left}p{color:#5f6368}';
  const cuerpo = tablas.filter(function (t) { return t.enPdf; }).map(function (t) {
    if (!t.filas.length) return '<h2>' + escHtml_(t.nombre) + '</h2><p>Sin datos.</p>';
    return '<h2>' + escHtml_(t.nombre) + '</h2><table><thead><tr>' +
      t.cabecera.map(function (c) { return '<th class="t">' + escHtml_(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      t.filas.map(function (f) { return '<tr>' + f.map(celda).join('') + '</tr>'; }).join('') +
      '</tbody></table>';
  }).join('');
  const html = '<html><head><meta charset="utf-8"><style>' + css + '</style></head><body><h1>' + escHtml_(titulo) + '</h1>' +
    cuerpo + '</body></html>';
  return Utilities.newBlob(html, 'text/html', 'informe.html').getAs('application/pdf');
}

/** Hoja de cálculo: una de paso con todas las tablas, exportada a .xlsx y borrada enseguida. */
function informeXlsx_(tablas, titulo) {
  const libro = SpreadsheetApp.create(titulo);
  const id = libro.getId();
  try {
    tablas.forEach(function (t, i) {
      const hoja = i === 0 ? libro.getSheets()[0].setName(t.nombre) : libro.insertSheet(t.nombre);
      if (t.escribir) t.escribir(hoja);
      else escribirTabla_(hoja, t.cabecera, t.filas, t.formatos);
    });
    SpreadsheetApp.flush();
    const resp = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + id + '/export?format=xlsx', {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) throw errorApp_('No se ha podido crear la hoja de cálculo. Inténtalo de nuevo.');
    return resp.getBlob();
  } finally {
    borrarArchivoDePaso_(id);
  }
}

/**
 * Borra del todo la hoja de paso con el servicio avanzado de Drive (v3, activado en appsscript.json; 5-nov-2026:
 * la llamada directa a la API de Drive fallaba porque la API no estaba activada en el proyecto y el archivo
 * acababa en la papelera). Si no se puede, la manda a la papelera, que se vacía sola a los 30 días.
 */
function borrarArchivoDePaso_(id) {
  try {
    Drive.Files.remove(id);
    return;
  } catch (e) {
    console.error('No se ha podido borrar del todo la hoja de paso del informe: ' + (e && e.message));
  }
  try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { console.error('No se ha podido mandar a la papelera la hoja de paso del informe.'); }
}

function fechaNumerica_(texto) {
  const p = String(texto).split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}
