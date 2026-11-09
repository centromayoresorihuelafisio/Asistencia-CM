/**
 * Config.gs — Nombres de hojas, columnas y valores fijos.
 * Es el ÚNICO sitio donde se escriben los nombres de hojas y columnas.
 * El resto del código los usa siempre desde aquí.
 */

const ZONA_HORARIA = 'Europe/Madrid';

const HOJAS = {
  MONITORAS: 'Monitoras',
  TALLERES: 'Talleres',
  GRUPOS: 'Grupos',
  USUARIOS: 'Usuarios',
  INSCRIPCIONES: 'Inscripciones',
  SESIONES: 'Sesiones',
  ASISTENCIA: 'Asistencia',
  ESTADOS: 'Estados',
  LISTAS: 'Listas',
  CONFIG: 'Config',
  DIAS_ESPECIALES: 'Dias especiales',
  ACCESOS: 'Accesos'
};

/**
 * Columnas de cada hoja, en orden.
 * - texto: columnas con formato de texto (@) para no perder ceros ni convertir valores.
 * - fecha: fechas reales en la hoja; viajan como texto yyyy-MM-dd.
 * - fechaHora: fecha y hora de guardado.
 */
const ESQUEMA = {
  [HOJAS.MONITORAS]: {
    // Cuentas de la app (9-nov-2026, Auth.gs): usuario y contraseña. clave_hash = «iteraciones$resumen» de la
    // contraseña con su sal (nunca la contraseña); debe_cambiar = SI tras una contraseña temporal; intentos y
    // bloqueada_hasta (milisegundos) para frenar a quien pruebe contraseñas; ultimo_acceso, solo informativo.
    columnas: ['email', 'nombre', 'rol', 'activa', 'clave_hash', 'usuario', 'sal', 'debe_cambiar', 'intentos',
      'bloqueada_hasta', 'ultimo_acceso'],
    texto: ['email', 'clave_hash', 'usuario', 'sal', 'bloqueada_hasta', 'ultimo_acceso']
  },
  // Sesiones abiertas de la app instalable (9-nov-2026, Auth.gs): una fila por aparato. Solo la huella del token
  // (nunca el token). Duran hasta que se cierran: «Cerrar sesión», cambio de contraseña, monitora desactivada o
  // «Cerrar sus sesiones» en Ajustes › Monitoras. Es la única hoja (con Deshacer) en la que se borran filas.
  [HOJAS.ACCESOS]: {
    columnas: ['token_hash', 'email', 'aparato', 'creada', 'ultimo_uso', 'ver_como'],
    texto: ['token_hash', 'email', 'aparato', 'creada', 'ultimo_uso', 'ver_como']
  },
  [HOJAS.TALLERES]: {
    columnas: ['taller_id', 'nombre', 'activo'],
    texto: ['taller_id']
  },
  [HOJAS.GRUPOS]: {
    columnas: ['grupo_id', 'taller_id', 'nombre', 'monitoras', 'dias', 'hora', 'curso', 'activo'],
    texto: ['grupo_id', 'taller_id', 'dias', 'hora', 'curso']
  },
  [HOJAS.USUARIOS]: {
    columnas: ['usuario_id', 'nombre', 'telefono', 'activo'],
    texto: ['usuario_id', 'telefono']
  },
  [HOJAS.INSCRIPCIONES]: {
    columnas: ['inscripcion_id', 'usuario_id', 'grupo_id', 'fecha_alta', 'fecha_baja', 'motivo_baja'],
    texto: ['inscripcion_id', 'usuario_id', 'grupo_id'],
    fecha: ['fecha_alta', 'fecha_baja']
  },
  [HOJAS.SESIONES]: {
    columnas: ['fecha', 'grupo_id', 'estado', 'nota', 'registrada_por', 'timestamp'],
    texto: ['grupo_id'],
    fecha: ['fecha'],
    fechaHora: ['timestamp']
  },
  [HOJAS.ASISTENCIA]: {
    columnas: ['clave', 'fecha', 'grupo_id', 'usuario_id', 'estado', 'taller', 'grupo', 'mes',
      'observaciones', 'registrada_por', 'timestamp'],
    texto: ['clave', 'grupo_id', 'usuario_id', 'estado', 'mes'],
    fecha: ['fecha'],
    fechaHora: ['timestamp']
  },
  [HOJAS.ESTADOS]: {
    // letra: abreviatura que se ve en el historial (X, J, E…). Se añadió el 3-nov-2026 al final para no mover columnas.
    columnas: ['codigo', 'etiqueta', 'tipo', 'color', 'activo', 'letra'],
    texto: ['codigo', 'color', 'letra']
  },
  [HOJAS.LISTAS]: {
    columnas: ['lista', 'valor'],
    texto: ['lista']
  },
  [HOJAS.CONFIG]: {
    columnas: ['clave', 'valor'],
    texto: ['clave']
  },
  // Días sin clase: festivos, asuntos propios, vacaciones… grupo_id vacío = afecta a todos los grupos.
  [HOJAS.DIAS_ESPECIALES]: {
    columnas: ['fecha', 'tipo', 'descripcion', 'grupo_id'],
    texto: ['grupo_id'],
    fecha: ['fecha']
  }
};

const SI = 'SI';
const NO = 'NO';

const ROL = { ADMIN: 'admin', MONITORA: 'monitora' };

const TIPO_ESTADO = { PRESENTE: 'presente', AUSENTE: 'ausente', NEUTRO: 'neutro' };

const ESTADO_SESION = { REALIZADA: 'realizada', CANCELADA: 'cancelada' };

// Estado con el que empieza cada usuario en un pase de lista nuevo.
const ESTADO_POR_DEFECTO = 'ASI';
// «Sin marcar» (9-nov-2026): en una sesión hecha, un usuario inscrito sin fila en Asistencia está pendiente solo
// para él (por ejemplo, una casilla vacía de un Excel importado). No es un estado de la hoja Estados: entre cliente y
// servidor viaja como estado vacío, y al guardar no se escribe ninguna fila (no cuenta en ninguna estadística).
const ESTADO_SIN_MARCAR = '';

const LISTA_MOTIVO_BAJA = 'motivo_baja';
const LISTA_TIPO_DIA = 'tipo_dia';
// Textos rápidos de observaciones en el pase de lista.
const LISTA_OBS_RAPIDA = 'obs_rapida';

// Motivo reservado para la acción «Cambiar de grupo».
const MOTIVO_CAMBIO_GRUPO = 'Cambio de grupo';

// Letra de cada día de la semana. El índice es el de Date.getDay() (0 = domingo).
const LETRAS_DIAS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
// Orden en que se muestran y guardan los días de un grupo.
const ORDEN_DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

// Listas que se pueden editar desde la app (Gestión › Listas).
const LISTAS_EDITABLES = [LISTA_MOTIVO_BAJA, LISTA_TIPO_DIA, LISTA_OBS_RAPIDA];

// Máximo de días que se apuntan de una vez como «día sin clase» (un intervalo de vacaciones).
const MAX_DIAS_INTERVALO = 120;

const CLAVES_CONFIG = {
  CURSO: 'curso_activo',
  INICIO: 'inicio_curso',
  FIN: 'fin_curso',
  DIAS_PENDIENTES: 'dias_pendientes',
  FALTAS_SEGUIDAS: 'faltas_seguidas',
  // Primer día del 2.º y del 3.º trimestre (6-nov-2026): el periodo «Este trimestre» del Informe.
  TRIMESTRE2: 'inicio_trimestre2',
  TRIMESTRE3: 'inicio_trimestre3'
};

// Si la hoja Config no dice otra cosa, el 2.º trimestre empieza el 1 de enero y el 3.º el 1 de abril
// siguientes al inicio de curso (mes y día, MM-dd).
const TRIMESTRES_POR_DEFECTO = { TRIMESTRE2: '01-01', TRIMESTRE3: '04-01' };

const DIAS_PENDIENTES_POR_DEFECTO = 14;

// Pase de lista: a partir de cuántas faltas seguidas (registros de tipo ausente) se marca al usuario,
// si la hoja Config no dice otra cosa (clave faltas_seguidas).
const FALTAS_SEGUIDAS_POR_DEFECTO = 3;

// Aviso de posibles usuarios duplicados (nombres parecidos con otro ID).
// Palabras que no cuentan al comparar nombres («GARCIA DE LA TORRE» = «GARCIA TORRE»).
const NOMBRE_PALABRAS_IGNORADAS = ['DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y', 'I'];
// Una palabra de al menos esta longitud se da por igual con una letra de diferencia (GONZALEZ / GONZALES).
const NOMBRE_LONGITUD_ERRATA = 4;
// Máximo de usuarios parecidos que se enseñan al crear uno.
const MAX_PARECIDOS = 5;

// Cabeceras que se reconocen al importar (comparadas en mayúsculas y sin tildes).
const IMPORTAR_CABECERA_ID = ['ID'];
const IMPORTAR_CABECERA_NOMBRE = ['USUARIO', 'NOMBRE', 'APELLIDOS NOMBRE', 'APELLIDO APELLIDO NOMBRE'];
const IMPORTAR_CABECERA_TELEFONO = ['TELEFONO', 'TFNO', 'TLF'];

// Importar desde la app (9-nov-2026, Gestión › Importar desde Excel): los Excel de asistencia de las monitoras.
// Una casilla de día en la cabecera: letra del día y número («L.7», «M 23», «V7»).
const IMPORTAR_PATRON_DIA = /^([LMXJVSD])\s*[.\-]?\s*(\d{1,2})$/;
// Una fila de la cabecera es la de los días si tiene al menos tantas casillas de día.
const IMPORTAR_MIN_DIAS = 3;
// Meses de la fila de encima de los días (en mayúsculas y sin tildes; se comparan sin signos).
const IMPORTAR_MESES = {
  ENE: 1, ENERO: 1, FEB: 2, FEBRERO: 2, MAR: 3, MARZO: 3, ABR: 4, ABRIL: 4, MAY: 5, MAYO: 5, JUN: 6, JUNIO: 6,
  JUL: 7, JULIO: 7, AGO: 8, AGOSTO: 8, SEP: 9, SEPT: 9, SEPTIEMBRE: 9, SETIEMBRE: 9, OCT: 10, OCTUBRE: 10,
  NOV: 11, NOVIEMBRE: 11, DIC: 12, DICIEMBRE: 12
};
// El curso empieza en este mes: los meses desde aquí son del primer año del curso y los anteriores, del segundo.
const IMPORTAR_MES_INICIO_CURSO = 8;
// Marcas que se ignoran (como una casilla vacía). «V» se usó un tiempo y ya no se usa (dueño, 9-nov-2026).
const IMPORTAR_MARCAS_IGNORADAS = ['V'];
// Una columna es una palabra escrita en vertical («VACACIONES», «ASUNTO PROPIO») si tiene al menos tantas
// casillas que no son marcas de estado. Esas columnas se importan como «No hubo clase» con la palabra como nota.
const IMPORTAR_MIN_LETRAS_PALABRA = 3;
// Nota de los días sin ninguna marca anteriores a la última clase con marcas, si se importan como «No hubo clase».
const IMPORTAR_NOTA_SIN_MARCAS = 'Sin marcas en el Excel';
// Una hora en la fila que separa dos grupos de una misma pestaña («L-X | 17:00h 18:00h», «17H-18:00H»).
const IMPORTAR_PATRON_HORA = /(\d{1,2})\s*(?:[:.]\s*(\d{2}))?\s*H\b|\b(\d{1,2})[:.](\d{2})\b/i;
// Límites de lo que se lee de cada archivo (para no colgar la app con una hoja enorme).
const IMPORTAR_MAX_HOJAS = 30;
const IMPORTAR_MAX_FILAS = 1500;
const IMPORTAR_MAX_COLUMNAS = 400;
// Historial editable (9-nov-2026): cambios que se guardan de una vez como mucho.
const MAX_CAMBIOS_HISTORIAL = 1000;

// Documento del centro «Usuarios Activos y Listas Espera» (sección 10).
// Cada pestaña se reconoce por una palabra de su nombre (en mayúsculas y sin tildes).
const CENTRO_PESTANAS = { ACTIVOS: 'ALTAS', ESPERA: 'ESPERA', BAJAS: 'BAJAS' };
// Qué se importa: los activos, la lista de espera o las dos. Las bajas solo aportan teléfonos.
const CENTRO_QUIEN = { ACTIVOS: ['ACTIVOS'], ESPERA: ['ESPERA'], TODOS: ['ACTIVOS', 'ESPERA'] };
// El taller y la localidad no tienen título: son las dos columnas que siguen a la del ID.
// Si la columna del ID tampoco tiene título (lista de espera), es la que sigue a la del nombre.
const CENTRO_COLUMNAS_TRAS_ID = { TALLER: 1, LOCALIDAD: 2 };
// La columna del teléfono es la primera cuya cabecera empieza por una de estas palabras (TELÉFONO, Tfno…).
const CENTRO_CABECERA_TELEFONO = ['TEL', 'TFNO', 'TLF'];

// Datos que crea setup() la primera vez (solo si la hoja está vacía; completarDatosNuevos_ añade después
// las claves de Config y la lista obs_rapida que falten en hojas creadas antes).
const DATOS_INICIALES = {
  estados: [
    { codigo: 'ASI', etiqueta: 'Asistido', tipo: TIPO_ESTADO.PRESENTE, color: '#2e7d32', activo: SI, letra: 'X' },
    { codigo: 'NOJ', etiqueta: 'Falta', tipo: TIPO_ESTADO.AUSENTE, color: '#c62828', activo: SI, letra: 'F' },
    { codigo: 'JUS', etiqueta: 'Justificada', tipo: TIPO_ESTADO.AUSENTE, color: '#f9a825', activo: SI, letra: 'J' },
    { codigo: 'EVE', etiqueta: 'Evento', tipo: TIPO_ESTADO.NEUTRO, color: '#1565c0', activo: SI, letra: 'E' }
  ],
  listas: [
    { lista: LISTA_MOTIVO_BAJA, valor: MOTIVO_CAMBIO_GRUPO },
    { lista: LISTA_MOTIVO_BAJA, valor: 'Cambio de domicilio' },
    { lista: LISTA_MOTIVO_BAJA, valor: 'Motivos de salud' },
    { lista: LISTA_MOTIVO_BAJA, valor: 'Motivos personales' },
    { lista: LISTA_MOTIVO_BAJA, valor: 'Otros' },
    { lista: LISTA_TIPO_DIA, valor: 'Festivo' },
    { lista: LISTA_TIPO_DIA, valor: 'Asunto propio' },
    { lista: LISTA_TIPO_DIA, valor: 'Vacaciones' },
    { lista: LISTA_TIPO_DIA, valor: 'Otro' },
    { lista: LISTA_OBS_RAPIDA, valor: 'Avisó' },
    { lista: LISTA_OBS_RAPIDA, valor: 'Llegó tarde' },
    { lista: LISTA_OBS_RAPIDA, valor: 'Se fue antes' },
    { lista: LISTA_OBS_RAPIDA, valor: 'Enfermedad' },
    { lista: LISTA_OBS_RAPIDA, valor: 'Cita médica' }
  ],
  config: [
    { clave: CLAVES_CONFIG.CURSO, valor: '2026-2027' },
    { clave: CLAVES_CONFIG.INICIO, valor: '2026-09-01', esFecha: true },
    { clave: CLAVES_CONFIG.FIN, valor: '2027-06-30', esFecha: true },
    { clave: CLAVES_CONFIG.DIAS_PENDIENTES, valor: String(DIAS_PENDIENTES_POR_DEFECTO) },
    { clave: CLAVES_CONFIG.FALTAS_SEGUIDAS, valor: String(FALTAS_SEGUIDAS_POR_DEFECTO) },
    // En hojas ya creadas, completarDatosNuevos_ las calcula a partir del inicio de curso de la hoja.
    { clave: CLAVES_CONFIG.TRIMESTRE2, valor: '2027-01-01', esFecha: true },
    { clave: CLAVES_CONFIG.TRIMESTRE3, valor: '2027-04-01', esFecha: true }
  ],
  taller: { taller_id: 'YOGA', nombre: 'Yoga', activo: SI },
  grupo: { grupo_id: 'YOGA-SUELO-LX', taller_id: 'YOGA', nombre: 'Yoga suelo', dias: 'L,X', hora: '10:00', activo: SI }
};

// App instalable (PWA): cada monitora entra con su usuario y contraseña (9-nov-2026; antes, una clave por enlace).
// Dirección pública de la PWA (GitHub Pages): sale en la página del enlace /exec, que no abre la app.
const URL_PWA = 'https://centromayoresorihuelafisio.github.io/Asistencia-CM/';
// Códigos que acompañan a ciertos errores de la PWA (pwa/api.js usa los mismos valores):
// 'sesion' = sin sesión o cerrada (sale la pantalla de entrada); 'cambiar' = tiene que cambiar la contraseña temporal.
const CODIGO_SESION_PWA = 'sesion';
const CODIGO_CAMBIAR_PWA = 'cambiar';
// Espera tras un usuario o contraseña incorrectos, para que probar contraseñas a ciegas sea lento.
const ESPERA_CLAVE_MAL_MS = 1500;
// Contraseñas (como en la app de fisio): mínimo 4 caracteres (vale un PIN), sal por cuenta e iteraciones de SHA-256.
const CONTRASENA_MIN = 4;
const CONTRASENA_MAX = 200;
const CONTRASENA_ITERACIONES = 1000;
// Tras MAX_FALLOS intentos fallidos seguidos, la cuenta se bloquea BLOQUEO_MIN minutos y se avisa por correo.
const MAX_FALLOS = 5;
const BLOQUEO_MIN = 15;
// Nombre de usuario: minúsculas, números, punto, guion y guion bajo.
const PATRON_USUARIO = /^[a-z0-9._-]{3,30}$/;
