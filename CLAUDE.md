# Control de asistencia a talleres sociales

Web app móvil para que las monitoras de un centro pasen lista en los talleres sociales (pilates, yoga, memoria, gimnasia, costura…). Todo se guarda en Google Sheets para sacar las estadísticas de la memoria final de curso.

Este documento es la especificación completa del proyecto. Léelo entero antes de escribir código.

---

## 1. Objetivo

- Cada monitora abre la app en el móvil, ve sus grupos, pasa lista en pocos toques y gestiona las altas y bajas de usuarios de sus grupos durante el curso.
- Los datos quedan en un Google Sheet con una estructura pensada para tablas dinámicas y estadísticas de la memoria.
- La interfaz debe ser sencilla, grande y rápida. Un pase de lista normal (casi todos presentes) debe costar 2 o 3 toques más el de guardar.

## 2. Decisiones ya tomadas (no reabrir)

| Tema | Decisión |
|---|---|
| Arquitectura | Opción A: **Apps Script como app completa** (`HtmlService`), sin hosting externo |
| Datos | Google Sheets, proyecto de Apps Script **vinculado a la hoja** (container-bound) |
| Modo sin conexión | **No** en esta versión (limitación asumida de Apps Script) |
| Identificación | Por **cuenta de Google** (Gmail personal), sin PIN. **Una copia de la hoja y de la app por monitora**: quien la despliega es admin de su copia (decidido el 2-nov-2026, sección 13) |
| Terminología | Las personas que asisten a los talleres son **«usuarios»** en toda la app, hojas y código. El personal que pasa lista son **«monitoras»** |
| ID de usuario | Se usa el **ID que ya asigna el centro** a cada usuario. No se genera ninguno propio |
| Nombre del usuario | Una sola columna con formato `APELLIDOS NOMBRE`, en mayúsculas y sin espacios sobrantes |
| Histórico | **Se empieza de cero**. No se importan asistencias de las hojas actuales. Solo se importan usuarios (ID, nombre, teléfono) y su inscripción al grupo |
| Dependencias | **Ninguna externa**: JavaScript y CSS propios, sin frameworks, sin CDN, sin fuentes externas |
| Estilo visual | El de la app de fisioterapia del dueño (`ui/CSS_Global.html` de `Servicio-de-fisioterapia-Orihuela`), adaptado al móvil. Decidido el 3-nov-2026: **sin descargar nada** (letra del sistema; Google Sans solo si el aparato ya la tiene; iconos SVG propios), **tamaños de móvil** (botones ≥ 52 px, nombres ≥ 17 px), **solo tema claro** y **sin página de guía visual** |

## 3. Glosario

- **Taller**: actividad general (Yoga, Pilates, Memoria…).
- **Grupo**: unidad donde se pasa lista. Pertenece a un taller y tiene monitora(s), días y hora. Ejemplo: el taller *Yoga* tiene los grupos *Yoga suelo* (lunes y miércoles) y *Yoga silla* (martes y jueves).
- **Usuario**: persona que asiste a los talleres.
- **Inscripción**: pertenencia de un usuario a un grupo entre una fecha de alta y, opcionalmente, una fecha de baja. Un usuario puede tener varias inscripciones a la vez.
- **Sesión**: una clase concreta de un grupo en una fecha.
- **Estado**: resultado de un usuario en una sesión (Asistido, Falta, Justificada…).

## 4. Arquitectura

```
Móvil (navegador / acceso directo en pantalla de inicio)
   │  google.script.run
   ▼
Apps Script (web app, se ejecuta como el propietario)
   ├─ Auth      → identifica a la monitora por su correo y calcula permisos
   ├─ Servicio  → reglas de negocio
   └─ Repo      → única capa que toca las hojas (lecturas y escrituras en bloque)
   ▼
Google Sheets (base de datos)
```

Principios:

- **Toda autorización se comprueba en el servidor** en cada llamada. Nunca se confía en lo que envía el cliente.
- **Una llamada por pantalla**: cada pantalla carga todo lo que necesita en una sola llamada, y guardar es una sola llamada con todo en bloque (`getValues` / `setValues`, nunca celda a celda). Cada llamada tarda 1–2 s.
- **Memoria en el cliente y precarga** (3-nov-2026): `Cliente.html` recuerda cada lectura por función y argumentos (`pedir`), así que volver a una pantalla ya vista no espera al servidor; la barra de carga solo sale si de verdad hay que esperar. Tras `api_init` se precarga en segundo plano, como mucho dos llamadas a la vez: Inicio y sus pases de lista (hoy y pendientes), historial del mes de cada grupo, informe del curso, Gestión y usuarios (admin) y altas y bajas de cada grupo. Cada escritura olvida solo lo que deja anticuado (`anticuar`: pase de lista, inscripciones, usuario, usuario nuevo, días sin clase, listas; grupos, estados y curso lo olvidan todo) y la precarga lo vuelve a pedir. Si la app vuelve a primer plano tras más de 10 minutos, se refresca todo en segundo plano. Las lecturas del servidor no cambian.
- **`LockService`** (`getScriptLock`, espera de hasta 30 s) en toda escritura, para evitar que dos monitoras se pisen.
- Datos de catálogo (grupos, estados, usuarios) cacheados con `CacheService` e invalidados al escribir.
- La capa `Repo` es la única que conoce el formato de las hojas. Así se podría migrar a otro almacenamiento sin tocar la lógica.

## 5. Modelo de datos (hojas)

Los nombres de hojas y columnas se definen **una sola vez** en `Config.gs` y se usan siempre desde ahí. No escribir nombres literales en otros archivos.

Convenciones generales:

- Los IDs y los teléfonos se guardan como **texto** (formato de columna `@`) para no perder ceros ni convertir valores.
- Las fechas se guardan como fechas reales en Sheets. Entre cliente y servidor viajan siempre como texto `yyyy-MM-dd`. La conversión se hace en `Repo.gs` con la zona horaria `Europe/Madrid`.
- Nunca se borran filas de datos: las bajas son lógicas (campo `activo` o `fecha_baja`).
- La primera fila es la cabecera, congelada.

### Monitoras
| Columna | Descripción |
|---|---|
| email | Correo de Google, en minúsculas. Clave |
| nombre | Nombre para mostrar |
| rol | `admin` o `monitora` |
| activa | `SI` / `NO` |

### Talleres
| Columna | Descripción |
|---|---|
| taller_id | Texto corto único (ej. `YOGA`) |
| nombre | Nombre para mostrar |
| activo | `SI` / `NO` |

### Grupos
| Columna | Descripción |
|---|---|
| grupo_id | Texto único (ej. `YOGA-SUELO-LX`) |
| taller_id | Referencia a Talleres |
| nombre | Ej. «Yoga suelo» |
| monitoras | Uno o varios correos separados por comas (permite sustituciones) |
| dias | Días de clase con letras `L,M,X,J,V,S,D` (ej. `L,X`) |
| hora | Texto libre (ej. `10:00`) |
| curso | Ej. `2026-2027` |
| activo | `SI` / `NO` |

### Usuarios
| Columna | Descripción |
|---|---|
| usuario_id | **ID del centro**, texto, **único** |
| nombre | `APELLIDOS NOMBRE` |
| telefono | Texto, opcional |
| activo | `SI` / `NO` |

### Inscripciones
| Columna | Descripción |
|---|---|
| inscripcion_id | UUID (`Utilities.getUuid()`) |
| usuario_id | Referencia a Usuarios |
| grupo_id | Referencia a Grupos |
| fecha_alta | Primer día en el grupo |
| fecha_baja | **Último día** en el grupo (inclusive). Vacía si sigue |
| motivo_baja | Valor de la lista `motivo_baja` |

### Sesiones
| Columna | Descripción |
|---|---|
| fecha | Fecha de la clase |
| grupo_id | Referencia a Grupos |
| estado | `realizada` o `cancelada` |
| nota | Texto libre opcional |
| registrada_por | Correo de quien la guardó |
| timestamp | Fecha y hora de guardado |

Clave única: `fecha|grupo_id`.

### Asistencia
| Columna | Descripción |
|---|---|
| clave | `fecha|grupo_id|usuario_id` (única, se usa para actualizar sin duplicar) |
| fecha | Fecha de la clase |
| grupo_id | Referencia a Grupos |
| usuario_id | Referencia a Usuarios |
| estado | Código de la hoja Estados |
| taller | Nombre del taller (copia en el momento de guardar) |
| grupo | Nombre del grupo (copia en el momento de guardar) |
| mes | `yyyy-MM` |
| observaciones | Texto libre opcional |
| registrada_por | Correo |
| timestamp | Fecha y hora de guardado |

Las columnas `taller`, `grupo` y `mes` se escriben al guardar para que las tablas dinámicas funcionen sin búsquedas y el histórico no cambie si se renombra un grupo.

### Estados (editable por el admin)

Columnas: `codigo`, `etiqueta`, `tipo`, `color` (`#rrggbb`), `activo` (`SI`/`NO`) y `letra` (la del historial; añadida el 3-nov-2026 al final: «Configuración inicial» la crea en hojas antiguas y la rellena: X, F, J, E). Un estado que deja de usarse se pone `activo = NO` en vez de borrarlo, para no romper el histórico. Datos iniciales (las letras son las que usaban las monitoras en sus Excel):

| codigo | etiqueta | tipo | color (ejemplo) |
|---|---|---|---|
| ASI | Asistido (antes «X») | presente | verde |
| NOJ | Falta (antes, casilla en blanco) | ausente | rojo |
| JUS | Justificada (antes «J») | ausente | amarillo |
| EVE | Evento (antes «E») | neutro | azul |

`tipo` (`presente` / `ausente` / `neutro`) define cómo cuenta cada estado en las estadísticas. El estado por defecto de un pase de lista nuevo es `ASI`. Añadir un estado nuevo en la hoja no debe requerir tocar código.

### Listas
Columnas `lista` y `valor`. Inicialmente, la lista `motivo_baja` con: Cambio de grupo, Cambio de domicilio, Motivos de salud, Motivos personales, Otros. «Cambio de grupo» está reservado para la acción de cambiar de grupo. La lista `obs_rapida` (3-nov-2026) guarda los textos rápidos de observaciones del pase de lista: Avisó, Llegó tarde, Se fue antes, Enfermedad, Cita médica.

### Config
Columnas `clave` y `valor`: `curso_activo`, `inicio_curso`, `fin_curso`, `dias_pendientes` (por defecto 14) y `faltas_seguidas` (por defecto 3; desde cuántas faltas seguidas se avisa en el pase de lista, 3-nov-2026). En hojas creadas antes, «Configuración inicial» añade las claves de Config que falten y la lista `obs_rapida` si no tiene valores.

### Dias especiales
Columnas `fecha`, `tipo` (lista `tipo_dia`: Festivo, Asunto propio, Vacaciones, Otro), `descripcion` y `grupo_id` (vacío = afecta a todos los grupos). La rellena el admin a mano. Sustituye a las palabras escritas en vertical en los Excel antiguos («ASUNTO PROPIO»…). Un día especial no genera pendiente, y el pase de lista de ese día muestra un aviso (se puede pasar lista igualmente si hubo clase).

## 6. Reglas de negocio

1. **Inscrito en una fecha**: `fecha_alta ≤ fecha` y (`fecha_baja` vacía o `fecha ≤ fecha_baja`).
2. **Sesión esperada**: la letra del día de la semana está en `Grupos.dias`, la fecha está entre `inicio_curso` y `fin_curso` y no es un día especial de ese grupo (hoja Dias especiales).
3. **Sesión pendiente**: sesión esperada, anterior a hoy, dentro de los últimos `dias_pendientes` días y sin fila en Sesiones. La sesión de hoy no es pendiente, aparece en «Hoy».
4. **Guardar sesión**:
   - La fecha no puede ser futura.
   - La monitora debe tener acceso al grupo (o ser admin).
   - El payload debe incluir **exactamente** a los usuarios inscritos en esa fecha: ni sobra ni falta ninguno.
   - Cada estado debe existir en la hoja Estados.
   - Se hace *upsert* en Asistencia por `clave` y en Sesiones por `fecha|grupo_id`, con estado `realizada`.
5. **Cancelar sesión**: crea o actualiza la fila de Sesiones con estado `cancelada` y **elimina** las filas de Asistencia de esa sesión (la interfaz pide confirmación). Volver a guardar la lista la deja de nuevo como `realizada`.
6. **Usuarios**:
   - `usuario_id` único, comparado como texto y sin espacios.
   - El nombre se normaliza: mayúsculas, espacios recortados y sin dobles espacios.
   - Si se da de alta un ID que ya existe, **no se crea nada nuevo**: solo se inscribe al usuario existente.
   - **Posibles duplicados** (3-nov-2026): al crear un usuario con un ID nuevo, si ya hay otro con un nombre parecido, no se crea y se devuelve `{ parecidos: [...] }`; la app pregunta «¿Es la misma persona?» (usar el existente o «Es otra persona: crear», que repite la llamada con `crear_aunque_parecido: true`). Parecido = todas las palabras del nombre más corto (al menos dos) están en el otro, en cualquier orden, sin tildes, sin «DE», «LA»… y con una errata por palabra de 4 letras o más. Las importaciones crean igualmente y lo anotan en los avisos; «Validar datos» lista los pares parecidos que ya hay.
7. **Inscripciones**:
   - `fecha_baja ≥ fecha_alta`.
   - No puede haber dos inscripciones solapadas del mismo usuario en el mismo grupo.
   - Reinscribirse tras una baja crea una fila nueva con `fecha_alta` posterior a la baja anterior.
   - Alta y baja admiten **fechas retroactivas**.
8. **Cambio de grupo**: baja en el grupo de origen con motivo «Cambio de grupo» y `fecha_baja` = día anterior, y alta en el destino con `fecha_alta` = fecha del cambio. Falla si ya hay inscripción activa en el destino.
9. **Permisos**: una monitora ve y modifica solo los grupos en cuya columna `monitoras` aparece su correo. El admin ve y modifica todo. Los teléfonos solo se envían al cliente para los grupos a los que la monitora tiene acceso.

## 7. Pantallas y flujos

Diseño pensado para el móvil y para uso con una mano: botones de al menos 52 px de alto, texto de al menos 17 px en los nombres, contraste alto, textos en español y mensajes de error comprensibles. Navegación sencilla (barra inferior o botón «Volver»). Indicador de carga cuando hay que esperar al servidor.

### 7.1 Inicio
- Cabecera con el nombre de la monitora y selector de fecha (hoy por defecto), con flechas ‹ › para ir al día anterior o siguiente (› no pasa de hoy; el día anterior se precarga) (3-nov-2026).
- **Pendientes** (en rojo, arriba): lista de pares grupo y fecha sin registrar. Un toque abre ese pase de lista. Cada tarjeta tiene además un botón **«No hubo clase»** (3-nov-2026) que, sin abrir el pase, pide confirmación con motivo opcional y cancela la sesión (regla 5); la tarjeta desaparece al momento.
- **Hoy**: tarjetas de los grupos que tocan, agrupadas por taller (Yoga → Yoga suelo / Yoga silla). Cada tarjeta muestra hora, nº de usuarios inscritos y el estado de la sesión (pendiente, pasada lista o cancelada).
- **Mis grupos**: todos los grupos activos de la monitora, plegable, para abrir cualquier fecha.

### 7.2 Pase de lista (grupo + fecha)
- Lista de usuarios inscritos en esa fecha, **por orden alfabético**.
- Si la sesión no existe, todos empiezan como `ASI`. Si existe, se muestran los estados guardados.
- Cada fila: nombre, chip con el estado (color de la hoja Estados) y botón de **llamada** (`tel:`) si hay teléfono.
- **Un toque en el chip** alterna entre el estado por defecto (`ASI`) y el primer estado de tipo `ausente` de la hoja Estados (Falta); desde cualquier otro estado vuelve a `ASI` (3-nov-2026).
- Un toque en el resto de la fila abre un panel inferior con los estados disponibles como botones grandes y un campo de observaciones, con **textos rápidos** que se añaden con un toque (lista `obs_rapida` de la hoja Listas, editable en Gestión › Listas) y el botón **«Dar de baja de este grupo…»** (fecha y motivo; al terminar se reabre el pase conservando las marcas) (3-nov-2026).
- **Faltas seguidas** (3-nov-2026): bajo el nombre sale en rojo «N faltas seguidas» si el usuario lleva al menos `faltas_seguidas` (hoja Config, por defecto 3; editable en Gestión › Curso) registros de tipo `ausente` seguidos en ese grupo antes de esa fecha. Los `neutro` ni suman ni cortan la racha; un `presente` la corta. Lo calcula el servidor (`datosSesion_`).
- Botón **«Aplicar a todos»** para asignar un estado a todo el grupo (ej. excursión) y luego ajustar casos individuales.
- Pie fijo con contador por estado, botón **Guardar** y botón **Sesión cancelada** (con confirmación).
- Antes de guardar se muestra un resumen con los contadores y una confirmación de un toque, para evitar guardar por inercia.
- **Siguiente pase** (3-nov-2026): si el pase se abrió desde Inicio y queda otro por hacer (el primer pendiente o, si no hay, el primer grupo del día sin lista), el resumen de guardar y el panel de cancelar ofrecen también «Guardar (Cancelar) y pasar a la siguiente», que abre ese pase sin volver a Inicio.
- **Borrador local**: mientras se edita se guarda un borrador en `localStorage` (clave `grupo|fecha`), que se restaura al reabrir y se borra al guardar con éxito. Si `localStorage` no está disponible, se ignora sin error.
- **Guardado en segundo plano** (3-nov-2026): al confirmar, la app vuelve (o abre el siguiente pase) sin esperar al servidor; la tarjeta del grupo muestra «Guardando…» y, al terminar, un aviso confirma. Si falla, la tarjeta muestra «Sin guardar» y un aviso explica el error; al reabrir el pase se recuperan las marcas del borrador y se vuelve a guardar. Si se intenta cerrar la app mientras se guarda, el navegador pide confirmación. Cancelar sesión sigue esperando al servidor.

### 7.3 Gestión del grupo
Pestañas:
- **Lista**: usuarios inscritos actualmente, con su fecha de alta. Tocar a uno abre un panel con **Dar de baja**, **Cambiar de grupo** y **Llamar**, con el usuario ya elegido (mismas confirmaciones que la pestaña Baja) (3-nov-2026).
- **Alta**: buscador por ID o por nombre (sin distinguir mayúsculas ni tildes). Desde el 3-nov-2026 busca **en el móvil** mientras se escribe, sobre la lista de todos los usuarios (`api_usuariosAlta`, solo ID y nombre, sin teléfonos), que se precarga (`api_buscarUsuarios` se quitó). Si el usuario existe, se muestra su nombre y se inscribe con un toque. Si no existe, se ofrece «Crear usuario nuevo» (ID, nombre, teléfono opcional). La fecha de alta es hoy por defecto y editable.
- **Baja**: elegir usuario, fecha de baja (hoy por defecto, editable) y motivo (lista cerrada). Incluye la acción **Cambiar de grupo**, con cualquier grupo activo del curso como destino.

### 7.0 Navegación (3-nov-2026)
Barra inferior fija con **Inicio**, **Historial**, **Informe** y **Gestión** (esta última solo admin). Las pantallas secundarias (pase de lista, altas y bajas, formularios) ocultan la barra y tienen botón «Volver», que regresa a la pantalla de donde se vino (por ejemplo, del pase de lista abierto desde el Historial se vuelve al Historial).

### 7.4 Historial (hecho el 3-nov-2026)
Elegir grupo y mes (‹ ›). Cuadrícula como la de los Excel antiguos: una fila por usuario inscrito algún día del mes, una columna por día con clase hasta hoy, y en cada celda la **letra** y el color del estado. Columnas de sesión cancelada (C, gris), sin pasar lista (rojo claro) y día sin clase (amarillo claro); «·» = no estaba inscrito. Última columna: % de asistencia del usuario en el mes; fila final: cuántos asistieron cada día. Arriba, contadores del mes. Tocar un día abre su pase de lista para corregirlo; tocar un nombre abre la ficha del usuario (admin).

### 7.5 Informe (hecho el 3-nov-2026)
Periodo (por defecto, del inicio de curso a hoy) y taller (o todos). Muestra: usuarios distintos atendidos, sesiones realizadas y canceladas, % de asistencia, altas y bajas; tablas por taller, por grupo y por mes; registros por estado; altas y bajas por mes; motivos de baja. Botón (admin) **«Crear hoja de cálculo con el informe»**: crea en el Drive de quien despliega una hoja nueva con las pestañas Resumen, Por taller, Por grupo, Por mes, Por estado, Altas y bajas, Motivos de baja y Detalle (un registro por fila, con el nombre del usuario), y muestra el enlace.

### 7.6 Gestión (solo admin, hecho el 3-nov-2026)
Para no tener que tocar la hoja de cálculo:
- **Grupos y talleres**: lista por taller; crear y editar grupo (taller existente o nuevo, nombre, días con botones, hora, correo de monitora/s, activo). El `grupo_id` y el `taller_id` se generan solos a partir del nombre («Yoga silla» → `YOGA-SILLA`). Un grupo desactivado deja de salir para pasar lista, pero conserva su historial. Desde el grupo se llega a «Altas y bajas» (7.3).
- **Usuarios**: buscar por ID, nombre o teléfono; crear usuario sin grupo; ficha con datos editables (el ID no se cambia), grupos (altas y bajas), inscribir en un grupo y resumen de asistencia del curso.
- **Días sin clase**: añadir un día o un intervalo (vacaciones: se apuntan solo los días en que algún grupo afectado tiene clase), tipo, descripción y grupo (o todos); lista de próximos y pasados con «Quitar».
- **Estados de asistencia**: editar nombre, letra, color, cómo cuenta y activo; crear estados nuevos (el código no se cambia después). `ASI` no se puede desactivar.
- **Curso**: nombre, primer y último día de clase, días de pendientes y faltas seguidas para avisar (entre 2 y 20).
- **Listas**: motivos de baja («Cambio de grupo» se mantiene siempre), tipos de día sin clase y observaciones rápidas.

## 8. API (funciones llamadas desde el cliente con `google.script.run`)

Todas devuelven `{ ok: true, data: ... }` o `{ ok: false, error: "mensaje en español" }`. Nunca lanzan excepciones al cliente. Cada una comprueba la identidad y los permisos.

| Función | Descripción |
|---|---|
| `api_init()` | Monitora (email, nombre, rol), fecha de hoy, estados, motivos de baja, observaciones rápidas (`obsRapidas`) y grupos accesibles |
| `api_inicio(fecha)` | Pendientes y grupos de la fecha con el estado de su sesión |
| `api_sesion(grupo_id, fecha)` | Usuarios inscritos en esa fecha y estados guardados (o por defecto). Cada usuario lleva también `inscripcion_id`, `fecha_baja` y `faltasSeguidas` (0 si no llega al aviso) |
| `api_guardarSesion(payload)` | Guarda la sesión (regla 4) |
| `api_cancelarSesion(grupo_id, fecha, nota)` | Cancela la sesión (regla 5). `nota` (motivo) es opcional |
| `api_grupo(grupo_id)` | Inscripciones activas del grupo |
| `api_usuariosAlta()` | Todos los usuarios, solo `{ usuario_id, nombre }` (sin teléfonos), para buscar en el móvil en la pestaña Alta |
| `api_altaUsuario(grupo_id, datos)` | Crea el usuario si no existe e inscribe. Con un nombre parecido a otro devuelve `{ parecidos }` sin crear, salvo `datos.crear_aunque_parecido` |
| `api_baja(inscripcion_id, fecha_baja, motivo)` | Da de baja |
| `api_cambiarGrupo(inscripcion_id, grupo_destino, fecha)` | Cambio de grupo (regla 8) |
| `api_historial(grupo_id, mes)` | Cuadrícula del grupo en el mes `yyyy-MM` (7.4) |
| `api_informe(desde, hasta, taller_id)` | Tablas del informe (7.5); solo grupos visibles para la monitora |
| `api_exportarInforme(desde, hasta, taller_id)` | Admin. Crea la hoja del informe y devuelve `{ url, nombre }` |
| `api_gestion()` | Admin. Grupos, talleres, estados, config, listas y días sin clase |
| `api_guardarGrupo(datos)` | Admin. Crea (sin `grupo_id`) o modifica un grupo; `taller_nuevo` crea el taller |
| `api_usuariosGestion(texto)` | Admin. Busca usuarios (máx. 100) |
| `api_usuario(usuario_id)` | Admin. Ficha: datos, inscripciones y asistencia del curso |
| `api_guardarUsuario(datos, nuevo)` | Admin. Crea o modifica un usuario. Al crear, igual que `api_altaUsuario` con los parecidos |
| `api_guardarDiaEspecial(datos)` / `api_borrarDiaEspecial(fecha, grupo_id)` | Admin. Días sin clase |
| `api_guardarEstado(datos, nuevo)` | Admin. Crea o modifica un estado |
| `api_guardarConfig(datos)` | Admin. Curso, fechas, días de pendientes y faltas seguidas (`faltasSeguidas`) |
| `api_guardarLista(lista, valores)` | Admin. Sustituye los valores de `motivo_baja`, `tipo_dia` u `obs_rapida` |

Contrato del payload de guardado:

```json
{
  "grupo_id": "YOGA-SUELO-LX",
  "fecha": "2026-11-04",
  "nota": "",
  "registros": [
    { "usuario_id": "1498", "estado": "ASI", "observaciones": "" }
  ]
}
```

Los nombres de campos del contrato se mantienen idénticos en cliente y servidor. Cualquier cambio se aplica en ambos lados a la vez.

## 9. Estructura del proyecto

Estructura **plana en la raíz** del repositorio, como la espera Apps Script (el proyecto se respalda en GitHub con la extensión Google Apps Script GitHub Assistant):

```
CLAUDE.md             ← este documento (no es parte del proyecto Apps Script)
appsscript.json       ← zona horaria Europe/Madrid, webapp (ver sección 11)
Config.gs             ← constantes: nombres de hojas, columnas, valores
Main.gs               ← doGet, include(), onOpen (menú de la hoja)
Setup.gs              ← setup(): crea hojas, cabeceras, formatos, validaciones y datos de ejemplo
Auth.gs               ← identificarMonitora(), permisos por grupo
Repo.gs               ← acceso a hojas, conversión de fechas, bloqueos, caché
Servicio.gs           ← reglas de negocio
Api.gs                ← funciones api_* expuestas al cliente
Importar.gs           ← importación de usuarios desde las hojas actuales
Admin.gs              ← pestaña Gestión (grupos, usuarios, días sin clase, estados, curso, listas)
Informes.gs           ← historial por grupo y mes, informe y exportación a una hoja nueva
Index.html            ← estructura de la app
Estilos.html          ← CSS (dentro de <style>)
Cliente.html          ← JS del cliente (dentro de <script>)
```

`Index.html` incluye `Estilos.html` y `Cliente.html` con `<?!= include('...') ?>`.

Menú personalizado de la hoja (`onOpen`), solo para admin: **Configuración inicial (setup)**, **Importar usuarios desde hoja…**, **Importar usuarios del documento del centro…**, **Validar datos**.

## 10. Importación de usuarios (Fase 1)

Función admin `importarUsuariosDesdeHoja(idArchivo, nombreHoja, grupo_id, fechaAlta)`.

Las hojas actuales de asistencia tienen esta forma: una cabecera con el taller y el mes, y columnas `Nº`, `USUARIO` (apellidos y nombre en una celda), `ID`, `TELÉFONO` y después una columna por fecha (`M.23`, `J.25`…) con una `X` si asistió.

Comportamiento:

- Localiza la fila de cabecera buscando las columnas `ID` y `USUARIO` (sin distinguir mayúsculas ni tildes) y lee hasta que ID y USUARIO queden vacíos.
- **Ignora** `Nº` y todas las columnas de fechas. **No importa asistencias.**
- Normaliza nombre e ID (texto, sin espacios sobrantes) y teléfono (texto).
- Crea cada usuario en Usuarios si su ID no existe. Si existe y el nombre difiere, **no sobrescribe**: lo anota en el informe.
- Crea la inscripción al `grupo_id` indicado con `fecha_alta` = `fechaAlta` (por defecto `inicio_curso`), sin duplicar inscripciones.
- Devuelve y muestra un resumen: usuarios creados, ya existentes, inscripciones creadas y avisos.

El grupo debe existir antes en la hoja Grupos (lo crea el admin a mano). Cada pestaña de los Excel de las monitoras es un grupo (ej. «MARTES Y JUEVES ESTERILLA»).

Ampliaciones (2-nov-2026): `grupo_id` vacío crea solo los usuarios, sin inscribirlos; la columna del nombre se reconoce como `USUARIO`, `NOMBRE` o `APELLIDOS NOMBRE` (sirve también para la pestaña «ALTAS TODAS» del Excel general); si un usuario existente no tiene teléfono y el documento sí, se le añade. Desde el menú se hace con «Importar usuarios desde hoja…» (cuatro preguntas). El documento de origen debe ser una hoja de cálculo de Google, no un Excel subido tal cual.

### Documento del centro «Usuarios Activos y Listas Espera» (3-nov-2026)

Función admin `importarUsuariosDelCentro(idArchivo, quien, talleres, localidades)`, en el menú «Importar usuarios del documento del centro…» (cuatro preguntas: enlace, a quién, talleres y localidades; las tres últimas muestran las opciones del documento con cuántas personas tiene cada una). **Solo crea usuarios**, no los inscribe: el documento dice el taller, no el grupo; cada persona se inscribe después desde «Altas y bajas».

- Pestañas, reconocidas por una palabra de su nombre (`CENTRO_PESTANAS` en `Config.gs`): **ALTAS** (activos, una fila por persona y taller), **ESPERA** (lista de espera) y **BAJAS** (solo aporta teléfonos). `quien`: `ACTIVOS`, `ESPERA` o `TODOS`.
- Columnas: el nombre por su cabecera (`NOMBRE`, `APELLIDOS NOMBRE`, `APELLIDO APELLIDO NOMBRE`); el ID por la cabecera `ID` o, si no tiene título (lista de espera), la columna que sigue al nombre; el **taller** y la **localidad** son las dos columnas sin título que siguen al ID; el teléfono, la primera cabecera que empieza por `TEL`, `TFNO` o `TLF`.
- Se saltan las filas vacías (la pestaña ALTAS tiene muchas entre los datos). Un ID sin ningún número («NO ID») cuenta como sin ID y va a los avisos.
- `talleres` y `localidades`: texto separado por comas, sin distinguir mayúsculas ni tildes; vacío = todos. Un valor que no existe en el documento da error con la lista de los válidos.
- Teléfono: el primero de la celda («600… / 966…», «600… HIJA»; «NO TLF» = sin teléfono). Si la fila no tiene, se toma de otra pestaña con el **mismo ID y el mismo nombre** (así 441 de las 1.054 personas activas tienen teléfono).
- Mismas reglas que la importación de arriba: no duplica, no cambia el nombre de un usuario existente (lo avisa) y solo le añade el teléfono si no tenía. El resumen dice pestañas y filtros, leídos, creados, ya existentes, teléfonos añadidos y avisos.
- Uso: subir el Excel a Drive, abrirlo y hacer *Archivo › Guardar como Hoja de cálculo de Google*; copiar el enlace de la copia y lanzar la opción del menú.

## 11. Seguridad y privacidad

- Datos personales: nombre y teléfono de los usuarios. Solo se muestran a las monitoras del grupo y al admin.
- La hoja de cálculo se comparte **solo con los admins**. Las monitoras acceden únicamente a través de la web app.
- Despliegue actual (una copia por monitora, Gmail personal): `executeAs: USER_DEPLOYING` y `access: MYSELF` en `appsscript.json`. La monitora despliega su copia y solo ella puede abrirla. Si algún día las cuentas son de un dominio de Google Workspace: `access: DOMAIN`, y `Session.getActiveUser().getEmail()` devolverá el correo de cada monitora.
- No registrar datos personales en logs.
- Conviene que la dirección o la persona responsable de protección de datos del centro revise el uso y los permisos.
- Despliegue: *Implementar → Nueva implementación → Aplicación web*. Cada cambio de código requiere una nueva versión de la implementación. El admin prueba con la URL de desarrollo (`/dev`).
- Fórmulas escritas desde script con `setFormula` usan nombres de función en inglés y separador `,`. Las fórmulas que el admin escriba a mano en la hoja (configuración regional española) usan `;`.

## 12. Fases y criterios de aceptación

### Fase 1: MVP
Incluye `setup()`, menú, identificación, días especiales (festivos), Inicio con pendientes, pase de lista, altas, bajas, cambio de grupo e importación de usuarios.

Se considera completa cuando:
- `setup()` crea todas las hojas con cabeceras, formatos de texto en ID y teléfono, estados y listas iniciales y un grupo de ejemplo.
- Una monitora de prueba solo ve sus grupos; un admin ve todos.
- Se pasa lista de un grupo (todos presentes por defecto), se cambia un estado, se guarda y al reabrir aparece lo guardado.
- Guardar dos veces la misma sesión **no duplica** filas en Asistencia.
- Una sesión cancelada elimina sus filas de Asistencia y se puede volver a registrar.
- Un grupo con clase ayer y sin registro aparece en Pendientes; un día especial (festivo, asunto propio…) no genera pendiente.
- El alta con un ID existente no crea un usuario duplicado.
- Baja y cambio de grupo respetan las fechas de inscripción: al abrir una fecha anterior a la baja, el usuario sigue en la lista.
- La importación desde una hoja con el formato descrito crea usuarios e inscripciones sin duplicados y sin tocar asistencias.
- La app es usable en un móvil con una mano.

### Fase 2 (escrita el 3-nov-2026)
- Historial y corrección de sesiones pasadas (7.4).
- Resumen por grupo e informe para la memoria, con exportación a una hoja nueva (7.5 y sección 14).
- Gestión desde la app de grupos, talleres, usuarios, días sin clase, estados, curso y listas (7.6).

### Fase 3 (opcional)
- Renovar curso (crear grupos nuevos y renovar inscripciones).
- Aviso de usuarios con faltas seguidas.
- Deslizamiento como atajo para cambiar de estado.
- Sustitución puntual de una monitora.
- Migrar a PWA real con modo sin conexión (frontend externo + Apps Script como API).

## 13. Decisiones abiertas

1. **Tipo de cuenta de las monitoras** — RESUELTO el 2-nov-2026: Gmail personal, con **una copia por monitora** (su propia hoja con solo sus talleres). En `Auth.gs`, quien despliega la copia es siempre admin; además entra cualquier correo activo de la hoja Monitoras, si Google lo entrega. Opciones que quedan para el futuro:
   - Si son cuentas del mismo dominio de Google Workspace: despliegue indicado en la sección 11, sin PIN.
   - Si son cuentas Gmail personales, con la app ejecutándose como propietario Google no entrega el correo del visitante. Alternativas: ejecutar como el usuario que accede (obliga a compartir la hoja con cada monitora como editora) o usar un PIN por monitora.
   - Por eso la identificación está **aislada en `Auth.gs` (`identificarMonitora_()`)**: cambiar el sistema no debe afectar al resto del código.
2. Si **«Justificada»** cuenta como `ausente` (valor por defecto) o `neutro`. Se cambia en la hoja Estados, sin tocar código.
3. Los talleres, grupos y festivos los introduce el admin desde la pestaña Gestión de la app (desde el 3-nov-2026); la hoja solo hace falta para «Configuración inicial», «Importar usuarios» y «Validar datos».

## 14. Estadísticas para la memoria (Fase 2)

Implementado en `Informes.gs` (pestaña Informe de la app y exportación a una hoja nueva en vez de una hoja «Informe» fija). Contenido:

- **% de asistencia** = registros de tipo `presente` ÷ (registros `presente` + `ausente`), por grupo, taller y mes. Los estados `neutro` no entran en el cálculo.
- **Usuarios distintos atendidos**: IDs distintos con al menos un registro `presente`, en total y por taller.
- **Altas y bajas por mes** y **motivos de baja**, desde Inscripciones.
- **Participación en eventos y excursiones** por mes y grupo.
- **Sesiones realizadas frente a canceladas**, desde Sesiones.

## 15. Convenciones de trabajo

- No hacer commit, push ni `clasp push` salvo que el dueño lo pida. Todos los archivos en LF.
- Las funciones internas acaban en `_` (así Apps Script no deja llamarlas desde el navegador). Las únicas públicas son las `api_*`, `doGet`, `include`, `onOpen`, las del menú (`menu*`), `setup`, `validarDatos`, `importarUsuariosDesdeHoja` e `importarUsuariosDelCentro`; las cuatro últimas comprueban `soloAdmin_()`.

- Código y comentarios en español, con identificadores consistentes entre archivos. Antes de renombrar algo, buscar todos sus usos (servidor, cliente, hojas y `Config.gs`).
- Sin dependencias externas ni librerías.
- Cuando se modifique un archivo, **entregarlo completo**, no como diferencias, y explicar con claridad qué se cambió y por qué.
- **No hacer cambios que no se hayan pedido.** Si se detecta otro problema, comentarlo sin tocarlo.
- Trabajar por incrementos pequeños y verificables, priorizando lo pragmático sobre reescrituras completas.
- Cada vez que se entregue un archivo, indicar su ruta dentro del proyecto.

## 16. Estado del trabajo

- **2-nov-2026 — Fase 1 escrita** (todos los archivos de la sección 9). Probada en el ordenador con una simulación de las hojas: altas, pase de lista, guardar dos veces sin duplicar, cancelar, días especiales, bajas, cambio de grupo e importación con el Excel real de Yoga. **Falta probarla en Google**: `clasp push`, «Configuración inicial» desde el menú de la hoja y abrir la URL `/dev`.
- **2-nov-2026** — El dueño hizo `clasp push`, «Configuración inicial» y la implementación de la web app.
- **3-nov-2026 — Fase 2 escrita**: barra inferior, Historial, Informe con exportación y Gestión (`Admin.gs`, `Informes.gs`). Probada con la simulación de hojas y en el navegador con datos de prueba. **Falta probarla en Google**: tras `clasp push`, volver a ejecutar «Configuración inicial» (añade la columna `letra` en Estados) y crear una versión nueva de la implementación. La primera exportación pedirá permiso para crear hojas de cálculo.
- **3-nov-2026 — Rediseño visual** (solo `Estilos.html`; `Index.html`, `Cliente.html` y los `.gs` no cambian): mismo sistema que la app de fisio. Todas las medidas salen de variables en `:root` con los nombres de fisio (`--md-*` para colores, esquinas, sombras; `--fs-*`, `--dur-*`, `--z-*`); no se escriben colores, esquinas, sombras ni `z-index` sueltos, salvo los colores de cada estado, que vienen de la hoja Estados. Cabecera blanca, botones en pastilla (acción principal tonal azul claro; acción de riesgo con letra roja y borde; confirmación de borrar en rojo lleno), campos con borde y etiqueta encima, panel inferior con esquinas de 28 px y asa, pestañas segmentadas, barra inferior con indicador en pastilla, tablas como `.md-tabla`, avisos oscuros arriba (como los de fisio, pero arriba para no tapar el pie) y barra de carga fina arriba. Revisado en el navegador en tamaño móvil con datos de prueba (todas las pantallas). **Falta probarlo en Google**: `clasp push` y abrir `/dev` en el móvil.
- **3-nov-2026 — Estados más suaves y nombres nuevos**: los colores de los estados se dibujan suavizados (`Estilos.html`, regla `[style*="--estado"]`: color de la hoja mezclado con gris, fondo claro y letra del mismo color oscurecida); `estiloColor` de `Cliente.html` solo pasa el color como `--estado`. La hoja Estados guarda el color original. Nombres iniciales en `Config.gs`: «Asistido» y «Falta» (antes «Asistió» y «No asistió»); en una hoja ya creada se cambian en Gestión › Estados.
- **3-nov-2026 — Navegación instantánea** (solo `Cliente.html`): memoria de lecturas en el cliente, precarga escalonada tras `api_init` y olvido selectivo tras cada escritura (sección 4). El Informe muestra al entrar el del curso hasta hoy, sin pulsar «Ver informe». Probado con la simulación de hojas (respuestas de 1,5 s) en tamaño móvil: tras la precarga, Inicio, Historial, Informe, Gestión, pases de lista y altas y bajas se abren sin llamar al servidor; tras guardar o cancelar un pase, dar de baja, crear un usuario o cambiar el curso se ven los datos nuevos. **Falta probarlo en Google**: `clasp push`, versión nueva de la implementación y abrir `/dev` en el móvil.
- **3-nov-2026 — Importación del documento del centro** (`Importar.gs`, `Config.gs`, `Main.gs`; sección 10): activos, lista de espera o los dos, con filtro por taller y localidad. La parte que escribe en Usuarios se comparte con la importación de antes, que funciona igual. Probada con una simulación de las hojas y el Excel real (1.054 activos y 264 más de la lista de espera, sin duplicados al repetir). **Falta probarla en Google**: `clasp push`, recargar la hoja para ver la opción nueva del menú y convertir el Excel a hoja de cálculo de Google.
- **3-nov-2026 — Aviso de posibles duplicados** (`Config.gs`, `Servicio.gs`, `Admin.gs`, `Importar.gs`, `Setup.gs`, `Cliente.html`; regla 6): al crear un usuario (Altas y bajas o Gestión › Usuarios), en las dos importaciones y en «Validar datos». Probada la detección en Node (tildes, orden, falta de apellido, erratas, partículas; no salta con nombres distintos). **Falta probarlo en Google y ver el panel en el móvil.**
- **3-nov-2026 — Pase de lista más rápido** (`Cliente.html`, `Estilos.html`; sección 7.2): un toque en el chip alterna Asistido/Falta, el guardado va en segundo plano y se puede encadenar con el siguiente pase pendiente. Probado con una simulación (respuestas de 1,5 s) en tamaño móvil: alternar, panel de otros estados, guardar y pasar al siguiente (se abre al momento), fallo del servidor con «Sin guardar» y reintento con las marcas conservadas, cancelar y pasar al siguiente, y cinco pases seguidos sin pasar por Inicio. **Falta probarlo en Google**: `clasp push`, versión nueva de la implementación y abrir `/dev` en el móvil.
- **3-nov-2026 — Más atajos en el flujo** (`Cliente.html`, `Estilos.html`, `Servicio.gs`, `Api.gs`, `Config.gs`; secciones 7.1, 7.2, 7.3 y 8): «No hubo clase» en cada pendiente de Inicio; búsqueda instantánea en Altas (`api_usuariosAlta`, nueva); baja y cambio de grupo tocando al usuario en la Lista, y baja desde el panel del usuario en el pase de lista; flechas ‹ › de día en Inicio; marca de faltas seguidas en el pase de lista; observaciones rápidas. Probado con una simulación (respuestas de 1,5 s) en tamaño móvil: cancelar un pendiente sin abrir el pase (y que no abra el pase), búsqueda sin llamadas al servidor (ID, nombre con y sin tildes, «Ya está»), inscribir y que la lista se actualice, baja y cambio de grupo desde la Lista, baja desde el pase conservando las marcas y quitando al usuario si su último día es anterior, flechas sin pasar de hoy, faltas seguidas con un evento en medio y textos rápidos sin repetir. La función `faltasSeguidas_` se probó en Node. **Falta probarlo en Google**: `clasp push`, versión nueva de la implementación y abrir `/dev` en el móvil (en especial, el tiempo de `api_usuariosAlta` y de `api_sesion` con la hoja Asistencia real, que ahora se lee siempre para las faltas seguidas).
- **3-nov-2026 — Ajustes sin tocar código** (`Config.gs`, `Servicio.gs`, `Admin.gs`, `Setup.gs`, `Api.gs`, `Cliente.html`; secciones 5, 7.2, 7.6 y 8): las observaciones rápidas salen de la lista `obs_rapida` (Gestión › Listas) y el aviso de faltas seguidas de la clave `faltas_seguidas` de Config (Gestión › Curso). Se quitó `api_buscarUsuarios` (y `buscarUsuarios_`), que ya no usaba la app. Probado con la simulación: cambiar la lista y verla en el panel del pase, subir el aviso a 4 y que desaparezcan las marcas, rechazar 1; `completarDatosNuevos_` probada en Node (añade solo lo que falta, también al repetirla). **Falta probarlo en Google**: tras `clasp push`, ejecutar otra vez «Configuración inicial» (añade `faltas_seguidas` y la lista `obs_rapida`) y crear una versión nueva de la implementación.
- Pendiente: renovar grupos de un trimestre o curso a otro (Fase 3). Fase 3 «Aviso de usuarios con faltas seguidas»: hecho en el pase de lista (3-nov-2026).
