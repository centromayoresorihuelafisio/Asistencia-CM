# Plan de pulido: que la app parezca una app nativa de Google

Este plan sale de la auditoría del 4-nov-2026: 25 puntos, recorriendo la app en una simulación a 360 y 375 px. Está repartido en 7 fases, y cada fase se hace en **una conversación distinta**. El dueño aprobó el plan completo el 4-nov-2026, también el punto 4, que cambia una regla del servidor.

Los números de línea son de la versión del 4-nov-2026 (commit `e3229e3`) y se habrán movido. Busca por el nombre de la función.

## Cómo se trabaja cada fase

1. Leer `CLAUDE.md` entero y la fase que toca de este documento. No adelantar trabajo de otras fases. Si aparece un problema fuera de la fase, apuntarlo en «Notas para fases siguientes», al final de este documento.
2. Hacer los cambios respetando `CLAUDE.md`:
   - sin dependencias externas;
   - solo tema claro;
   - la app va dentro del marco de Apps Script;
   - botones ≥ 52 px de alto y zonas táctiles ≥ 48 px;
   - nombres ≥ 17 px;
   - todo el estilo sale de las variables de `:root`;
   - textos en español;
   - archivos en LF.
3. Probar en la simulación (carpeta `sim/`, que no se sube a Apps Script):
   ```bash
   node sim/build.js
   ```
   ```bash
   python -m http.server 8931 --bind 127.0.0.1 --directory sim
   ```
   (el servidor, en segundo plano). Abrir `http://127.0.0.1:8931/index.html` en el navegador integrado a 360 y 375 px. Parámetros:
   - `?e=normal` (admin con datos), `?e=monitora` o `?e=vacio` (primer uso);
   - `?delay=1500`, `?offline=1` y `?error=*` o `?error=api_x`.

   En la consola, `SIM.offline`, `SIM.error` y `SIM.llamadas`. Los datos de prueba están en `sim/datos.js`: un grupo de 30 personas, uno vacío (Costura), nombres muy largos en Memoria y pendientes.

   Probar cada cambio de la fase, y además un recorrido corto de regresión: pasar lista de dos grupos seguidos, abrir el Historial, hacer un alta y una baja, ver el Informe y abrir Gestión.
4. Actualizar `CLAUDE.md`:
   - las secciones de la especificación que cambien (7.x, 4, 6, 8…);
   - una entrada nueva en la sección 16 con la fecha, los archivos tocados, lo probado y lo que falta probar en Google.

   Marcar la fase como hecha en este documento, con la fecha y el commit.
5. Subir. El dueño lo autorizó para cada fase de este plan:
   ```bash
   clasp push
   ```
   Después, `git add` de los archivos tocados, `git commit` (mensaje en español, como los anteriores) y `git push` a `main`.
6. Abrir la conversación de la fase siguiente con `start_session`:
   - `initiation: "user_asked"`, `context: "fresh"`, `use_worktree: false`;
   - título «Pulido · Fase N: …»;
   - brief: «Ejecuta la Fase N de PLAN-PULIDO.md siguiendo "Cómo se trabaja cada fase"».

   En la última fase no se abre ninguna: se avisa al dueño de que el plan ha terminado.

Si una fase no se puede terminar (algo no funciona o hace falta una decisión del dueño), no se sube nada a medias: se explica qué pasa y se pregunta.

---

## Fase 1 · Pase de lista más limpio y textos (rápidos)
**Objetivo:** lo que más se nota en el uso diario, sin tocar el servidor. Archivos: `Cliente.html` y `Estilos.html`.

Esta fase también sube por primera vez los archivos que se prepararon al hacer el plan, que todavía no están en ningún commit:
- este documento;
- `sim/`, con `mock.js`, `datos.js` y `build.js`; `sim/index.html` se genera y no se sube;
- `.gitignore`;
- la línea `sim/**` de `.claspignore`.

En la sección 9 de `CLAUDE.md`, añadir `PLAN-PULIDO.md` y `sim/`, como archivos que no forman parte del proyecto Apps Script.

- **P9 · Pase: el estado por defecto, solo con icono.**
  - Problema: «Asistido» se repite 30 veces y el chip (`.chip` con `min-width: 104px`) le quita sitio al nombre (`filaUsuario`).
  - Cambio: `ASI` se muestra solo con el icono de la marca, en un hueco de 36×36. Los demás estados siguen con el chip relleno y su texto.
  - Objetivo: unos 240 px para el nombre a 360 px, y una sola línea en la mayoría de nombres.
  - Se mantiene: el lector de pantalla tiene que decir el estado (`aria-label`), la fila mide ≥ 64 px y el toque funciona igual que ahora.
- **P12 · Título del pase.**
  - Hasta 2 líneas (`-webkit-line-clamp: 2`) en las pantallas secundarias. Ahora se corta: «Pilates mañana lunes y miérc…».
  - Subtítulo con mayúscula inicial: «Miércoles, 28 de octubre». Si es hoy: «Hoy · miércoles 4 nov.». Ajustar `fechaLarga`.
- **P13 · Una sola terminología en todas las pantallas.**
  - Sesión hecha: etiqueta «Hecha» y aviso «Lista guardada». Ahora se mezclan «Lista pasada», «Lista guardada el…» y «realizadas».
  - Cancelar: la acción se llama «No hubo clase» y la etiqueta «Sin clase». Ahora se mezclan «Sesión cancelada», «¿Marcar la sesión como cancelada?» y «Cancelada».
  - Género: fuera las barras («Inscrito/a»). Se escribe «Ya está en el grupo» o «Inscripción hecha: Ana García».
  - Revisar todos los textos de `Cliente.html`. El nombre interno `cancelada` de la hoja **no cambia**.
- **P14 · Textos que explican el funcionamiento interno: más cortos.**
  - Banda de sesión cancelada: «No hubo clase. Si guardas la lista, contará como clase hecha.»
  - Panel de cancelar: «¿No hubo clase? Las marcas que haya no se borran.»
  - Estados: sin códigos internos (ASI) en pantalla.
  - Informe: la fórmula del % pasa a un botón «ⓘ» junto a la cifra (abre el panel con la explicación).
- **P19 · Sin códigos internos a la vista.**
  - Días legibles: «Mié y vie · 18:30» en vez de «X,V» (Mis grupos y Gestión › Grupos). Usar `ORDEN_DIAS`.
  - No repetir el taller cuando coincide con el nombre del grupo: «Costura · Costura», en Inicio, Pendientes y el selector del Historial.
- **P25 · Accesibilidad básica.**
  - «⋮» de 48 px de ancho (ahora 36).
  - Gris de texto `--md-on-surface-low`: de `#80868b` a `#5f6368`, para llegar a 4,5:1 sobre el fondo.
  - Botón desactivado legible: no usar opacidad .38 sobre el botón lleno, sino los colores de desactivado de Material.
  - `role="alert"` en los avisos de error.
  - Saludo: si no hay nombre, la parte del correo antes de «@», o solo «Hola». Hacerlo en el cliente (`barra`) para no tocar `Auth.gs`.

## Fase 2 · Navegación nativa
**Objetivo:** que atrás, el scroll y las transiciones se comporten como en Android. Archivos: `Cliente.html` y `Estilos.html`.

- **P1 · Botón y gesto atrás del móvil.**
  - Ahora sale de la app.
  - Cambio: usar `google.script.history.push()` y `google.script.history.setChangeHandler()`, que funcionan dentro del marco y no son una dependencia externa. Al abrir una pantalla secundaria se añade una entrada; atrás llama a `app.alVolver()`.
  - Con un panel abierto, atrás cierra el panel.
  - En la simulación no existe `google.script.history`: añadir un sustituto en `sim/mock.js` con `history.pushState` y `popstate`. El cliente no debe romperse si no existe.
- **P2 · Conservar el scroll.** `pintar()` hace `window.scrollTo(0,0)` siempre. Guardar `scrollY` por pantalla y recuperarlo al volver (con Volver o con atrás). Solo se sube arriba al entrar desde la barra inferior o en una pantalla nueva.
- **P24 · Transiciones entre pantallas.**
  - Entrar en una pantalla secundaria: desde la derecha, 24 px y fundido, en 200 ms.
  - Volver: al revés.
  - Cambiar de pestaña en la barra inferior: fundido de 150 ms.
  - Con `prefers-reduced-motion`, sin movimiento.
  - Usar `--dur-*`.
- **P7 · Paneles inferiores.**
  - Al cerrar: hacia abajo (`translateY(100%)`) y fondo a opacidad 0, en unos 200 ms; `oculto` al terminar.
  - Foco en el título al abrir (`tabindex="-1"`) y foco de vuelta al botón que lo abrió al cerrar.
  - Escape lo cierra.
  - Arrastrar el asa hacia abajo más de 80 px lo cierra.
  - Cuidado con `abrirPanel` encadenado (confirmar dentro de un panel): no debe parpadear.

## Fase 3 · Carga, errores y progreso
**Objetivo:** que esperar al servidor no bloquee ni deje la pantalla en blanco. Archivos: `Cliente.html`, `Estilos.html` e `Index.html`.

- **P3 · Esqueletos en lugar del velo.**
  - Quitar el velo de pantalla completa y el círculo (`#cargando`) y el texto «Cargando…» de `Index.html`. Se queda la barra fina de arriba.
  - Cada vista pinta al momento su esqueleto, con brillo suave (sin animación si se pide reducir movimiento):
    - Inicio: 3 tarjetas de 64 px.
    - Pase: 8 filas.
    - Historial: la cuadrícula vacía.
    - Informe y Gestión: bloques.
  - Que siga funcionando la memoria del cliente (`pedir`): si la lectura ya está en memoria, no sale ni el esqueleto.
- **P8 · Historial al cambiar de grupo o de mes.** Ahora se ven 1,5 s los datos del grupo anterior bajo el nombre nuevo (`cargarHistorial`). Cambio: pintar al momento la cabecera nueva y el esqueleto de la cuadrícula.
- **P15 · Errores con salida.**
  - Si `api_init` falla o no hay conexión al abrir: estado de error con icono de 48 px, el título «Sin conexión» o «Algo ha fallado», una línea de qué hacer y el botón **Reintentar**.
  - Si falla la carga de una pantalla: lo mismo dentro de la vista, en vez del aviso flotante.
- **P6 · Progreso en los botones de los paneles.**
  - Ahora, tras «Sí, dar de baja», «Sí, cancelar» o «Inscribir», el panel queda abierto unos 3 s con los botones activos y se puede pulsar dos veces (`confirmar`, `accionGrupo`, `inscribir`).
  - Cambio: el botón pasa a `disabled` con un círculo de 18 px y un texto en gerundio («Dando de baja…»). El panel se cierra en cuanto responde la escritura.
  - La lista se actualiza en el sitio: la fila que se va sale con una animación de 180 ms, y la nueva aparece. El subtítulo («11 inscritos») se actualiza.

## Fase 4 · Avisos abajo y «Deshacer»
**Objetivo:** avisos como los de Android y poder deshacer en vez de confirmar dos veces. Archivos: `Cliente.html` y `Estilos.html` (y `Api.gs` o `Servicio.gs` solo si hace falta para deshacer).

- **P5 · Snackbar abajo.**
  - Posición: 16 px por encima de la barra inferior o del pie del pase. No debe tapar el botón Guardar.
  - Una línea y un botón de texto opcional. Se cierra al tocarlo o deslizándolo.
  - Textos cortos: «Lista guardada · Pilates», sin la fecha si es hoy.
  - **Deshacer** durante 6 s en:
    - baja: deshacer = quitar la `fecha_baja`;
    - inscripción;
    - «No hubo clase» desde Inicio;
    - «Aplicar a todos».

  Elegir cómo deshacer: retrasar el envío o usar una llamada inversa. Si hace falta una función de servidor nueva (por ejemplo `api_deshacerBaja`), añadirla con las mismas reglas que las demás (permisos, `LockService`, `{ok, error}`) y documentarla en la sección 8. Con «Deshacer», quitar la segunda confirmación de la baja.
- **P16 · Sin conexión: un solo mensaje.**
  - Sin aviso flotante si ya está la banda «Hay N listas sin guardar».
  - Mientras se reintenta sola, la banda va en tono neutro: «1 lista pendiente de enviar · se enviará sola».
  - Pasa a roja solo si el servidor la rechaza.

## Fase 5 · Pase de lista e Inicio
**Objetivo:** jerarquía clara en el pase y un Inicio que se lea como la agenda del día. Archivos: `Cliente.html`, `Estilos.html` y **`Servicio.gs`** (P4).

- **P10 · Pie del pase con un solo botón.**
  - Guardar (o «Guardar y seguir») ocupa todo el ancho.
  - «No hubo clase» pasa a un menú «⋮» en la barra superior del pase, que reúne también «Aplicar un estado a todos» y «Nota de la sesión».
  - El pie queda con los contadores y un solo botón.
- **P11 · Arriba del pase, primero los nombres.**
  - «Aplicar a todos» y la nota, al menú de P10.
  - La ayuda se muestra solo las 2 primeras veces (contador en `localStorage`, ignorado si no está disponible) y en una línea: «Toca para marcar falta · Mantén pulsado para más».
- **P17 · Inicio por hora.**
  - «Hoy» es una sola lista ordenada por hora, sin subtítulos de taller. El taller va en el detalle solo si no coincide con el grupo.
  - Pendientes: agrupar por día (subtítulo «Lun 2 nov»), sin el cuadro de fecha en cada tarjeta.
- **P18 · «No hubo clase» en los pendientes.** Pasa a un botón «⋮» de 48 px con un menú. La tarjeta entera abre el pase. Comprobar que el nombre largo de Pilates ya no ocupa 4 líneas.
- **P4 · Grupos sin inscritos (regla 6 nueva, aprobada).**
  - Un grupo sin nadie inscrito en esa fecha no genera pendiente (`datosInicio_` / `sesionEsperada_` en `Servicio.gs`) y se salta en `siguientePase`.
  - Si se abre a mano: estado vacío con icono, «Este grupo no tiene a nadie inscrito el 21 oct.» y el botón «Inscribir usuarios», en vez de un Guardar desactivado.
  - Documentar la regla en las secciones 6 y 7.1 de `CLAUDE.md`.

## Fase 6 · Historial e Informe
**Objetivo:** tablas legibles en el móvil. Archivos: `Cliente.html` y `Estilos.html`.

- **P20 · Historial.**
  - Cabecera de días que se quede fija al bajar: ahora el `sticky` no funciona porque está dentro de `.tabla-scroll`. Dar a `.tabla-scroll` un alto máximo con scroll vertical propio.
  - Nombres en el color normal del texto (ahora todos azules), con «›» solo para el admin.
  - Columnas de día de 44 px.
  - Al abrir, el primer grupo con datos, o el primero de Inicio. No Costura vacío por ser el primero por orden alfabético.
  - El chip «Asistencia 76,2 %», como cifra y no como algo que parece un filtro.
- **P21 · Informe.**
  - En el móvil, cada fila de «Por grupo» y «Por taller» como tarjeta: nombre arriba y 3 cifras grandes (Sesiones · % · Usuarios); el desglose, al tocarla.
  - Columnas de texto alineadas a la izquierda (ahora todas menos la primera van a la derecha).
  - El periodo, como un botón «1 sep – 4 nov ▾» que abre un panel con «Este curso», «Este mes», «Trimestre» y fechas a mano.
  - Botón de exportar con texto corto, en una línea.

## Fase 7 · Formularios y coherencia
**Objetivo:** que todas las pantallas se construyan con las mismas piezas. Archivos: `Cliente.html` y `Estilos.html`.

- **P22 · Formularios.**
  - Motivo de baja y grupo de destino: lista de opciones (radio) dentro del panel, no `<select>`.
  - Fechas con atajos «Hoy», «Ayer» y «Otra…».
  - Correo de la monitora con `type="email" inputmode="email"`; ID del centro con `inputmode="numeric"`; buscadores con `enterkeyhint="search"`.
  - Errores de validación en rojo bajo el campo (borde `--md-error`, texto de 15 px), desplazando hasta él, en vez de un aviso arriba.
- **P23 · Coherencia.**
  - Una sola fila de persona en el pase, la Lista del grupo, la búsqueda de Alta y Gestión › Usuarios: iniciales de 40 px (salvo en el pase, que las quitó a propósito el 4-nov-2026), nombre y detalle, y la acción a la derecha.
  - Botón flotante para «crear» en todas las listas: grupos, usuarios, días sin clase y estados. Fuera los «+ Nuevo…» de arriba.
  - `.lista` agrupada también en Gestión › Grupos.
  - Iconos de 24 px en las entradas de Gestión, y que «Listas» mencione las observaciones rápidas.
  - El editor de Estados, como una lista; cada estado se edita en un panel, no con 5 formularios abiertos.
  - En Alta: el buscador primero y la fecha después; y al inscribir, la respuesta en el propio botón.

---

## Estado

| Fase | Estado | Fecha | Commit |
|---|---|---|---|
| 1 · Pase de lista más limpio y textos | Hecha | 4-nov-2026 | `ef176a6` |
| 2 · Navegación nativa | Hecha | 4-nov-2026 | `022b70f` |
| 3 · Carga, errores y progreso | Hecha | 4-nov-2026 | `31059e2` |
| 4 · Avisos abajo y «Deshacer» | Hecha | 4-nov-2026 | `59a834b` |
| 5 · Pase de lista e Inicio | Hecha | 4-nov-2026 | `6abeeff` |
| 6 · Historial e Informe | Hecha | 4-nov-2026 | `d235b09` |
| 7 · Formularios y coherencia | Hecha | 4-nov-2026 | `b040022` |

## Notas para fases siguientes

(Cada fase apunta aquí lo que descubra y no le toque.)

- **Fase 1 (4-nov-2026):**
  - Si el puerto 8931 ya está ocupado (por ejemplo, un servidor de otra conversación que sirve una copia antigua), la simulación sale sin los cambios: usar otro puerto (`8932`) y comprobarlo con `fetch('index.html')`.
  - Terminología: la etiqueta de una sesión cancelada es «Sin clase», pero la entrada de Gestión que gestiona la hoja Dias especiales se sigue llamando «Días sin clase» y en Inicio y el Historial esos días salen con su tipo o como «Día libre». Valorar en la fase 7 llamar a esa entrada «Días libres (festivos, vacaciones…)».
  - En el Historial, la columna de una sesión cancelada sigue con la letra «C» (de «Cancelada»), aunque la leyenda ya dice «Sin clase» (fase 6).
  - Gestión › Estados › Nuevo estado sigue pidiendo un «Código interno»; se podría generar solo a partir del nombre (fase 7, editor de Estados).
  - Con el gris nuevo (`#5f6368`), los textos de ejemplo de los campos (`placeholder`) se parecen más a un valor escrito; si molesta, darles un gris propio (fase 7, formularios).
  - El chip de los estados distintos de Asistido sigue con `min-width: 104px`; si en la fase 5 se quiere más sitio para el nombre cuando alguien falta, bajarlo.
- **Fase 2 (4-nov-2026):**
  - Navegación: toda pantalla pasa por `pantallaPrincipal` o `pantallaSecundaria`, que deciden con `app.pila` si se entra o se vuelve (clave: vista y título); `pintar()` aplica el scroll y la transición la primera vez. Si una fase nueva pinta una pantalla sin `pintar()` (por ejemplo, los esqueletos de la fase 3), que use `pintar()` o lea `app.pantallaNueva`, o se perderán el scroll recordado y la transición.
  - Paneles: `cerrarPanel()` ya no vacía el panel al momento (baja durante 200 ms); quita los `id` de su contenido para que nadie lea sus campos. Leer los campos del panel **antes** de cerrarlo. Para saber si hay un panel abierto, `panelAbierto()`. El primer `<h3>` del panel es su título (foco y `aria-labelledby`).
  - Atrás del móvil: en la simulación funciona con `history.back()` en la consola; en Google no se ha probado si el gesto atrás de Android llega dentro del marco.
  - El pase de Costura (grupo vacío) sale como pendiente y «Guardar y seguir» lleva a él; ya está en la fase 5 (P4).
  - Historial abre Costura (vacío) por ser el primero; ya está en la fase 6 (P20).
- **Fase 3 (4-nov-2026):**
  - Carga: toda pantalla que pide datos pasa por `cargarPantalla(funcion, args, alPreparar, alPintar, reintentar, refresco)`; `alPreparar` abre la pantalla y pinta el esqueleto con `pintar(html, true)`, que hace la transición y guarda el scroll recordado para cuando lleguen los datos. Con esqueleto, `alPintar` no vuelve a llamar a `pantallaSecundaria` (solo `barra`), para no duplicar la entrada de la pila.
  - Sin velo, la pantalla se puede tocar mientras se espera: `app.nav` sube con cada cambio de pantalla y se usa para ignorar respuestas viejas; tras una escritura, `siSigue(fn)` solo vuelve a pintar si se sigue en la misma pantalla. Una pantalla nueva que pida datos debe usar `cargarPantalla` o comprobar `app.nav`.
  - Botón ocupado: `llamar()` ocupa el último botón pulsado (`botonPulsado`, lo pone el manejador de clics). Si una escritura va bien y no vuelve a pintar la pantalla ni cierra el panel, hay que llamar a `soltarBotones()` (como en `inscribir` y `avisarParecidos`). Texto en gerundio: `data-en-curso`, `EN_CURSO` o «Guardando…»; `confirmar()` lo recibe como último parámetro.
  - Los errores de las escrituras siguen saliendo en el aviso flotante de arriba: es la fase 4 (P5).
  - Si falla Inicio (por ejemplo, al cambiar de día sin conexión), la pantalla de error sustituye también al selector de fecha; se puede volver con «Reintentar» o con la barra inferior. Si molesta, dejar el selector encima del error.
  - En Alta, al inscribir, el resultado ya cambia en el sitio a «Ya está en el grupo» (parte de P23 de la fase 7). El orden buscador / fecha no se ha tocado.
  - Un pase de lista de un grupo que no está en `app.init.grupos` (por ejemplo, inactivo) se titula «Pase de lista» mientras carga y luego toma su nombre.
- **Fase 4 (4-nov-2026):**
  - Avisos: `aviso(texto, esError, accion)` sale abajo y se recoloca solo (`colocarAviso`) al cambiar el pie, la barra inferior, el panel o la pantalla (`pintar`). Para «Deshacer», `avisoDeshacer(texto, fn)`. Un aviso nuevo sustituye al anterior (y a su «Deshacer»).
  - Deshacer usa llamadas inversas en el servidor (`api_deshacerBaja`, `api_deshacerAlta`, `api_deshacerCancelar`), no un envío retrasado: si se cierra la app en esos 6 s, la acción ya está hecha.
  - En la simulación, si el panel del navegador está oculto o la pestaña no está delante (el aviso de cambios en un archivo abre otra), las transiciones no avanzan y `getBoundingClientRect` da posiciones a medio camino; comprobar `--aviso-abajo` en vez de la posición.
  - «No hubo clase» desde el propio pase no tiene «Deshacer» (no estaba en el plan); sigue con su panel de confirmación. Si se quiere, `api_deshacerCancelar` ya sirve.
  - El servidor aún dice «ya está inscrito/a en este grupo» (`altaUsuario_` en `Servicio.gs`): queda la barra de género que la fase 1 quitó del cliente.
  - Cambio de grupo sigue con su confirmación y sin «Deshacer» (no estaba en el plan).
- **Fase 5 (4-nov-2026):**
  - El «⋮» de la barra es un botón fijo de `Index.html` (`btnMenuBarra`, `data-accion="menu-pase"`); `barra()` lo oculta en cada pantalla y `pintarPase` lo vuelve a mostrar. Si otra pantalla necesita menú, que lo muestre igual y cambie su `data-accion`.
  - Los menús en panel usan `.menu-opciones` y `.opcion-menu` (filas de 56 px con icono de 24 px); sirven para la fase 7 (P23) si se quiere el mismo patrón en Gestión.
  - A 360 px la ayuda del pase («Toca para marcar falta · Mantén pulsado para más») ocupa dos líneas por unos píxeles; a 375 px, una. Se dejó que salte de línea en vez de cortarla.
  - El botón «Sin clase» del panel de un pendiente sigue diciendo «Guardando…» mientras espera (no tiene `data-en-curso`); mejor «Marcando sin clase…» (fase 7).
  - El estado vacío del pase reutiliza el aspecto de `.estado-error` (`.estado-vacio`); en la fase 6, el Historial de un grupo vacío podría usar el mismo.
- **Fase 6 (4-nov-2026):**
  - La cuadrícula del Historial se desplaza dentro de `.marco-historial` (alto máximo `100dvh - 180px`: la barra de arriba mide 64 px y la de abajo 83). Si la página está bajada hasta la leyenda, la parte de arriba del marco queda oculta bajo la barra y la cabecera fija no se ve hasta subir un poco; no se ha cambiado.
  - El Historial de un grupo vacío sigue con el texto «No hubo usuarios inscritos en este mes.», sin el estado vacío del pase; tampoco se cambió la letra «C» de las columnas sin clase (nota de la fase 1). Con un mes sin clases hechas, la cifra grande sale como «—».
  - El Informe ya no tiene botón «Ver informe»: el periodo se elige en un panel (`abrirPanelPeriodo`, filas `.opcion-menu` con `.elegida`) y el taller se aplica al cambiar el `<select>` (en la fase 7, el taller podría ser también un botón con panel, como el periodo).
  - «Por mes» sigue como tabla con scroll lateral (no estaba en P21).
- **Fase 7 (4-nov-2026):**
  - Plan terminado. Los restos de las notas anteriores se hicieron después, el mismo 4-nov-2026: el taller del Informe como botón con panel y el gris propio de los textos de ejemplo (`placeholder`, `--md-placeholder`); y luego el texto del servidor sin «inscrito/a» (`altaUsuario_`), «–» en vez de «C» en las columnas sin clase del Historial, el estado vacío en el Historial de un grupo vacío y «Deshacer» tras «No hubo clase» desde el pase.
  - Siguen como desplegable el usuario de la pestaña Baja, el taller de un grupo, «Afecta a» de los días libres, el grupo de la ficha y el del Historial (listas largas o con «+ Taller nuevo…»).
  - En la búsqueda de Alta, a 360 px, los nombres con botón «Inscribir» ocupan dos líneas (unos 146 px de ancho); se dejó así.
  - Las opciones usan `:has()` para el fondo de la elegida (Chrome 105+); sin él se ve solo el círculo marcado.
