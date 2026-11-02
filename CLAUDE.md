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

## 3. Glosario

- **Taller**: actividad general (Yoga, Pilates, Memoria…).
- **Grupo**: unidad donde se pasa lista. Pertenece a un taller y tiene monitora(s), días y hora. Ejemplo: el taller *Yoga* tiene los grupos *Yoga suelo* (lunes y miércoles) y *Yoga silla* (martes y jueves).
- **Usuario**: persona que asiste a los talleres.
- **Inscripción**: pertenencia de un usuario a un grupo entre una fecha de alta y, opcionalmente, una fecha de baja. Un usuario puede tener varias inscripciones a la vez.
- **Sesión**: una clase concreta de un grupo en una fecha.
- **Estado**: resultado de un usuario en una sesión (Asistió, Justificada…).

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

Columnas: `codigo`, `etiqueta`, `tipo`, `color` (`#rrggbb`) y `activo` (`SI`/`NO`). Un estado que deja de usarse se pone `activo = NO` en vez de borrarlo, para no romper el histórico. Datos iniciales (las letras son las que usaban las monitoras en sus Excel):

| codigo | etiqueta | tipo | color (ejemplo) |
|---|---|---|---|
| ASI | Asistió (antes «X») | presente | verde |
| NOJ | No asistió (antes, casilla en blanco) | ausente | rojo |
| JUS | Justificada (antes «J») | ausente | amarillo |
| EVE | Evento (antes «E») | neutro | azul |

`tipo` (`presente` / `ausente` / `neutro`) define cómo cuenta cada estado en las estadísticas. El estado por defecto de un pase de lista nuevo es `ASI`. Añadir un estado nuevo en la hoja no debe requerir tocar código.

### Listas
Columnas `lista` y `valor`. Inicialmente, la lista `motivo_baja` con: Cambio de grupo, Cambio de domicilio, Motivos de salud, Motivos personales, Otros. «Cambio de grupo» está reservado para la acción de cambiar de grupo.

### Config
Columnas `clave` y `valor`: `curso_activo`, `inicio_curso`, `fin_curso`, `dias_pendientes` (por defecto 14).

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
7. **Inscripciones**:
   - `fecha_baja ≥ fecha_alta`.
   - No puede haber dos inscripciones solapadas del mismo usuario en el mismo grupo.
   - Reinscribirse tras una baja crea una fila nueva con `fecha_alta` posterior a la baja anterior.
   - Alta y baja admiten **fechas retroactivas**.
8. **Cambio de grupo**: baja en el grupo de origen con motivo «Cambio de grupo» y `fecha_baja` = día anterior, y alta en el destino con `fecha_alta` = fecha del cambio. Falla si ya hay inscripción activa en el destino.
9. **Permisos**: una monitora ve y modifica solo los grupos en cuya columna `monitoras` aparece su correo. El admin ve y modifica todo. Los teléfonos solo se envían al cliente para los grupos a los que la monitora tiene acceso.

## 7. Pantallas y flujos

Diseño pensado para el móvil y para uso con una mano: botones de al menos 52 px de alto, texto de al menos 17 px en los nombres, contraste alto, textos en español y mensajes de error comprensibles. Navegación sencilla (barra inferior o botón «Volver»). Indicador de carga en cada llamada al servidor.

### 7.1 Inicio
- Cabecera con el nombre de la monitora y selector de fecha (hoy por defecto).
- **Pendientes** (en rojo, arriba): lista de pares grupo y fecha sin registrar. Un toque abre ese pase de lista.
- **Hoy**: tarjetas de los grupos que tocan, agrupadas por taller (Yoga → Yoga suelo / Yoga silla). Cada tarjeta muestra hora, nº de usuarios inscritos y el estado de la sesión (pendiente, pasada lista o cancelada).
- **Mis grupos**: todos los grupos activos de la monitora, plegable, para abrir cualquier fecha.

### 7.2 Pase de lista (grupo + fecha)
- Lista de usuarios inscritos en esa fecha, **por orden alfabético**.
- Si la sesión no existe, todos empiezan como `ASI`. Si existe, se muestran los estados guardados.
- Cada fila: nombre, chip con el estado (color de la hoja Estados) y botón de **llamada** (`tel:`) si hay teléfono.
- Un toque en la fila abre un panel inferior con los estados disponibles como botones grandes y un campo de observaciones.
- Botón **«Aplicar a todos»** para asignar un estado a todo el grupo (ej. excursión) y luego ajustar casos individuales.
- Pie fijo con contador por estado, botón **Guardar** y botón **Sesión cancelada** (con confirmación).
- Antes de guardar se muestra un resumen con los contadores y una confirmación de un toque, para evitar guardar por inercia.
- **Borrador local**: mientras se edita se guarda un borrador en `localStorage` (clave `grupo|fecha`), que se restaura al reabrir y se borra al guardar con éxito. Si `localStorage` no está disponible, se ignora sin error.
- Si el guardado falla, se conserva la pantalla tal cual y se ofrece reintentar.

### 7.3 Gestión del grupo
Pestañas:
- **Lista**: usuarios inscritos actualmente, con su fecha de alta.
- **Alta**: buscador por ID o por nombre (sin distinguir mayúsculas ni tildes). Si el usuario existe, se muestra su nombre y se inscribe con un toque. Si no existe, se ofrece «Crear usuario nuevo» (ID, nombre, teléfono opcional). La fecha de alta es hoy por defecto y editable.
- **Baja**: elegir usuario, fecha de baja (hoy por defecto, editable) y motivo (lista cerrada). Incluye la acción **Cambiar de grupo**, con cualquier grupo activo del curso como destino.

### 7.4 Historial (Fase 2)
Sesiones pasadas de un grupo con sus contadores. Se pueden abrir y corregir con el mismo pase de lista.

### 7.5 Resumen (Fase 2)
Por grupo: porcentaje de asistencia y número de sesiones realizadas y canceladas.

## 8. API (funciones llamadas desde el cliente con `google.script.run`)

Todas devuelven `{ ok: true, data: ... }` o `{ ok: false, error: "mensaje en español" }`. Nunca lanzan excepciones al cliente. Cada una comprueba la identidad y los permisos.

| Función | Descripción |
|---|---|
| `api_init()` | Monitora (email, nombre, rol), fecha de hoy, estados, motivos de baja y grupos accesibles |
| `api_inicio(fecha)` | Pendientes y grupos de la fecha con el estado de su sesión |
| `api_sesion(grupo_id, fecha)` | Usuarios inscritos en esa fecha y estados guardados (o por defecto) |
| `api_guardarSesion(payload)` | Guarda la sesión (regla 4) |
| `api_cancelarSesion(grupo_id, fecha, nota)` | Cancela la sesión (regla 5). `nota` (motivo) es opcional |
| `api_grupo(grupo_id)` | Inscripciones activas del grupo |
| `api_buscarUsuarios(texto, grupo_id)` | Búsqueda por ID o nombre; marca quién ya está en el grupo |
| `api_altaUsuario(grupo_id, datos)` | Crea el usuario si no existe e inscribe |
| `api_baja(inscripcion_id, fecha_baja, motivo)` | Da de baja |
| `api_cambiarGrupo(inscripcion_id, grupo_destino, fecha)` | Cambio de grupo (regla 8) |

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
Index.html            ← estructura de la app
Estilos.html          ← CSS (dentro de <style>)
Cliente.html          ← JS del cliente (dentro de <script>)
```

`Index.html` incluye `Estilos.html` y `Cliente.html` con `<?!= include('...') ?>`.

Menú personalizado de la hoja (`onOpen`), solo para admin: **Configuración inicial (setup)**, **Importar usuarios desde hoja…**, **Validar datos**.

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

### Fase 2
- Historial y corrección de sesiones pasadas.
- Resumen por grupo.
- Hoja **Informe** para la memoria (ver sección 14).

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
3. Los talleres y grupos iniciales y los festivos los introduce el admin en las hojas.

## 14. Estadísticas para la memoria (Fase 2)

Hoja **Informe**, con tablas dinámicas o fórmulas sobre Asistencia, Sesiones e Inscripciones:

- **% de asistencia** = registros de tipo `presente` ÷ (registros `presente` + `ausente`), por grupo, taller y mes. Los estados `neutro` no entran en el cálculo.
- **Usuarios distintos atendidos**: IDs distintos con al menos un registro `presente`, en total y por taller.
- **Altas y bajas por mes** y **motivos de baja**, desde Inscripciones.
- **Participación en eventos y excursiones** por mes y grupo.
- **Sesiones realizadas frente a canceladas**, desde Sesiones.

## 15. Convenciones de trabajo

- No hacer commit, push ni `clasp push` salvo que el dueño lo pida. Todos los archivos en LF.
- Las funciones internas acaban en `_` (así Apps Script no deja llamarlas desde el navegador). Las únicas públicas son las `api_*`, `doGet`, `include`, `onOpen`, las del menú (`menu*`), `setup`, `validarDatos` e `importarUsuariosDesdeHoja`; las tres últimas comprueban `soloAdmin_()`.

- Código y comentarios en español, con identificadores consistentes entre archivos. Antes de renombrar algo, buscar todos sus usos (servidor, cliente, hojas y `Config.gs`).
- Sin dependencias externas ni librerías.
- Cuando se modifique un archivo, **entregarlo completo**, no como diferencias, y explicar con claridad qué se cambió y por qué.
- **No hacer cambios que no se hayan pedido.** Si se detecta otro problema, comentarlo sin tocarlo.
- Trabajar por incrementos pequeños y verificables, priorizando lo pragmático sobre reescrituras completas.
- Cada vez que se entregue un archivo, indicar su ruta dentro del proyecto.

## 16. Estado del trabajo

- **2-nov-2026 — Fase 1 escrita** (todos los archivos de la sección 9). Probada en el ordenador con una simulación de las hojas: altas, pase de lista, guardar dos veces sin duplicar, cancelar, días especiales, bajas, cambio de grupo e importación con el Excel real de Yoga. **Falta probarla en Google**: `clasp push`, «Configuración inicial» desde el menú de la hoja y abrir la URL `/dev`.
- Pendiente: Fase 2 (historial, resumen, hoja Informe) y renovar grupos de un trimestre o curso a otro (Fase 3).
