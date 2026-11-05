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
| Identificación | **Una copia de la hoja y de la app por monitora**: quien la despliega es admin de su copia (decidido el 2-nov-2026, sección 13). Desde el 5-nov-2026 se abre con **cualquier cuenta de Google o sin ninguna**, como la app de fisio, pero **sin login**: basta el enlace, y quien entra lo hace como la propietaria (admin) (sección 11) |
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
- **Carga sin bloquear** (4-nov-2026, `PLAN-PULIDO.md` fase 3): no hay velo ni círculo de pantalla completa; mientras se espera al servidor solo sale la barra fina de arriba y la pantalla se puede seguir usando. Una pantalla cuyos datos no están en memoria se abre al momento con su **esqueleto** (formas grises con un brillo suave, sin brillo si el sistema pide reducir el movimiento): Inicio, 3 tarjetas; pase de lista, 8 filas; Historial, la cuadrícula vacía; Informe, Gestión, Altas y bajas y ficha, bloques. Si están en memoria, se pinta directamente, sin esqueleto (`cargarPantalla` en `Cliente.html`). **Una sola señal de carga** (4-nov-2026): mientras la pantalla enseña su esqueleto, la barra fina de arriba no sale (`mostrarBarraCarga`); sale solo cuando se espera al servidor sin esqueleto (al guardar o al volver a pedir una pantalla ya pintada). Si la carga falla (o `api_init` al abrir la app), la propia pantalla muestra «Sin conexión» o «Algo ha fallado», una línea de qué hacer y **Reintentar**. Una respuesta que llega cuando ya se ha ido a otra pantalla se ignora (`app.nav`), y lo que se hace tras una escritura de Gestión (volver a pintar la lista) solo se hace si se sigue en esa pantalla (`siSigue`).
- **Botón ocupado** (4-nov-2026): una escritura deja el botón pulsado desactivado, con un círculo de 18 px y el texto en gerundio («Dando de baja…», «Inscribiendo…», «Guardando…»), así no se puede pulsar dos veces. Si falla, vuelve a estar como antes.
- **Aviso abajo y «Deshacer»** (4-nov-2026, `PLAN-PULIDO.md` fase 4): los avisos salen abajo, como en Android, 16 px por encima de lo que esté fijo abajo (barra inferior, pie del pase, botón flotante o panel abierto; si un panel es muy alto, arriba) (`aviso` y `colocarAviso` en `Cliente.html`). Una línea (los errores, hasta cuatro) y, si hace falta, un botón de texto. Se cierran solos (4 s; los errores, 7 s), al tocarlos o deslizándolos hacia un lado. Textos cortos: «Lista guardada · Pilates», con la fecha solo si no es hoy. **Deshacer** durante 6 s tras una baja (sin segunda confirmación), una inscripción, «No hubo clase» (desde Inicio y, desde el 4-nov-2026, también desde el propio pase, con o sin «pasar a la siguiente», salvo que ya estuviera sin clase) y «Aplicar a todos»: las tres primeras llaman a la función inversa del servidor (`api_deshacerBaja`, `api_deshacerAlta`, `api_deshacerCancelar`) y la lista se cambia en el sitio; «Aplicar a todos» recupera los estados de antes sin llamar al servidor.
- **`LockService`** (`getScriptLock`, espera de hasta 30 s) en toda escritura, para evitar que dos monitoras se pisen.
- Datos de catálogo (grupos, estados, usuarios) cacheados con `CacheService` e invalidados al escribir.
- La capa `Repo` es la única que conoce el formato de las hojas. Así se podría migrar a otro almacenamiento sin tocar la lógica.

## 5. Modelo de datos (hojas)

Los nombres de hojas y columnas se definen **una sola vez** en `Config.gs` y se usan siempre desde ahí. No escribir nombres literales en otros archivos.

Convenciones generales:

- Los IDs y los teléfonos se guardan como **texto** (formato de columna `@`) para no perder ceros ni convertir valores.
- Las fechas se guardan como fechas reales en Sheets. Entre cliente y servidor viajan siempre como texto `yyyy-MM-dd`. La conversión se hace en `Repo.gs` con la zona horaria `Europe/Madrid`.
- Nunca se borran filas de datos: las bajas son lógicas (campo `activo` o `fecha_baja`). Única excepción, «Deshacer» (4-nov-2026): borra la fila de Inscripciones que se acaba de crear (si no tiene baja ni registros de Asistencia en el grupo desde su alta) o la de Sesiones de un «No hubo clase» (si la sesión no tiene marcas guardadas), porque de ellas no depende nada.
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
3. **Sesión pendiente**: sesión esperada, anterior a hoy, dentro de los últimos `dias_pendientes` días, sin fila en Sesiones y **con al menos un usuario inscrito ese día** (regla 1; añadido el 4-nov-2026: un grupo vacío no tiene lista que pasar). La sesión de hoy no es pendiente, aparece en «Hoy».
4. **Guardar sesión**:
   - La fecha no puede ser futura.
   - La monitora debe tener acceso al grupo (o ser admin).
   - El payload debe incluir **exactamente** a los usuarios inscritos en esa fecha: ni sobra ni falta ninguno.
   - Cada estado debe existir en la hoja Estados.
   - Se hace *upsert* en Asistencia por `clave` y en Sesiones por `fecha|grupo_id`, con estado `realizada`.
5. **Cancelar sesión**: crea o actualiza la fila de Sesiones con estado `cancelada` (la interfaz pide confirmación). Desde el 4-nov-2026 **no se borra nada**: las filas de Asistencia de esa sesión se conservan, por si se canceló por error, pero **no cuentan** en ningún cálculo de la app (historial, informe y su exportación, ficha del usuario y faltas seguidas leen de `asistenciaQueCuenta_()` en `Servicio.gs`, que las quita). Al abrir el pase de una sesión cancelada se ven esas marcas, y volver a guardar la lista la deja de nuevo como `realizada` y las hace contar otra vez. Ojo: una tabla dinámica hecha a mano sobre la hoja Asistencia sí las incluiría; hay que cruzarla con Sesiones.
6. **Usuarios**:
   - `usuario_id` único, comparado como texto y sin espacios.
   - El nombre se normaliza: mayúsculas, espacios recortados y sin dobles espacios.
   - Si se da de alta un ID que ya existe, **no se crea nada nuevo**: solo se inscribe al usuario existente.
   - **Posibles duplicados** (3-nov-2026): al crear un usuario con un ID nuevo, si ya hay otro con un nombre parecido, no se crea y se devuelve `{ parecidos: [...] }`; la app pregunta «¿Es la misma persona?» (usar el existente o «Es otra persona: crear», que repite la llamada con `crear_aunque_parecido: true`). Parecido = todas las palabras del nombre más corto (al menos dos) están en el otro, en cualquier orden, sin tildes, sin «DE», «LA»… y con una errata por palabra de 4 letras o más. Las importaciones crean igualmente y lo anotan en los avisos; «Validar datos» lista los pares parecidos que ya hay.
7. **Inscripciones**:
   - `fecha_baja ≥ fecha_alta`.
   - No puede haber dos inscripciones solapadas del mismo usuario en el mismo grupo.
   - Reinscribirse tras una baja crea una fila nueva con `fecha_alta` posterior a la baja anterior.
   - **Deshacer** (4-nov-2026): deshacer una baja quita su `fecha_baja` y su motivo (no vale para un cambio de grupo, ni si después se ha vuelto a inscribir en el grupo). Deshacer una inscripción borra su fila si no tiene baja ni registros de Asistencia en el grupo desde su alta; si el usuario se creó al inscribirlo, se queda creado. Deshacer un «No hubo clase» deja la sesión como `realizada` si tiene marcas guardadas y, si no, quita su fila de Sesiones (vuelve a estar pendiente).
   - Alta y baja admiten **fechas retroactivas**.
8. **Cambio de grupo**: baja en el grupo de origen con motivo «Cambio de grupo» y `fecha_baja` = día anterior, y alta en el destino con `fecha_alta` = fecha del cambio. Falla si ya hay inscripción activa en el destino.
9. **Permisos**: una monitora ve y modifica solo los grupos en cuya columna `monitoras` aparece su correo. El admin ve y modifica todo. Los teléfonos solo se envían al cliente para los grupos a los que la monitora tiene acceso.

## 7. Pantallas y flujos

Diseño pensado para el móvil y para uso con una mano: botones de al menos 52 px de alto, texto de al menos 17 px en los nombres, contraste alto, textos en español y mensajes de error comprensibles. Navegación sencilla (barra inferior o botón «Volver»). Indicador de carga cuando hay que esperar al servidor: el esqueleto de la pantalla o, si no hay esqueleto, la barra fina de arriba (sección 4).

**Textos en pantalla** (4-nov-2026, `PLAN-PULIDO.md` fase 1): una sesión realizada se llama **«Hecha»** y el aviso al guardarla, «Lista guardada»; cancelar se llama **«No hubo clase»** y su etiqueta, **«Sin clase»**; un día de la hoja Dias especiales sin tipo sale como «Día libre». Sin barras de género («Ya está en el grupo», «Inscripción hecha: …», no «inscrito/a») ni códigos internos (`ASI`, `X,V`): los días de un grupo se escriben «Mié y vie · 18:30» y el taller no se repite si el nombre del grupo ya empieza por él («Costura», no «Costura · Costura»). Los nombres internos de la hoja (`realizada`, `cancelada`) no cambian. Accesibilidad: zonas táctiles de al menos 48 px, texto gris `#5f6368` como mínimo (4,5:1), botones desactivados en gris sin transparencia, avisos de error con `role="alert"` y saludo «Hola, …» con el nombre, la parte del correo antes de «@» o solo «Hola».

### 7.1 Inicio
- Cabecera con el nombre de la monitora y selector de fecha (hoy por defecto), con flechas ‹ › para ir al día anterior o siguiente (› no pasa de hoy; el día anterior se precarga) (3-nov-2026). Desde el 5-nov-2026 es una pastilla blanca con chevrones SVG a los lados y la fecha escrita en medio («Hoy, jue 5 nov», «Ayer, …», «Lun 2 nov»); el campo de fecha real va encima, transparente, y al tocarlo abre el calendario (`showPicker`). El mes del Historial usa la misma pastilla.
- **Pendientes** (en rojo, arriba): lista de pares grupo y fecha sin registrar (regla 3: un grupo sin nadie inscrito ese día no sale). Agrupados por día con un subtítulo («Lun 2 nov») y, dentro, por hora; cada tarjeta, el nombre y debajo la hora (y el taller si no está en el nombre), sin cuadro de fecha (4-nov-2026). Desde el 5-nov-2026 cada tarjeta es blanca con una franja roja a la izquierda (antes, todo el fondo rosa). Un toque en la tarjeta abre ese pase de lista. Su botón **«⋮»** de 48 px (4-nov-2026; antes, un botón «No hubo clase» en la tarjeta) abre un menú con «Pasar lista» y **«No hubo clase…»**, que, sin abrir el pase, pide confirmación con motivo opcional y cancela la sesión (regla 5); la tarjeta desaparece al momento.
- **Hoy**: una sola lista **por hora** (4-nov-2026; antes, agrupada por taller), como la agenda del día; el servidor la manda ordenada (`compararPorHora_`, «9:30» antes que «10:00», sin hora al final). Cada tarjeta muestra la hora delante, el nombre, el taller solo si no está en el nombre, el nº de usuarios inscritos y el estado de la sesión (Pendiente, Hecha o Sin clase). Un grupo sin nadie inscrito dice «Sin usuarios» y no lleva «Pendiente».
- **Mis grupos**: todos los grupos activos de la monitora, plegable, para abrir cualquier fecha, con sus días y hora («Mié y vie · 18:30»).

### 7.2 Pase de lista (grupo + fecha)
- Lista de usuarios inscritos en esa fecha, **por orden alfabético**.
- Si la sesión no existe, todos empiezan como `ASI`. Si existe, se muestran los estados guardados (también si está cancelada: los que se conservan; quien no tenga marca, `ASI`).
- Barra superior: el nombre del grupo en hasta dos líneas y la fecha con mayúscula («Miércoles, 28 de octubre»; si es hoy, «Hoy · miércoles 4 nov.») (4-nov-2026). A la derecha, un **«⋮»** (4-nov-2026, `PLAN-PULIDO.md` fase 5; botón `btnMenuBarra` de `Index.html`, solo en el pase) que abre un menú con **«Aplicar un estado a todos…»**, **«Nota de la sesión»** (se escribe en un panel; si hay nota, sale arriba del pase y se cambia tocándola) y **«No hubo clase…»**.
- **Primero los nombres** (4-nov-2026): arriba solo las bandas de aviso (sesión hecha, sin clase, día libre…) y, las 2 primeras veces que se abre un pase (contador `asistencia|ayudaPase` en `localStorage`; sin él, siempre), la ayuda «Toca para marcar falta · Mantén pulsado para más».
- **Grupo sin nadie inscrito** ese día (4-nov-2026): en vez de la lista y un Guardar desactivado, un estado vacío con icono, «Este grupo no tiene a nadie inscrito el 21 oct.» (u «hoy») y el botón **«Inscribir usuarios»**, que abre Altas y bajas en la pestaña Alta (al volver, se vuelve al pase). Sin pie.
- Cada fila: nombre (sin círculo de iniciales, para que tenga sitio), estado y botón **«⋮»** de 48 px. El estado por defecto (`ASI`) se ve **solo con su icono** (hueco de 36 × 36; el lector de pantalla lo dice en el `aria-label` de la fila) y los demás, con un chip con su texto (color de la hoja Estados). Así el nombre tiene unos 225 px a 360 px de ancho (240 a 375 px) y casi todos caben en una línea (4-nov-2026). La **llamada** (`tel:`, si hay teléfono) está en el panel de «⋮», no en la fila, para que el nombre tenga sitio (4-nov-2026). Un estado distinto del de por defecto se ve más: chip relleno con el color de la hoja, tinte de la fila más marcado y franja de color a la izquierda; `ASI` queda discreto (4-nov-2026).
- **Un toque en cualquier punto de la fila** (desde el 4-nov-2026; antes, solo en el chip) alterna entre el estado por defecto (`ASI`) y el primer estado de tipo `ausente` de la hoja Estados (Falta); desde cualquier otro estado vuelve a `ASI` (3-nov-2026).
- El botón «⋮» o **mantener pulsada la fila** (medio segundo) abre un panel inferior con los estados disponibles como botones grandes y un campo de observaciones, con **textos rápidos** que se añaden con un toque (lista `obs_rapida` de la hoja Listas, editable en Gestión › Listas), el botón «Llamar» si hay teléfono y el botón **«Dar de baja de este grupo…»** (fecha y motivo; al terminar se reabre el pase conservando las marcas) (3-nov-2026).
- **Faltas seguidas** (3-nov-2026): bajo el nombre sale en rojo «N faltas seguidas» si el usuario lleva al menos `faltas_seguidas` (hoja Config, por defecto 3; editable en Gestión › Curso) registros de tipo `ausente` seguidos en ese grupo antes de esa fecha. Los `neutro` ni suman ni cortan la racha; un `presente` la corta. Lo calcula el servidor (`datosSesion_`).
- **«Aplicar a todos»** (en el menú «⋮» de la barra) para asignar un estado a todo el grupo (ej. excursión) y luego ajustar casos individuales.
- Pie fijo con contador por estado y **un solo botón**, **Guardar** (o «Guardar y seguir») (4-nov-2026). Desde el 5-nov-2026 van en una fila: los contadores, solo con icono y número (el nombre lo lee el lector de pantalla), a la izquierda y Guardar a la derecha. **No hubo clase** está en el menú «⋮» de la barra (con confirmación: «¿No hubo clase? Las marcas que haya no se borran.»). Una sesión cancelada muestra arriba «No hubo clase. Si guardas la lista, contará como clase hecha.»
- **Guardar con un toque** (4-nov-2026): el botón Guardar guarda directamente. El resumen con los contadores y la confirmación solo sale si algo se sale de lo normal (`motivosResumen`): la sesión estaba cancelada o es un día sin clase, faltan (estados de tipo `ausente`) la mitad o más de los usuarios (al menos 2), todo el grupo tiene el mismo estado distinto de `ASI` o hay observaciones nuevas. El resumen dice el motivo. Antes salía siempre, y a fuerza de verlo se acababa aceptando sin leer.
- **Siguiente pase** (3-nov-2026): si el pase se abrió desde Inicio y queda otro por hacer (el primer pendiente o, si no hay, el primer grupo del día sin lista y con alguien inscrito, 4-nov-2026), el botón del pie pasa a ser «Guardar y seguir» y abre ese pase sin volver a Inicio (4-nov-2026); el resumen, cuando sale, y el panel de cancelar ofrecen «Guardar (Cancelar) y pasar a la siguiente».
- **Borrador local**: mientras se edita se guarda un borrador en `localStorage` (clave `grupo|fecha`), que se restaura al reabrir y se borra al guardar con éxito. Si `localStorage` no está disponible, se ignora sin error.
- **Guardado en segundo plano** (3-nov-2026): al confirmar, la app vuelve (o abre el siguiente pase) sin esperar al servidor; la tarjeta del grupo muestra «Guardando…» y, al terminar, un aviso confirma. Si falla, la tarjeta muestra «Sin guardar» y un aviso explica el error; al reabrir el pase se recuperan las marcas del borrador y se vuelve a guardar. **Reintento** (4-nov-2026): cada lista enviada queda en memoria (`app.porGuardar`) hasta que el servidor la confirma. Si falló la conexión, se reenvía sola (a los 5 s, 15 s, 30 s, 1 min y luego cada 2 min), al recuperar la conexión y al volver a la app; si el servidor la rechazó (por ejemplo, ha cambiado la lista de inscritos), espera a que se abra y se revise. Mientras quede alguna, Inicio muestra arriba una banda con cada una (se abre con un toque) y el botón «Reintentar ahora». **Un solo mensaje sin conexión** (4-nov-2026, `PLAN-PULIDO.md` fase 4): mientras se reintenta sola, la banda va en tono neutro («1 lista pendiente de enviar · se enviará sola») y la tarjeta dice «Por enviar»; solo si el servidor rechaza alguna pasa a roja («Hay N listas sin guardar», con el motivo) y la tarjeta dice «Sin guardar». En Inicio no sale además aviso; en otra pantalla, un aviso neutro la primera vez («Sin conexión · la lista se enviará sola») o el de error si el servidor la rechaza. Se apunta también en `localStorage` (`asistencia|porGuardar`): si se cerró la app, al abrirla sale en ese aviso, pero no se envía sola, por si se ha corregido desde otro aparato. Cancelar la sesión la descarta. Si se intenta cerrar la app con alguna lista guardándose o sin guardar, el navegador pide confirmación. Cancelar sesión sigue esperando al servidor.

### 7.3 Gestión del grupo
Pestañas:
- **Lista**: usuarios inscritos actualmente, con su fecha de alta. Tocar a uno abre un panel con **Dar de baja**, **Cambiar de grupo** y **Llamar**, con el usuario ya elegido (mismas confirmaciones que la pestaña Baja) (3-nov-2026).
- **Alta**: buscador por ID o por nombre (sin distinguir mayúsculas ni tildes). Desde el 3-nov-2026 busca **en el móvil** mientras se escribe, sobre la lista de todos los usuarios (`api_usuariosAlta`, solo ID y nombre, sin teléfonos), que se precarga (`api_buscarUsuarios` se quitó). Si el usuario existe, se muestra su nombre y se inscribe con un toque. Si no existe, se ofrece «Crear usuario nuevo» (ID, nombre, teléfono opcional). La fecha de alta es hoy por defecto y editable. Desde el 4-nov-2026 (fase 7) el buscador va primero y la fecha después; los resultados usan la fila de persona (7.3, «Formularios»); quien ya está en el grupo lo dice bajo el nombre («ID 1420 · Ya está en el grupo»).
- **Baja**: elegir usuario, fecha de baja (hoy por defecto, editable) y motivo (lista cerrada, como opciones). Incluye la acción **Cambiar de grupo**, con cualquier grupo activo del curso como destino.
- **Formularios** (4-nov-2026, `PLAN-PULIDO.md` fase 7; piezas de `Cliente.html`): el motivo de baja, el grupo nuevo de un cambio de grupo, el tipo de día libre y cómo cuenta un estado se eligen en una **lista de opciones** (radio, filas de 52 px; `opcionesRadio`, `elegido`), no en un desplegable. Las fechas de baja, cambio de grupo y alta (también en la ficha) tienen **atajos «Hoy», «Ayer» y «Otra…»** (`campoFecha`; «Otra…» muestra el campo de fecha y abre el calendario). Teclados: ID del centro con `inputmode="numeric"`, teléfonos `type="tel"`, correo de la monitora `type="email" multiple inputmode="email"`, buscadores con `enterkeyhint="search"`. Los **errores de validación** salen en rojo bajo su campo (borde `--md-error`, texto de 15 px, `role="alert"`), la pantalla o el panel se desplaza hasta él y recibe el foco (`errorCampo`); se quitan al cambiar el campo. Los errores del servidor siguen en el aviso de abajo. **Una sola fila de persona** (`filaPersona`: iniciales de 40 px, nombre, detalle y la acción a la derecha) en la Lista, la búsqueda de Alta, Gestión › Usuarios y el aviso de posibles duplicados; el pase de lista tiene la suya, sin iniciales.
- **Respuesta en el sitio** (4-nov-2026): al hacer una baja (desde el 4-nov-2026, fase 4, sin el «¿Dar de baja?»: el aviso ofrece «Deshacer»), un cambio de grupo o una inscripción, el botón queda ocupado («Dando de baja…», «Cambiando de grupo…», «Inscribiendo…») y el panel se cierra en cuanto responde el servidor. La lista se cambia sin recargar la pantalla: la fila de quien se va (su último día es anterior a hoy) sale con una animación de 180 ms; si su último día es hoy o después, se queda con «baja dd/mm». En Alta, el botón «Inscribir» pasa a «Inscrito» en su sitio, sin perder la búsqueda, y «Crear usuario nuevo e inscribir» dice «Inscripción hecha» durante 2,5 s (`hechoEnBoton`). El subtítulo («31 inscritos») se actualiza, y la lista se vuelve a pedir en segundo plano; quien llega aparece con una animación corta. La baja desde el pase de lista quita la fila del pase del mismo modo (si su último día es anterior al del pase), conservando las marcas.

### 7.0 Navegación (3-nov-2026)
Barra inferior fija con **Inicio**, **Historial**, **Informe** y **Gestión** (esta última solo admin). Las pantallas secundarias (pase de lista, altas y bajas, formularios) ocultan la barra y tienen botón «Volver», que regresa a la pantalla de donde se vino (por ejemplo, del pase de lista abierto desde el Historial se vuelve al Historial).

Como en Android (4-nov-2026, `PLAN-PULIDO.md` fase 2; todo en `Cliente.html` y `Estilos.html`):
- **Botón y gesto atrás del móvil**: con `google.script.history` (funciona dentro del marco de Apps Script). La app añade una entrada al historial cuando hay algo a lo que volver: una pantalla que no es Inicio y, aparte, un panel abierto. Atrás cierra el panel abierto; si no hay, hace lo mismo que «Volver»; en Historial, Informe o Gestión va a Inicio; en Inicio sale de la app (si queda una entrada de sobra porque se volvió con los botones de la app, avisa antes «Pulsa atrás otra vez para salir.»). Sin `google.script.history`, no hace nada.
- **Scroll**: cada pantalla recuerda dónde se había quedado y lo recupera al volver a ella (con «Volver», con atrás o tras guardar un pase). Una pantalla nueva o una sección de la barra inferior empiezan arriba (`app.pila`, `cambiarPantalla`).
- **Transiciones**: entrar en una pantalla secundaria, desde la derecha (24 px y fundido, 200 ms); volver, al revés; cambiar de sección en la barra inferior, fundido de 150 ms. Sin movimiento si el sistema pide reducirlo.
- **Paneles inferiores**: bajan al cerrarse (200 ms) y el fondo se desvanece; el foco va al título al abrir y vuelve al botón que lo abrió al cerrar; los cierran Escape, atrás, tocar fuera y arrastrar el asa hacia abajo más de 80 px. Una confirmación dentro de un panel cambia el contenido sin parpadear.

### 7.4 Historial (hecho el 3-nov-2026)
Elegir grupo (una pastilla que abre un panel con los grupos, sus días y hora, como el taller del Informe; 5-nov-2026) y mes (‹ ›). Cuadrícula como la de los Excel antiguos: una fila por usuario inscrito algún día del mes, una columna por día con clase hasta hoy, y en cada celda la **letra** y el color del estado. Columnas de sesión cancelada («–», gris; antes «C»), sin pasar lista (rojo claro) y día sin clase (amarillo claro); «·» = no estaba inscrito. Última columna: % de asistencia del usuario en el mes; fila final: cuántos asistieron cada día. Arriba, contadores del mes. Tocar un día abre su pase de lista para corregirlo; tocar un nombre abre la ficha del usuario (admin). Al cambiar de grupo o de mes, la cabecera nueva sale al momento con la cuadrícula vacía hasta que llegan los datos (4-nov-2026). Un grupo sin nadie inscrito en el mes muestra el mismo estado vacío que el pase de lista («Sin usuarios», «Este grupo no tuvo a nadie inscrito en noviembre 2026.» y el botón **«Inscribir usuarios»**, que abre Altas y bajas en la pestaña Alta; al volver, se vuelve al Historial) (4-nov-2026).

Para leerlo en el móvil (4-nov-2026, `PLAN-PULIDO.md` fase 6): la cuadrícula se desplaza dentro de su propio marco, con un alto máximo que cabe entre la barra de arriba y la de abajo, así que la **cabecera de los días se queda fija al bajar** y la columna de nombres, al ir a los lados; columnas de día de 44 px. Los nombres van en el color normal del texto, con «›» solo para el admin (que puede abrir la ficha). Arriba, la asistencia del mes como **cifra grande** («76,2 % de asistencia en el mes») y, al lado, los contadores de sesiones. La primera vez se abre el primer grupo con usuarios en el mes (si su cuadrícula ya está en memoria) o, si no se sabe, el primero de Inicio con alguien inscrito (Hoy, por hora; luego los pendientes), no el primero por orden alfabético (`grupoInicialHistorial`).

### 7.5 Informe (hecho el 3-nov-2026)
Periodo (por defecto, del inicio de curso a hoy) y taller (o todos). El periodo es un botón («1 sep – 4 nov ▾», con el año solo si las fechas son de años distintos) que abre un panel con «Este curso», «Este trimestre» (del curso: sep–dic, ene–mar o abr–ago, sin empezar antes del curso), «Este mes» y fechas a mano («Ver estas fechas»); cambiar el periodo o el taller carga el informe al momento, sin botón «Ver informe» (4-nov-2026, `PLAN-PULIDO.md` fase 6). El taller es también un botón («Todos los talleres ▾» o el nombre, cortado con «…» si no cabe) que abre un panel con «Todos los talleres» y los talleres de sus grupos, con el elegido marcado (4-nov-2026; antes, un desplegable). Muestra: primero el % de asistencia, a todo el ancho, en grande y en verde (desde 75 %), ámbar (desde 50 %) o rojo, con una barra (5-nov-2026), y con un botón «ⓘ» que explica el cálculo en un panel; después usuarios distintos atendidos, clases hechas, sin clase y altas / bajas en una sola cifra; el % de cada tarjeta por taller y por grupo lleva el mismo color; por taller y por grupo, una **tarjeta** por fila con el nombre (y el taller si no está en él) y tres cifras grandes (sesiones, % y usuarios), que al tocarla despliega el desglose (sin clase, asistencias, faltas y otros); tablas por mes (con las columnas de texto a la izquierda); registros por estado; altas y bajas por mes; motivos de baja. Bloque (admin) **«Exportar datos»** («Descargar en PDF y hoja de cálculo») con un botón **«Exportar»** ajustado a la derecha (5-nov-2026; antes, «Crear hoja de cálculo», que dejaba la hoja en el Drive de quien despliega): abre un panel con el formato (**PDF** u **hoja de cálculo**, Excel `.xlsx`; se recuerda el último), **Descargar** (el archivo llega en base64 y se guarda en el aparato con un enlace `download`) y **Enviar por correo** (campo de correo, que se recuerda en `localStorage`, `asistencia|correoInforme`). **No se guarda nada en Drive**: el PDF se hace desde HTML (`informePdf_`, sin Drive) con Resumen, Por taller, Por grupo, Por mes, Por estado, Altas y bajas y Motivos de baja; la hoja de cálculo lleva además Detalle (un registro por fila, con el nombre del usuario) y se hace con una hoja de paso que se exporta a `.xlsx` y se borra al momento (`informeXlsx_`, `borrarArchivoDePaso_`, con el servicio avanzado de Drive v3, `Drive.Files.remove`, activado en `appsscript.json`; si no se puede borrar, a la papelera). El correo sale de la cuenta de quien despliega (`MailApp`, cupo de 100 al día en Gmail).

### 7.6 Gestión (solo admin, hecho el 3-nov-2026)
Para no tener que tocar la hoja de cálculo. Desde el 4-nov-2026 (fase 7), cada entrada lleva un icono de 24 px en un círculo; las listas de grupos (por taller), usuarios, días libres y estados son listas agrupadas (`.lista`), y para crear hay un **botón flotante** abajo a la derecha (Nuevo grupo, Nuevo usuario, Añadir día, Nuevo estado; ya no hay «+ Nuevo…» arriba).
- **Grupos y talleres**: lista por taller; crear y editar grupo (taller existente o nuevo, nombre, días con botones, hora, correo de monitora/s, activo). El `grupo_id` y el `taller_id` se generan solos a partir del nombre («Yoga silla» → `YOGA-SILLA`). Un grupo desactivado deja de salir para pasar lista, pero conserva su historial. Desde el grupo se llega a «Altas y bajas» (7.3).
- **Usuarios**: buscar por ID, nombre o teléfono; crear usuario sin grupo; ficha con datos editables (el ID no se cambia), grupos (altas y bajas), inscribir en un grupo y resumen de asistencia del curso.
- **Días libres** (antes «Días sin clase», renombrado el 4-nov-2026 para no confundirlo con «Sin clase», la sesión cancelada): en un panel desde el botón flotante, añadir un día o un intervalo (vacaciones: se apuntan solo los días en que algún grupo afectado tiene clase), tipo, descripción y grupo (o todos); lista de próximos y pasados con «Quitar».
- **Estados de asistencia**: una lista (letra con su color, nombre y cómo cuenta); tocar uno abre un panel para editar nombre, letra, color, cómo cuenta y activo; crear estados nuevos desde el botón flotante. El código interno de un estado nuevo se saca solo del nombre (`codigoEstadoNuevo`: «Excursión» → `EXC`, con un número si ya existe) y no se cambia después. `ASI` no se puede desactivar (su panel lo dice, sin la casilla).
- **Curso**: nombre, primer y último día de clase, días de pendientes y faltas seguidas para avisar (entre 2 y 20).
- **Listas**: motivos de baja («Cambio de grupo» se mantiene siempre), tipos de día libre y observaciones rápidas.

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
| `api_altaUsuario(grupo_id, datos)` | Crea el usuario si no existe e inscribe; devuelve `{ creado, nombre, inscripcion_id }`. Con un nombre parecido a otro devuelve `{ parecidos }` sin crear, salvo `datos.crear_aunque_parecido` |
| `api_baja(inscripcion_id, fecha_baja, motivo)` | Da de baja |
| `api_cambiarGrupo(inscripcion_id, grupo_destino, fecha)` | Cambio de grupo (regla 8) |
| `api_deshacerBaja(inscripcion_id)` | Quita la baja (regla 7, «Deshacer»). No sirve para un cambio de grupo |
| `api_deshacerAlta(inscripcion_id)` | Borra una inscripción recién hecha, si nada depende de ella (regla 7, «Deshacer») |
| `api_deshacerCancelar(grupo_id, fecha)` | Deshace un «No hubo clase»: `realizada` si tiene marcas; si no, vuelve a pendiente (regla 7, «Deshacer») |
| `api_historial(grupo_id, mes)` | Cuadrícula del grupo en el mes `yyyy-MM` (7.4) |
| `api_informe(desde, hasta, taller_id)` | Tablas del informe (7.5); solo grupos visibles para la monitora |
| `api_exportarInforme(desde, hasta, taller_id, formato)` | Admin. `formato`: `pdf` o `xlsx`. Devuelve el archivo del informe, `{ nombre, tipo, base64 }`, para descargarlo (7.5) |
| `api_enviarInforme(desde, hasta, taller_id, formato, correo)` | Admin. Envía el archivo del informe por correo como adjunto; devuelve `{ correo }` |
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
PLAN-PULIDO.md        ← plan por fases para que la app parezca nativa (no es parte del proyecto Apps Script)
sim/                  ← simulación para probar en el navegador (no se sube a Apps Script: .claspignore)
  build.js            ←   monta sim/index.html con el código real (node sim/build.js); index.html no se sube a git
  mock.js             ←   sustituto de google.script.run, google.script.history, SpreadsheetApp y compañía, con hojas en memoria
  datos.js            ←   datos de prueba (?e=normal, ?e=monitora, ?e=vacio)
appsscript.json       ← zona horaria Europe/Madrid, webapp (ver sección 11) y servicio avanzado de Drive v3 (para borrar la hoja de paso del informe)
Config.gs             ← constantes: nombres de hojas, columnas, valores
Main.gs               ← doGet, include(), onOpen (menú de la hoja)
Setup.gs              ← setup(): crea hojas, cabeceras, formatos, validaciones y datos de ejemplo
Auth.gs               ← identificarMonitora(), permisos por grupo
Repo.gs               ← acceso a hojas, conversión de fechas, bloqueos, caché
Servicio.gs           ← reglas de negocio
Api.gs                ← funciones api_* expuestas al cliente
Importar.gs           ← importación de usuarios desde las hojas actuales
Admin.gs              ← pestaña Gestión (grupos, usuarios, días sin clase, estados, curso, listas)
Informes.gs           ← historial por grupo y mes, informe y exportación (PDF u hoja de cálculo, descarga o correo)
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
- Despliegue actual (una copia por monitora, desde el 5-nov-2026): `executeAs: USER_DEPLOYING` y `access: ANYONE_ANONYMOUS` en `appsscript.json` («Cualquier usuario, incluso anónimo», como fisio). Se abre con cualquier cuenta o sin ninguna y **no hay login**: Google no da el correo de quien entra, así que `identificarMonitora_()` le trata como la propietaria (admin). **El enlace es la llave**: quien lo tenga ve y cambia todo, nombres y teléfonos incluidos; no debe compartirse ni publicarse. (Antes, `access: MYSELF`: solo la cuenta que desplegaba.) Si algún día las cuentas son de un dominio de Google Workspace: `access: DOMAIN`, y `Session.getActiveUser().getEmail()` devolverá el correo de cada monitora.
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
- Una sesión cancelada deja de contar sus filas de Asistencia (se conservan desde el 4-nov-2026) y se puede volver a registrar.
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
   - Si son cuentas Gmail personales, con la app ejecutándose como propietario Google no entrega el correo del visitante. Alternativas: ejecutar como el usuario que accede (obliga a compartir la hoja con cada monitora como editora) o usar un PIN por monitora. El 5-nov-2026 el dueño eligió abrirla sin login (sección 11); si hiciera falta protegerla, lo natural es un usuario y PIN como la hoja Accesos de fisio.
   - Por eso la identificación está **aislada en `Auth.gs` (`identificarMonitora_()`)**: cambiar el sistema no debe afectar al resto del código.
2. Si **«Justificada»** cuenta como `ausente` (valor por defecto) o `neutro`. Se cambia en la hoja Estados, sin tocar código.
3. Los talleres, grupos y festivos los introduce el admin desde la pestaña Gestión de la app (desde el 3-nov-2026); la hoja solo hace falta para «Configuración inicial», «Importar usuarios» y «Validar datos».

## 14. Estadísticas para la memoria (Fase 2)

Implementado en `Informes.gs` (pestaña Informe de la app y exportación en PDF u hoja de cálculo, para descargar o enviar por correo, en vez de una hoja «Informe» fija). Contenido:

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
- **4-nov-2026 — Pulido Material You** (`Estilos.html`, `Cliente.html`; solo aspecto, el servidor no cambia): fondo con un toque azul y tarjetas, bloques y tablas blancas sin borde; listas agrupadas (`.lista`: filas separadas 2 px, esquinas grandes solo arriba y abajo) en Inicio, pase de lista, Lista del grupo y Gestión; barra superior sin línea que toma color al desplazar; barra inferior y pie del pase con color de contenedor. **Chips de estado como los de la agenda de fisio**: fondo suave del color de la hoja Estados e icono delante, elegido por el `tipo` (`iconoEstado`: presente = marca, la falta = aspa, otros ausentes = calendario tachado, neutro = estrella), así un estado nuevo tiene icono sin tocar código. La fila de un usuario que no está en el estado por defecto toma un tinte muy suave; sin teléfono deja el hueco para que los chips queden en columna. Etiquetas de sesión y avisos con icono (máscaras SVG en `:root`, sin descargas), cuadro con la hora delante de cada grupo de Hoy y con el día delante de cada pendiente, faltas seguidas como insignia roja y botón Guardar relleno (el único). Probado con una simulación en tamaño móvil (Inicio, pase, panel de estados, resumen, guardar, Historial, Gestión, Lista). **Falta probarlo en Google**: `clasp push` y versión nueva de la implementación.
- **4-nov-2026** — El dueño pidió `clasp push`, commit y push del pulido anterior: hechos (commit `21a4701`).
- **4-nov-2026 — Más detalles de app nativa** (`Cliente.html`, `Estilos.html`): **nombres legibles** (`nombreVisible`: «Garcia de la Fuente Maria»; solo al mostrar, la hoja, los campos de edición y la búsqueda siguen en mayúsculas) con **círculo de iniciales** (`avatar`: primer apellido y nombre, color fijo sacado del nombre) en el pase de lista, la Lista del grupo y Gestión › Usuarios; **vibración** corta al cambiar el estado (`vibrar`, solo donde el navegador la admite; dentro de la web app de Google, que va en un marco de otro dominio, Chrome puede bloquearla sin error); **onda al pulsar** en botones, tarjetas, filas y pestañas (no si el sistema pide reducir el movimiento); **botón flotante «Inscribir»** en la Lista del grupo, que abre Alta con el buscador listo; en el **Historial**, celdas redondas (con la misma letra) y una barrita bajo el % de cada usuario (verde desde 75 %, ámbar desde 50 %, roja por debajo). Probado con la simulación en tamaño móvil. **Falta probarlo en Google**.
- **4-nov-2026 — Pase de lista tras la revisión de diseño** (`Cliente.html`, `Estilos.html`; sección 7.2): toda la fila alterna Asistido/Falta y el panel se abre con «⋮» o manteniendo pulsado; sin iniciales en el pase; los estados distintos de Asistido, más visibles; Guardar con un toque (el resumen solo en casos raros) y «Guardar y seguir»; reintento de las listas sin guardar, con aviso fijo en Inicio. Probado con una simulación en tamaño móvil (375 px): alternar tocando el nombre y el chip, «⋮» sin cambiar el estado, pulsación larga sin cambiar el estado, guardar directo y pasar al siguiente, resumen con motivo al poner a todos en Falta, sin conexión (aviso en Inicio, reenvío al volver la conexión), cerrar y abrir la app sin conexión (sale en Inicio sin enviarse; «Reintentar ahora» la guarda) y rechazo del servidor (aviso con el motivo al abrir el pase). Después, la llamada pasó de la fila al panel de «⋮»: el nombre tiene unos 173 px (antes 125) en un móvil de 375 px y ocupa como mucho 2 líneas (antes hasta 3); probado con la simulación. **Falta probarlo en Google**: sobre todo, la pulsación larga dentro del marco de la web app y que `localStorage` funcione ahí.
- **4-nov-2026 — Cancelar sin borrar** (`Servicio.gs`, `Informes.gs`, `Admin.gs`, `Cliente.html`; regla 5): cancelar una sesión ya no borra sus filas de Asistencia; dejan de contar con `asistenciaQueCuenta_()` y reaparecen al volver a guardar. Probada la lógica en Node con una simulación de las hojas (cancelar conserva las filas, historial, informe, ficha y faltas seguidas no las cuentan, el pase cancelado las muestra y volver a guardar las cuenta de nuevo). **Falta probarlo en Google.**
- **4-nov-2026 — Pulido, fase 1: pase de lista más limpio y textos** (`Cliente.html`, `Estilos.html`; secciones 7, 7.1, 7.2, 7.5 y 9; `PLAN-PULIDO.md` P9, P12, P13, P14, P19 y P25): Asistido solo con icono en el pase y «⋮» de 48 px; título del pase en dos líneas y fecha con mayúscula («Hoy · …» si es hoy); una sola terminología («Hecha», «No hubo clase» / «Sin clase», «Día libre»), sin «/a»; textos de cancelar más cortos; sin códigos internos (días «Mié y vie», sin `ASI` en Gestión › Estados, taller sin repetir); % del Informe con «ⓘ»; gris de texto `#5f6368`, botones desactivados legibles, `role="alert"` en los errores y saludo sin nombre. Se suben por primera vez `PLAN-PULIDO.md` y `sim/`. Probado en la simulación a 360 y 375 px (admin, monitora y primer uso): nombre de 224 px a 360 px y 239 a 375 px (29 de 30 y 13 de 14 nombres en una línea), alternar tocando la fila y el icono, pase de hoy y de otro día, guardar y seguir, «No hubo clase» desde el pase y desde Inicio, banda de sesión cancelada y hecha, Historial, alta, baja, cambio de grupo, Informe con «ⓘ», Gestión y aviso de error con `role="alert"`. **Falta probarlo en Google**: `clasp push` y versión nueva de la implementación.
- **4-nov-2026 — Pulido, fase 2: navegación nativa** (`Cliente.html`, `Estilos.html`, `sim/mock.js`; sección 7.0; `PLAN-PULIDO.md` P1, P2, P24 y P7): botón y gesto atrás del móvil con `google.script.history`, scroll recordado por pantalla, transiciones entre pantallas y paneles que bajan al cerrarse, con foco, Escape y arrastre del asa. La simulación tiene un sustituto de `google.script.history` (`history.pushState` y `popstate`). Probado en la simulación a 360 y 375 px (admin, monitora y primer uso): atrás cierra el panel y luego vuelve a Inicio con el scroll donde estaba; atrás desde Historial va a Inicio; en Inicio, tras volver con «Volver», sale «Pulsa atrás otra vez para salir.» y la siguiente pulsación sale de la app; Gestión › Grupos › grupo › Altas y bajas y vuelta atrás paso a paso; «Guardar y seguir» y atrás a Inicio; confirmación dentro de un panel sin parpadeo; Escape y foco de vuelta al «⋮» (también cuando la fila se vuelve a pintar); arrastrar el asa 40 px (vuelve a su sitio) y 110 px (se cierra); el panel baja en unos 200 ms; y el recorrido de regresión (dos pases seguidos, Historial y su pase, alta, baja, Informe y Gestión). **Falta probarlo en Google**: `clasp push`, versión nueva de la implementación y, en el móvil, que el botón y el gesto atrás de Android lleguen a la app dentro del marco (`setChangeHandler`) y que Chrome no se salte las entradas añadidas.
- **4-nov-2026 — Pulido, fase 3: carga, errores y progreso** (`Cliente.html`, `Estilos.html`, `Index.html`; secciones 4, 7, 7.3 y 7.4; `PLAN-PULIDO.md` P3, P8, P15 y P6): sin velo ni círculo de carga (queda la barra fina de arriba); esqueletos en Inicio, pase de lista, Historial, Informe, Gestión, Altas y bajas y ficha, solo si los datos no están en memoria (`cargarPantalla`); el Historial pinta al momento la cabecera nueva con la cuadrícula vacía; errores de carga y de `api_init` dentro de la pantalla, con «Sin conexión» o «Algo ha fallado» y «Reintentar»; botones ocupados con círculo y gerundio en toda escritura (`llamar` ocupa el botón pulsado), y bajas, cambios de grupo e inscripciones cambiadas en el sitio, con animación de salida y subtítulo al día. Una respuesta que llega tarde a otra pantalla se ignora (`app.nav`). Probado en la simulación a 360 y 375 px (admin, monitora y primer uso, respuestas de 0,6 a 2,5 s): esqueletos y que no salgan si los datos están en memoria; abrir sin conexión («Sin conexión», Reintentar sin conexión y con ella); pase desde el Historial sin conexión y Reintentar; Informe con error del servidor y Reintentar; baja desde el pase (fila fuera, panel cerrado al responder, doble toque = una sola llamada); baja con fecha anterior y de hoy, cambio de grupo y pestaña Baja en Altas y bajas; inscribir, crear e inscribir y posibles duplicados (el botón vuelve a estar libre); guardar la ficha sin esqueleto y con el scroll en su sitio; guardar un grupo y salir antes de que responda (no se vuelve a la lista); «No hubo clase» en un pendiente (una sola llamada); volver a Inicio cuando sus datos se han olvidado (el scroll se recupera tras el esqueleto); y, de la fase 2, atrás del móvil (cierra el panel y vuelve), Escape y scroll al volver. Recorrido de regresión: dos pases seguidos con «Guardar y seguir», Historial y su pase, alta, baja, Informe y Gestión. **Falta probarlo en Google**: `clasp push`, versión nueva de la implementación y, en el móvil, abrir la app sin conexión.
- **4-nov-2026 — Pulido, fase 4: avisos abajo y «Deshacer»** (`Cliente.html`, `Estilos.html`, `Servicio.gs`, `Api.gs`; secciones 4, 5, 6, 7.2, 7.3 y 8; `PLAN-PULIDO.md` P5 y P16): avisos abajo (por encima de la barra inferior, el pie, el botón flotante o el panel), de una línea, con botón de texto, que se cierran al tocarlos o deslizarlos; textos cortos sin la fecha si es hoy. «Deshacer» durante 6 s tras una baja (ya sin «¿Dar de baja?»), una inscripción, «No hubo clase» desde Inicio y «Aplicar a todos», con tres funciones nuevas en el servidor (`api_deshacerBaja`, `api_deshacerAlta`, `api_deshacerCancelar`, con permisos, `LockService` y `{ok, error}`); `api_altaUsuario` devuelve también `inscripcion_id`. Sin conexión, un solo mensaje: banda neutra «1 lista pendiente de enviar · se enviará sola» y tarjeta «Por enviar»; roja solo si el servidor la rechaza. Probado en la simulación a 360 y 375 px (admin, monitora y primer uso): «No hubo clase» en un pendiente y Deshacer (vuelve a Pendientes); baja desde la Lista (sin segunda confirmación, botón «Dando de baja…», fila fuera, subtítulo 10 → 9) y Deshacer (10 de nuevo); inscribir en Alta y Deshacer (vuelve el botón «Inscribir»); baja desde el pase con una falta marcada y Deshacer (vuelve con su falta); «Aplicar a todos» y Deshacer (vuelven los estados de antes); aviso 16 px sobre la barra inferior, el pie, el botón flotante y un panel abierto; deslizar poco (se queda) y mucho (se cierra); guardar sin conexión en Inicio (solo la banda neutra) y con «Guardar y seguir» (aviso neutro en el pase siguiente), reenvío al volver la conexión («Lista guardada · …»); rechazo del servidor (banda roja con el motivo y «Sin guardar»). Regresión: atrás cierra el panel, pases seguidos, Historial y su pase con «Volver», Informe y Gestión. **Falta probarlo en Google**: `clasp push`, versión nueva de la implementación y, en el móvil, deslizar el aviso dentro del marco y las tres funciones de deshacer con la hoja real.
- **4-nov-2026 — Pulido, fase 5: pase de lista e Inicio** (`Cliente.html`, `Estilos.html`, `Index.html`, `Servicio.gs`; secciones 6, 7.1 y 7.2; `PLAN-PULIDO.md` P10, P11, P17, P18 y P4): pie del pase con un solo botón (Guardar o «Guardar y seguir») y menú «⋮» en la barra con «Aplicar un estado a todos…», «Nota de la sesión» (en un panel) y «No hubo clase…»; arriba del pase, primero los nombres, con la ayuda en una línea solo las 2 primeras veces; Inicio por hora (Hoy, una lista sin subtítulos de taller; Pendientes, agrupados por día y sin cuadro de fecha) y «No hubo clase» de los pendientes dentro de un menú «⋮»; **regla 3 nueva**: un grupo sin nadie inscrito ese día no genera pendiente (`datosInicio_`), «Guardar y seguir» se lo salta y su pase muestra un estado vacío con «Inscribir usuarios». Probado en la simulación a 360 y 375 px (admin, monitora y primer uso): Costura ya no sale en Pendientes ni en «Guardar y seguir» (seis pases seguidos desde el primer pendiente hasta los de hoy, y vuelta a Inicio); el nombre largo de Pilates ocupa 2 líneas en los pendientes; Hoy por hora (10:00, 12:00, 17:00, 18:30); menú «⋮» del pase (nota escrita, vista arriba y guardada en el borrador; «Aplicar a todos» y su «Deshacer»; «No hubo clase» y «Sin clase y pasar a la siguiente»); ayuda solo en los 2 primeros pases (en una línea a 375 px; a 360 px, dos); pase de Costura abierto a mano (estado vacío, sin pie) e «Inscribir usuarios» y atrás de vuelta al pase; menú de un pendiente («Pasar lista», «No hubo clase» y «Deshacer», que lo devuelve a Pendientes). De las fases 2 a 4: atrás desde el pase con el scroll de Inicio recuperado, Escape cierra el panel, foco en el título del panel, esqueletos con `?delay=600`, aviso abajo 16 px sobre el pie y «Deshacer». Recorrido de regresión: pases seguidos, Historial y su pase (con «⋮») y «Volver» (sin «⋮»), baja y alta con «Deshacer», Informe y Gestión. **Falta probarlo en Google**: `clasp push`, versión nueva de la implementación y, en el móvil, el «⋮» de la barra y el menú de los pendientes.
- **4-nov-2026 — Pulido, fase 6: Historial e Informe** (`Cliente.html`, `Estilos.html`; secciones 7.4 y 7.5; `PLAN-PULIDO.md` P20 y P21): en el Historial, la cuadrícula con scroll propio (cabecera de días fija al bajar), columnas de 44 px, nombres en el color del texto con «›» solo para el admin, la asistencia del mes como cifra grande y, al abrir, un grupo con datos o el primero de Inicio (no Costura vacío). En el Informe, el periodo como botón que abre un panel (curso, trimestre, mes y fechas a mano), el taller se aplica al elegirlo, «Por taller» y «Por grupo» como tarjetas con 3 cifras y desglose al tocarlas, columnas de texto a la izquierda y botón «Crear hoja de cálculo» en una línea. Probado en la simulación a 360 y 375 px (admin, monitora y primer uso, también con `?delay=600` y `?delay=1500`): cabecera fija al desplazar la cuadrícula (y la columna de nombres al ir a los lados), columnas de 44 px, «›» y ficha solo para el admin, el Historial abre Yoga suelo o Memoria tarde (no Costura); panel del periodo («Este mes», fechas a mano, fecha final anterior a la inicial con aviso, una sola marca si curso y trimestre coinciden, atrás lo cierra), cambio de taller con esqueleto y tarjetas desplegables. De las fases 2 a 5: atrás desde el pase y desde Altas y bajas paso a paso, Escape cierra el panel, esqueletos, aviso abajo y «Deshacer» de una baja y una inscripción, «⋮» del pase e Inicio por hora. Recorrido de regresión: tres pases seguidos con «Guardar y seguir», Historial y su pase, baja y alta, Informe y Gestión. **Falta probarlo en Google**: `clasp push`, versión nueva de la implementación y, en el móvil, el scroll de la cuadrícula dentro del marco de la web app (que el dedo desplace la cuadrícula y no la página).
- **4-nov-2026 — Pulido, fase 7: formularios y coherencia** (`Cliente.html`, `Estilos.html`; secciones 7.3 y 7.6; `PLAN-PULIDO.md` P22 y P23): motivo de baja, grupo nuevo, tipo de día libre y cómo cuenta un estado como lista de opciones; fechas con «Hoy / Ayer / Otra…»; `inputmode`, `type` y `enterkeyhint`; errores de validación bajo el campo (también en Gestión, Alta, baja, cambio de grupo y las fechas a mano del Informe); una sola fila de persona con iniciales; botón flotante para crear en Grupos, Usuarios, Días libres y Estados; Gestión › Grupos por taller en listas agrupadas; iconos de 24 px en Gestión y «Listas» con las observaciones rápidas; Estados como lista con panel y código generado del nombre; Días libres (nombre nuevo) con el formulario en un panel; en Alta, buscador primero y «Inscrito» en el sitio del botón; «Marcando sin clase…» en los botones «Sin clase». Probado en la simulación a 360 y 375 px (admin y monitora, también con `?delay=600`): errores de nuevo grupo campo a campo (taller, nombre, días, correo) y crearlo; crear un estado (código `EXC`) y abrir el de Asistido (sin casilla de activo); añadir un intervalo de días libres (y el error de «hasta» anterior); lista de usuarios con iniciales y errores de nuevo usuario; baja desde la Lista con atajo «Ayer» y motivo, y «Deshacer»; cambio de grupo desde el panel (error sin grupo, confirmación, fila fuera); Alta: buscar, inscribir («Inscrito»), «Deshacer», crear e inscribir («Inscripción hecha» en el botón) y errores de ID y nombre; sin scroll lateral a 360 y 375 px. Regresión: Inicio por hora, «⋮» del pase y atrás para cerrarlo, «Guardar y seguir» y atrás a Inicio, Historial con la cabecera fija, panel del periodo del Informe (con el error de fecha final bajo el campo), Escape cierra el panel y aviso abajo sobre la barra. La vista del navegador estaba oculta: se comprobó midiendo con JavaScript, no a ojo. **Falta probarlo en Google**: `clasp push`, versión nueva de la implementación y, en el móvil, el teclado numérico del ID, el calendario de «Otra…» (`showPicker`) y el aspecto de las opciones (`:has`, que necesita Chrome 105 o posterior). Es la última fase de `PLAN-PULIDO.md`: el plan ha terminado.
- **4-nov-2026 — Taller del Informe y textos de ejemplo** (`Cliente.html`, `Estilos.html`; sección 7.5; notas de las fases 1 y 6 de `PLAN-PULIDO.md`): el taller del Informe pasa de desplegable a botón con panel (`abrirPanelTaller`, `elegirTallerInforme`), como el periodo; los textos de ejemplo de los campos (`placeholder`) tienen un gris propio más claro (`--md-placeholder`, `#80868b`) para no confundirlos con un valor escrito (siempre llevan la etiqueta encima). Probado en la simulación a 360 px: el botón del taller (52 px de alto, sin scroll lateral), el panel con los 4 talleres y «Todos», elegir Pilates (carga el informe solo de Pilates y el botón dice «Pilates»), la marca en el elegido al reabrirlo, atrás cierra el panel y el gris del ejemplo en Gestión › Usuarios › Nuevo usuario. **Falta probarlo en Google**: `clasp push` y versión nueva de la implementación.
- **4-nov-2026 — Una sola señal de carga** (`Cliente.html`; sección 4): con el esqueleto en pantalla ya no sale también la barra azul de arriba (`mostrarBarraCarga`, que también se llama desde `pintar`); la barra queda para las esperas sin esqueleto. Probado en la simulación con `?delay=1500`: el Informe sale con esqueleto y sin barra, y al guardar el curso en Gestión sale la barra. **Falta probarlo en Google**: versión nueva de la implementación.
- **4-nov-2026 — Restos del pulido** (`Servicio.gs`, `Cliente.html`; secciones 4 y 7.4; notas de las fases 1, 4, 6 y 7 de `PLAN-PULIDO.md`): el servidor ya no dice «inscrito/a» (`altaUsuario_`: «NOMBRE: ya está en el grupo en esas fechas.»; era la única barra de género en los `.gs`); en el Historial, las celdas de una sesión sin clase llevan «–» (antes «C») y la leyenda igual; un grupo vacío en el Historial muestra el estado vacío con «Inscribir usuarios» (acción `hist-inscribir`); «No hubo clase» desde el pase tiene «Deshacer» (`cancelarPase` llama a `deshacerNoHubo(c, borrador, true)`, que guarda aparte el borrador con las marcas y avisa «Clase recuperada · …»; no se ofrece si la sesión ya estaba sin clase). Probado en la simulación a 360 px: «No hubo clase» en un pase pendiente con una falta marcada (botón «Marcando sin clase…», sale de Pendientes) y «Deshacer» (vuelve a Pendientes y, al reabrirlo, conserva la falta); «Sin clase y pasar a la siguiente» y «Deshacer» (se sigue en el pase siguiente); Historial de Costura (estado vacío, «Inscribir usuarios» abre Alta y «Volver» regresa al Historial); columna sin clase de Yoga suelo en octubre con «–»; el mensaje nuevo del servidor al inscribir a alguien que ya está; regresión de pases seguidos con «Guardar y seguir», Escape y sin scroll lateral. **Falta probarlo en Google**: versión nueva de la implementación.
- **5-nov-2026 — Abrir con cualquier cuenta** (`appsscript.json`, `Auth.gs`; secciones 2, 11 y 13): `access: ANYONE_ANONYMOUS`, como fisio, sin login; quien entra sin correo conocido es la propietaria (admin), y `registrada_por` guarda el correo de la propietaria. Si Google da un correo de la hoja Monitoras, se respeta su rol. **Falta probarlo en Google**: `clasp push` y, en *Implementar › Gestionar implementaciones*, editar la implementación con una versión nueva y «Quién tiene acceso: Cualquier usuario, incluso anónimo»; abrir la URL `/exec` con otra cuenta y en una ventana de incógnito.
- **5-nov-2026 — Exportar sin Drive** (`Informes.gs`, `Api.gs`, `Cliente.html`, `sim/mock.js`; secciones 7.5, 8 y 14): el informe se descarga en el aparato o se envía por correo, en PDF u hoja de cálculo, y ya no queda en el Drive de quien despliega (`api_enviarInforme`, nueva; `api_exportarInforme` recibe el formato y devuelve el archivo). Probado en la simulación a 375 px: panel, descarga en PDF (7 tablas, sin Detalle) y en hoja de cálculo (la hoja de paso se borra), botón ocupado («Preparando el archivo…», «Enviando…»), error bajo el campo con un correo mal escrito, envío y correo y formato recordados. **Falta probarlo en Google**: `clasp push`, recargar el editor, ejecutar una vez cualquier función desde el editor para **dar los permisos nuevos** (enviar correo, conectar a servicios externos y Drive), versión nueva de la implementación y, en el móvil, que la descarga funcione dentro del marco de la web app, que el PDF se vea bien y que el `.xlsx` se abra.
- **5-nov-2026 — La hoja de paso del Excel ya no queda en la papelera** (`Informes.gs`, `appsscript.json`, `sim/mock.js`; sección 7.5): probado en Google, la exportación funcionaba pero la hoja de paso acababa en la papelera de Drive, porque la llamada directa a la API de Drive fallaba (la API no estaba activada en el proyecto). Ahora se borra con el servicio avanzado de Drive v3 (`Drive.Files.remove`), que se activa desde el manifiesto; si falla, sigue yendo a la papelera y queda anotado en el registro de ejecuciones. Probado en la simulación: se borra con `Drive.Files.remove` y, si este falla, va a la papelera. **Falta probarlo en Google**: `clasp push`, recargar el editor, ejecutar `doGet` para aceptar el permiso si lo pide, versión nueva y exportar en Excel (no debe aparecer en la papelera).
- **5-nov-2026 — Botones, fecha e Informe más actuales** (`Estilos.html`, `Cliente.html`; secciones 7.1 y 7.5): sin el azul intenso; botón normal tonal gris con letra oscura (`--md-boton`), acción principal en azul muy suave (`--md-principal-suave`), Guardar en azul pizarra (`--md-relleno`), riesgo con fondo rojo claro y cifras del Informe y del Historial en el color del texto (`--md-cifra`). Los campos marcan el foco con un borde gris azulado (`--md-foco`), sin el recuadro azul. Fecha de Inicio y mes del Historial como pastilla con chevrones SVG centrados. En el Informe, títulos de sección con icono en un cuadro tonal (`tituloInforme`) y bloque «Exportar datos» con el botón a la derecha. Probado en la simulación a 375 px: flechas de día (Ayer) y fecha elegida a mano, mes anterior en el Historial, Informe sin scroll lateral (botón Exportar de 135 px) y pase de lista. **Falta probarlo en Google**: `clasp push`, versión nueva y, en el móvil, que tocar la fecha abra el calendario.
- **5-nov-2026 — Seis retoques de interfaz** (`Estilos.html`, `Cliente.html`; secciones 7.1, 7.2, 7.4 y 7.5): grupo del Historial como pastilla con panel (`abrirPanelGrupoHistorial`; ya no hay `histGrupo`); subtítulos de lista (`h3.taller`, `h3.subtitulo-lista`) en gris oscuro; pendientes blancos con franja roja; en el Informe, el % primero, grande y con el color de su nivel (`nivelPorcentaje`, también en las tarjetas por taller y grupo) y altas / bajas en una cifra; pie del pase en una fila; barra inferior con icono relleno en la sección activa y de contorno en las demás (`iconoSeccion`). Probado en la simulación a 360 px: pendientes, Informe (80,7 % en verde, sin scroll lateral), panel de grupo del Historial (cambiar a Yoga suelo carga su cuadrícula), pie del pase en una fila de 80 px con dos contadores y «Guardar y seguir» abre el siguiente. **Falta probarlo en Google**: `clasp push` y versión nueva.
- Pendiente: renovar grupos de un trimestre o curso a otro (Fase 3). Fase 3 «Aviso de usuarios con faltas seguidas»: hecho en el pase de lista (3-nov-2026).
