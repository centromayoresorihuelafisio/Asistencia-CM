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
  DIAS_ESPECIALES: 'Dias especiales'
};

/**
 * Columnas de cada hoja, en orden.
 * - texto: columnas con formato de texto (@) para no perder ceros ni convertir valores.
 * - fecha: fechas reales en la hoja; viajan como texto yyyy-MM-dd.
 * - fechaHora: fecha y hora de guardado.
 */
const ESQUEMA = {
  [HOJAS.MONITORAS]: {
    columnas: ['email', 'nombre', 'rol', 'activa'],
    texto: ['email']
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
  FALTAS_SEGUIDAS: 'faltas_seguidas'
};

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
    { clave: CLAVES_CONFIG.FALTAS_SEGUIDAS, valor: String(FALTAS_SEGUIDAS_POR_DEFECTO) }
  ],
  taller: { taller_id: 'YOGA', nombre: 'Yoga', activo: SI },
  grupo: { grupo_id: 'YOGA-SUELO-LX', taller_id: 'YOGA', nombre: 'Yoga suelo', dias: 'L,X', hora: '10:00', activo: SI }
};

// App instalable (PWA, 6-nov-2026): la PWA llama a doPost con una clave secreta. La clave se guarda en las
// propiedades del proyecto (Configuración del proyecto › Propiedades de secuencia de comandos) con este nombre,
// nunca en el código. Sin esa propiedad, doPost no atiende a nadie.
const PROP_CLAVE_PWA = 'CLAVE_PWA';
// Código que acompaña al error de clave (o de falta de clave) para que la PWA abra su pantalla de conexión.
const CODIGO_CLAVE_PWA = 'clave';
// Espera tras una clave incorrecta, para que probar claves a ciegas sea muy lento.
const ESPERA_CLAVE_MAL_MS = 1500;
