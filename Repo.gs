/**
 * Repo.gs — Única capa que toca las hojas.
 * Lee y escribe en bloque, convierte fechas, gestiona el bloqueo y la caché.
 * Todos los valores salen de aquí como texto (fechas en yyyy-MM-dd).
 */

const CACHE_SEGUNDOS = 600;
const CACHE_MAX_CARACTERES = 90000;
const HOJAS_CACHEADAS = [HOJAS.MONITORAS, HOJAS.TALLERES, HOJAS.GRUPOS, HOJAS.USUARIOS,
  HOJAS.ESTADOS, HOJAS.LISTAS, HOJAS.CONFIG, HOJAS.DIAS_ESPECIALES];

// Caché dentro de una misma ejecución.
let memoria_ = {};
// Dentro de un bloqueo se lee siempre de la hoja, nunca de la caché.
let leerSinCache_ = false;

function libro_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function hoja_(nombre) {
  const h = libro_().getSheetByName(nombre);
  if (!h) throw errorApp_('Falta la hoja «' + nombre + '». Ejecuta «Configuración inicial» desde el menú de la hoja.');
  return h;
}

function existeHoja_(nombre) {
  return !!libro_().getSheetByName(nombre);
}

/** Error con un mensaje pensado para mostrarse tal cual a la monitora. */
function errorApp_(mensaje) {
  const e = new Error(mensaje);
  e.paraUsuario = true;
  return e;
}

// ---------- Fechas ----------

function fechaATexto_(fecha) {
  return Utilities.formatDate(fecha, ZONA_HORARIA, 'yyyy-MM-dd');
}

function textoAFecha_(texto) {
  const p = String(texto).split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

function esFechaValida_(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(texto || ''))) return false;
  return fechaATexto_(textoAFecha_(texto)) === texto;
}

function hoy_() {
  return fechaATexto_(new Date());
}

function sumarDias_(texto, dias) {
  const d = textoAFecha_(texto);
  d.setDate(d.getDate() + dias);
  return fechaATexto_(d);
}

function letraDia_(texto) {
  return LETRAS_DIAS[textoAFecha_(texto).getDay()];
}

function marcaDeTiempo_() {
  return new Date();
}

// ---------- Conversión de celdas ----------

function celdaATexto_(valor, esquema, columna) {
  if (valor instanceof Date) {
    if (esquema && (esquema.fechaHora || []).indexOf(columna) >= 0) {
      return Utilities.formatDate(valor, ZONA_HORARIA, 'yyyy-MM-dd HH:mm:ss');
    }
    // Una hora escrita a mano (10:00) llega como fecha del año 1899.
    if (valor.getFullYear() < 1900) return Utilities.formatDate(valor, ZONA_HORARIA, 'HH:mm');
    return fechaATexto_(valor);
  }
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'number') {
    return Number.isInteger(valor) ? String(valor) : String(Math.round(valor * 1e6) / 1e6);
  }
  return String(valor).trim();
}

function textoACelda_(valor, esquema, columna) {
  if (valor === undefined || valor === null) return '';
  if ((esquema.fecha || []).indexOf(columna) >= 0) {
    return valor ? textoAFecha_(valor) : '';
  }
  return valor;
}

function objetoAFila_(nombre, objeto) {
  const esquema = ESQUEMA[nombre];
  return esquema.columnas.map(function (c) { return textoACelda_(objeto[c], esquema, c); });
}

// ---------- Lectura ----------

function claveCache_(nombre) {
  return 'tabla:' + nombre;
}

/** Devuelve las filas de una hoja como objetos { columna: texto, _fila: nº de fila }. */
function leerTabla_(nombre) {
  if (memoria_[nombre]) return memoria_[nombre];
  const cacheable = !leerSinCache_ && HOJAS_CACHEADAS.indexOf(nombre) >= 0;
  let filas = null;
  if (cacheable) {
    const guardado = CacheService.getScriptCache().get(claveCache_(nombre));
    if (guardado) filas = JSON.parse(guardado);
  }
  if (!filas) {
    filas = leerHoja_(nombre);
    if (HOJAS_CACHEADAS.indexOf(nombre) >= 0) {
      try {
        const json = JSON.stringify(filas);
        if (json.length < CACHE_MAX_CARACTERES) {
          CacheService.getScriptCache().put(claveCache_(nombre), json, CACHE_SEGUNDOS);
        }
      } catch (e) {
        // Si la caché falla, se sigue sin ella.
      }
    }
  }
  memoria_[nombre] = filas;
  return filas;
}

function leerHoja_(nombre) {
  const esquema = ESQUEMA[nombre];
  const h = hoja_(nombre);
  const total = h.getLastRow() - 1;
  if (total < 1) return [];
  const valores = h.getRange(2, 1, total, esquema.columnas.length).getValues();
  const filas = [];
  valores.forEach(function (v, i) {
    if (v.every(function (x) { return x === '' || x === null; })) return;
    const o = { _fila: i + 2 };
    esquema.columnas.forEach(function (c, j) { o[c] = celdaATexto_(v[j], esquema, c); });
    filas.push(o);
  });
  return filas;
}

// ---------- Escritura ----------

function invalidar_(nombre) {
  delete memoria_[nombre];
  if (HOJAS_CACHEADAS.indexOf(nombre) >= 0) CacheService.getScriptCache().remove(claveCache_(nombre));
}

function invalidarTodo_() {
  memoria_ = {};
  CacheService.getScriptCache().removeAll(HOJAS_CACHEADAS.map(claveCache_));
}

function anadirFilas_(nombre, objetos) {
  if (!objetos.length) return;
  const h = hoja_(nombre);
  const filas = objetos.map(function (o) { return objetoAFila_(nombre, o); });
  h.getRange(h.getLastRow() + 1, 1, filas.length, filas[0].length).setValues(filas);
  invalidar_(nombre);
}

/** Actualiza filas existentes (cada objeto lleva su _fila). Agrupa las filas seguidas en un solo bloque. */
function actualizarFilas_(nombre, objetos) {
  if (!objetos.length) return;
  const h = hoja_(nombre);
  const ordenados = objetos.slice().sort(function (a, b) { return a._fila - b._fila; });
  let bloque = [];
  let inicio = null;
  const volcar = function () {
    if (!bloque.length) return;
    h.getRange(inicio, 1, bloque.length, bloque[0].length).setValues(bloque);
    bloque = [];
  };
  ordenados.forEach(function (o) {
    if (bloque.length && o._fila !== inicio + bloque.length) volcar();
    if (!bloque.length) inicio = o._fila;
    bloque.push(objetoAFila_(nombre, o));
  });
  volcar();
  invalidar_(nombre);
}

/** Borra filas por número. Agrupa las seguidas y borra de abajo arriba. */
function borrarFilas_(nombre, numerosDeFila) {
  if (!numerosDeFila.length) return;
  const h = hoja_(nombre);
  const filas = numerosDeFila.slice().sort(function (a, b) { return b - a; });
  let fin = filas[0];
  let inicio = filas[0];
  for (let i = 1; i <= filas.length; i++) {
    if (i < filas.length && filas[i] === inicio - 1) {
      inicio = filas[i];
      continue;
    }
    h.deleteRows(inicio, fin - inicio + 1);
    if (i < filas.length) { fin = filas[i]; inicio = filas[i]; }
  }
  invalidar_(nombre);
}

// ---------- Bloqueo ----------

/** Ejecuta fn con el bloqueo del script. Dentro, todas las lecturas son frescas. */
function conBloqueo_(fn) {
  const bloqueo = LockService.getScriptLock();
  if (!bloqueo.tryLock(30000)) {
    throw errorApp_('La aplicación está ocupada en este momento. Espera unos segundos e inténtalo de nuevo.');
  }
  memoria_ = {};
  leerSinCache_ = true;
  try {
    const resultado = fn();
    SpreadsheetApp.flush();
    return resultado;
  } finally {
    leerSinCache_ = false;
    bloqueo.releaseLock();
  }
}

function nuevoId_() {
  return Utilities.getUuid();
}
