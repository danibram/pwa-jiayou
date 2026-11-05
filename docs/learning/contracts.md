# Contratos de aprendizaje

Los tipos de `apps/web/src/domain/learning/types.ts` describen el dominio. No implementan evaluación, persistencia ni FSRS. Todos los tiempos son milisegundos desde Unix y los aporta quien llama. El esquema nuevo usa `schemaVersion: 1` y no define migraciones desde v4.

## Elementos y contenido

Cada palabra tiene un único elemento `word-meaning`. Su pregunta principal muestra los caracteres y pide recordar el significado sin opciones. Producción, escucha, tonos y contexto aportan evidencia, sin crear otras tarjetas programadas para esa palabra. La escritura tiene un elemento `character-writing` por carácter, aunque el carácter aparezca en varias palabras. Una palabra de un carácter y el ejercicio de escritura de ese carácter son elementos distintos.

El identificador del elemento sale del `contentId` y todos los dispositivos lo calculan igual. Una palabra es `word-meaning:` seguido de su `id` publicado, por ejemplo `word-meaning:word-4f60-597d-ni3-hao3`. Un carácter es `character-writing:` seguido de su `contentId`, que `packages/content/src/revision.ts` escribe como `char-` y el código del carácter en hexadecimal, por ejemplo `character-writing:char-4f60`. El tipo `ItemId` recoge las dos formas.

`contentId` conserva la identidad publicada. `contentRevision` identifica la revisión inmutable que se mostró. El intento también guarda `evaluatorVersion`, que identifica las reglas de evaluación y normalización. Corregir una lectura o un significado conserva el identificador y cambia la revisión. El historial conserva ambas versiones. La política para invalidar intentos afectados por un cambio editorial queda pendiente.

## Registro de eventos y cachés

El registro de eventos es la fuente de verdad. `SchedulerState` es una caché derivada que se puede tirar y reconstruir para un elemento a partir de sus eventos. `SkillAggregate` no se guarda: se calcula cuando se necesita a partir de la evidencia de los eventos no anulados.

Para reconstruir el estado FSRS de un elemento, el consumidor toma sus eventos `scheduled-review`, descarta los que tenga como objetivo algún `attempt-voided` y aplica todos los restantes en este orden: `occurredAt`, después `deviceId`, después `sequence` y por último `id`, todos ascendentes. `REPLAY_ORDER` recoge ese orden. Los números se comparan como números. Las cadenas se comparan por unidades de código con `<`, nunca con `localeCompare`, porque el resultado de `localeCompare` depende del idioma y del motor. Cada revisión se aplica con la configuración de su propio `configId`. La reconstrucción aplica todas las revisiones vigentes, también las que, tras fusionar dos dispositivos, ya no habrían vencido en la historia combinada. FSRS trata esas revisiones como repasos anticipados.

El instante de cada revisión es `occurredAt`. `ts-fsrs` lanza un error si el instante es anterior a `lastReviewAt` y acepta que sea igual. Para que la aplicación incremental y la reconstrucción coincidan, quien escribe un `scheduled-review` usa como `occurredAt` el mayor entre el reloj del dispositivo y el `lastReviewAt` de la caché del elemento. La reconstrucción también usa el mayor entre `occurredAt` y el `lastReviewAt` acumulado. Con los eventos ordenados no debería hacer falta, y solo protege contra registros escritos fuera de esta regla.

`sequence` es un contador por dispositivo que se guarda y nunca retrocede ni se repite, aunque cambien la transacción o la sesión. Desempata dos eventos del mismo dispositivo con el mismo milisegundo. Al arrancar y después de restaurar sustituyendo todo, el dispositivo fija el contador en el mayor valor entre el guardado y la `sequence` más alta de sus propios eventos en el registro. Así una copia restaurada no hace repetir números ya usados. El reinicio de desarrollo borra el registro y el contador, así que antes de borrar da al dispositivo un `deviceId` nuevo. Con el anterior, fusionar después una copia vieja juntaría dos eventos con el mismo `deviceId` y la misma `sequence`. `deviceId` identifica una instalación. Un reloj mal ajustado puede ordenar mal eventos de dos dispositivos. El contrato lo acepta, porque el orden sigue siendo el mismo en todos los dispositivos que tengan los mismos eventos.

El `id` de un evento de intento se genera cuando se abre el intento y se guarda en `SessionAttempt.eventId`. Si la escritura se repite, reutiliza ese `id` y el registro no lo aplica dos veces. Cada intento produce como máximo un evento `practice`, `scheduled-review` o `invalid-attempt`. Dos eventos de intento con el mismo `attemptId` y distinto `id` no pueden salir de este flujo, así que un registro o una copia que los contenga está corrupto. La comprobación recorre todos los eventos, anulados o no: anular uno de los dos no arregla el duplicado.

Deshacer una respuesta añade un `attempt-voided` con el `targetEventId` exacto y el `itemId` del objetivo, y después reconstruye ese elemento. La anulación no borra el evento original ni afecta a otros intentos. Puede apuntar a `practice`, `scheduled-review` o `invalid-attempt`, nunca a una exposición ni a otra anulación. Anular dos veces el mismo evento tiene el mismo efecto que anularlo una vez. No existe la anulación de una anulación. Para rehacer una respuesta se registra un intento nuevo.

## Ejercicios existentes

La única tarea que produce una nota FSRS para un elemento `word-meaning` muestra los caracteres. El alumno recuerda el significado sin opciones, descubre la respuesta y se autoevalúa. La autoevaluación da `again`, `hard` o `good`. `easy` es opcional y solo sale de una autoevaluación explícita. El tiempo de respuesta nunca decide la nota. Las acciones `reveal` y `self-assessment` guardan su instante para las métricas, nada más.

Desde `learning-evaluator@3`, una autoevaluación solo cuenta si antes se descubrió la respuesta, y `validateAttemptEvent` rechaza el evento que no lo cumple. Los eventos `@1` y `@2` no se comprueban así, porque la app nunca dejó calificar sin descubrir.

Los tipos solo imponen una parte de estas reglas. `hard`, `good` y `easy` exigen `outcome: 'correct'`, y `again` acepta cualquier evaluación válida. Los tipos no comparan las acciones con la nota. Un `scheduled-review` con las acciones "respuesta incorrecta, pista, respuesta correcta", evaluación `correct` y nota `good` compila. Las reglas de que el primer error deja `again` y de que una pista que revela la respuesta deja `again` las aplica el evaluador de la fase 1B. La importación de copias vuelve a comprobarlas y rechaza la copia si no se cumplen. `Hint.revealsAnswer` dice si una pista da la respuesta. Lo fija quien construye el ejercicio: la longitud que añade `askGloss` (`apps/web/src/domain/learning/exercises/glosses.ts`) no la revela, y el pinyin en una tarjeta de escucha sí.

La tabla resume qué mostraba cada una de las seis preguntas de la pantalla de repaso del sistema anterior y qué papel tienen en el modelo nuevo. `EXERCISE_ROLES` en `types.ts` contiene la misma tabla con esos nombres (`LegacyPrompt`), y `apps/web/tests/learning/contracts.test.ts` comprueba que cubre exactamente las seis.

| Pregunta | Qué mostraba y cómo se respondía en el sistema anterior | Papel | Habilidad | Formato |
| --- | --- | --- | --- | --- |
| `meaning` | Los caracteres y "¿Qué significa esta palabra?". El alumno pulsa "Mostrar respuesta" y elige Otra vez, Difícil o Bien | Repaso programado si el elemento es elegible; si no, práctica | `meaning` | Recuerdo libre, autoevaluado |
| `reverse` | La glosa en español y un botón de audio que pronuncia la palabra. "¿Cómo se escribe…?", mostrar respuesta y autoevaluación | Práctica | `production` | Recuerdo libre, autoevaluado |
| `listen` | Solo el audio, que suena al empezar, y "¿Qué palabra es?". Mostrar respuesta y autoevaluación | Práctica | `listening` | Recuerdo libre, autoevaluado |
| `pick` | La glosa en español y tres o cuatro palabras en caracteres. Acertar a la primera da Bien, tras un fallo Difícil, tras dos fallos o "No lo sé" Otra vez | Práctica | `production` | Opciones, corrección automática |
| `hear` | El audio y tres o cuatro palabras en caracteres, con la misma corrección que `pick` | Práctica | `listening` | Opciones, corrección automática |
| `recognize` | Los caracteres y tres o cuatro significados, con la misma corrección que `pick` | Práctica | `meaning` | Opciones, corrección automática |

El papel "repaso programado" indica que la tarea puede programar. El consumidor decide con la caché del elemento y el modo de la sesión, y la escritura lleva la caché que leyó (`basedOn` en `commitAnswer`). Si dentro de la transacción la caché guardada ya es otra, porque otra pestaña respondió, no se escribe nada y el repositorio devuelve `stale-state`. La sesión recarga y vuelve a decidir. Una respuesta de práctica puede dejar la caché igual, así que la escritura también lleva la posición de la sesión en la que se respondió (`sessionPosition`). Si la sesión guardada con ese id está en otra posición, es que otra pestaña ya respondió esa tarjeta. Entonces tampoco se escribe nada, el repositorio devuelve `stale-state` y la pestaña toma la sesión guardada sin repetir la respuesta. Escribe `scheduled-review` con `basis: 'due'` si el elemento es elegible y el modo programa según `SESSION_MODE_RATES`. En cualquier otro caso escribe `practice`. Todos los modos programan salvo Flojos, que siempre es práctica. Las notas automáticas de `pick`, `hear` y `recognize` pasan a ser evaluaciones de práctica y no se traducen en una nota FSRS.

Un elemento con revisiones FSRS es elegible con la misma regla que lo muestra como pendiente en Hoy (ver "Inicio del día"). Las dos definiciones coinciden a propósito: una tarjeta que la app presenta como pendiente tiene que poder actualizar FSRS. Una palabra sin revisiones sigue la regla de `eligibleFrom` descrita en "Decisiones de estudio". La única excepción es la tarjeta de "Ya la sé", que escribe `basis: 'already-known'`.

El modelo nuevo cambió varios comportamientos del sistema anterior:

- La primera respuesta de una palabra nueva en una tarjeta de recuerdo programaba la palabra aunque no venciera. Esas tarjetas eran `pick` o `recognize`, y ahora son práctica. La primera nota FSRS llega al día siguiente con una tarjeta `meaning`.
- Flojos programaba las palabras flojas que vencían. Ahora Flojos es solo práctica.
- Existía "Descartar y salir", que deshacía la sesión entera. Ya no existe.
- La práctica programaba cuando la palabra vencía o estaba floja. Ahora una palabra floja que no vence registra práctica.
- Un fallo en práctica adelantaba el vencimiento a mañana, en palabras y en caracteres. Ahora la práctica nunca cambia `dueAt`.

La sesión tiene otras interacciones que no son preguntas de la tabla. El paso de enseñanza muestra caracteres, pinyin, significado y audio, y se registra como `exposure` con una `ExposureCard` de motivo `teaching`. Cuando se puede decir "Ya la sé", la tarjeta muestra primero solo los caracteres. "Ya la sé" (`knowIt` en `apps/web/src/stores/learningSessionStore.ts`) se registra como exposición con motivo `already-known`, seguida de una tarjeta `meaning`. Una exposición no tiene rúbrica ni corrección, porque no se responde. En Trazos (`apps/web/src/pages/Trazos.tsx`), escribir de memoria es un `scheduled-review` de un elemento `character-writing`, con habilidad `writing`, formato `writing` y corrección automática por número de errores. Ver el orden de los trazos es la exposición de enseñanza y calcar es práctica. "Saltar" cierra el calcado sin dibujo con una acción `drawing` de 0 errores y resultado `unanswered`. Cuenta como práctica fallida: no cambia ninguna fecha y el carácter se vuelve a enseñar antes de su primera nota. Escribir de memoria no se puede saltar.

## Evaluación y evidencia

Una evaluación distingue `correct`, `partial`, `incorrect`, `unanswered` e `invalid`. Una respuesta parcial enumera lo que falta. Un error técnico, una pregunta ambigua o un contenido que cambió producen `invalid`, y el intento se guarda como `invalid-attempt`, sin nota. `invalid` solo aparece en ese evento y en las acciones del intento. La evaluación de `practice` y la de `SkillEvidence` solo aceptan evaluaciones válidas, de modo que un intento inválido no tiene dos representaciones.

`SkillEvidence` describe una observación concreta dentro de su evento. No repite el elemento, el contenido ni el intento, porque son los del evento que la contiene. Un evento de intento tiene un único `itemId`, y por eso una anulación con un solo `itemId` alcanza toda su evidencia.

En una tarea programada elegible, el primer error produce `again`, aunque un reintento posterior termine bien. En el intento principal elegible, una respuesta parcial o una pista que revela la respuesta produce `again`. Las opciones múltiples, las correcciones y las repeticiones didácticas se registran como práctica.

Por ejemplo, si el alumno elige una opción equivocada, pide una pista y luego acierta, `actions` conserva las tres acciones en ese orden y guarda el identificador de la opción elegida. Si una pregunta exige dos sentidos y el alumno recuerda uno, `partial` enumera el sentido ausente. Si una pregunta contiene un error técnico, `invalid-attempt` conserva el intento sin nota. Si el error se descubre después de programar, `attempt-voided` apunta al evento afectado.

## Eventos y sesiones

Los eventos distinguen exposición, práctica, repaso programado, intento inválido y anulación. El identificador del evento es su clave de idempotencia. Un nuevo intento de reaprendizaje elegible puede actualizar FSRS en la misma sesión.

La práctica y los intentos inválidos no contienen nota ni `configId`. Un reintento de práctica registra evidencia y no cambia FSRS.

Cada evento guarda `sessionMode`, el flujo que lo escribió: `today` (Hoy), `more-words` (Más palabras), `topic` (un tema), `weak` (Flojos), `review-all` (Repasar todo), `word` (una palabra desde su ficha) y `strokes` (Trazos). Las reglas de palabras flojas, dominadas y carga se reconstruyen igual en cualquier dispositivo porque no dependen de en qué pantalla se mira el registro.

`SessionState` conserva la cola con el ejercicio completo, su contenido y la versión del evaluador. También conserva las opciones, el contexto, el audio, la respuesta que se descubre y las acciones ordenadas para reanudar sin regenerar la pregunta. `Exercise.answer` guarda caracteres, pinyin y significado tal como los mostró la tarjeta, para que una recarga no los reconstruya desde un contenido más nuevo. El audio actual es la síntesis de voz del dispositivo (`speakWord` en `apps/web/src/utils/speech.ts`). No hay grabación ni revisión, así que `Exercise.audio` guarda el texto en caracteres y en pinyin que se pidió pronunciar. La referencia inmutable a la rúbrica debe resolver las respuestas aceptadas o los criterios usados por el evaluador.

Al reanudar una sesión, el consumidor compara el `contentRevision` de cada intento abierto con la revisión actual de su contenido. Si difieren y el intento ya tiene acciones, lo cierra como `invalid-attempt` con motivo `content-changed` y regenera la tarjeta. Si difieren y el intento no tiene acciones, regenera la tarjeta sin escribir ningún evento. El estado de sesión no sustituye el historial de eventos y no viaja en las copias.

## FSRS

El contrato identifica el modelo FSRS-7 de `ts-fsrs` 6.0.0 y conserva sus parámetros y opciones. `parameters` debe tener exactamente 34 valores, los que FSRS-7 espera, y el adaptador rechaza cualquier otra longitud. `learningSteps` y `relearningSteps` usan el formato `StepUnit` de `ts-fsrs`: un número seguido de `m`, `h` o `d`. La biblioteca no acepta segundos.

El adaptador traduce `SchedulerConfig` a `DefaultSchedulerOptions` así:

- `parameters` pasa a `weights`.
- `maximumIntervalDays` pasa a `maximumInterval`.
- `modelVersion` pasa a `version`.
- `desiredRetention`, `enableFuzz`, `enableShortTerm`, `learningSteps`, `relearningSteps`, `graduatingInterval`, `clearStatsOnForget` y `allowModelOverride` pasan con el mismo nombre.
- `algorithm`, `packageVersion` y `fractionalDays` no se pasan. Identifican la configuración y forman parte de su `configId`. `DefaultScheduler` siempre activa los días fraccionarios con FSRS-7, y por eso el tipo fija `fractionalDays: true`.

La configuración se guarda una vez como `StoredSchedulerConfig`. Su `configId` es `scheduler-config:sha256:` seguido del SHA-256 en hexadecimal del JSON canónico de la configuración, con las claves ordenadas y sin valores `undefined`. La calcula `canonicalJson` en `apps/web/src/domain/learning/scheduler/configId.ts`, la misma forma canónica que usaba el sistema anterior para comparar registros al fusionar copias. Dos dispositivos con la misma configuración obtienen el mismo identificador. `SchedulerState` y cada `scheduled-review` guardan solo el `configId`. El `configId` de `SchedulerState` es el de la última revisión aplicada, o el de la configuración actual si el elemento es nuevo.

Una configuración cuyo `packageVersion` no coincide con el paquete instalado se rechaza al importarla, y la reconstrucción se detiene si la encuentra en el registro. La misma configuración con otra versión de `ts-fsrs` puede dar otros resultados. Actualizar `ts-fsrs` es una decisión explícita: se crea una configuración nueva y se reconstruyen todos los elementos con ella.

`SchedulerState` guarda la tarjeta completa que hace falta para restaurarla: `dueAt`, `lastReviewAt`, `stability`, `stabilityFast`, `difficulty`, `scheduledDays`, `reps`, `lapses` y `learningStep`. Los nombres coinciden con `DefaultSchedulerCard` de `ts-fsrs` y las fechas son milisegundos. El adaptador usa `itemId` como `cardId`. `dueAt` y `lastReviewAt` se guardan como milisegundos desde Unix. La prueba entre motores mostró que `scheduledDays` difiere en los últimos decimales entre versiones de V8 y JavaScriptCore, mientras `stability`, `difficulty` y `dueAt` coinciden. El adaptador redondea `scheduledDays` a 6 decimales, igual que `normalizeProbeCard` en `apps/web/src/domain/learning/fsrsProbe.ts`, comprobado en Node 22, Node 24 y JavaScriptCore. Ningún código usa `scheduledDays` para comparar igualdad.

El único estado guardado es `state`, que corresponde a `State` de la biblioteca: `new` es 0, `learning` 1, `review` 2 y `relearning` 3. La tarjeta de la biblioteca también lleva `scheduleStatus`, pero con los middlewares de `DefaultScheduler` siempre se escribe junto a `state` y depende de él: `new` da `new`, `learning` y `relearning` dan `learning`, y `review` da `review`. El adaptador lo calcula al restaurar. El middleware de sanguijuelas, que añade `suspended`, no forma parte del planificador predeterminado. Si se activa, `SchedulerState` necesitará un campo propio para ese estado.

`enableFuzz` queda fijado en `false`. Con el fuzz activo, el middleware de `ts-fsrs` toma la semilla de `cardId` y `reps`, y la ruta antigua usa `Date.now()` si no recibe semilla. Ni el generador ni la fórmula de la semilla forman parte de `SchedulerConfig`. Con el fuzz activo, el resultado de una reconstrucción dependería de detalles internos del paquete y no solo de los eventos y la configuración.

## Copias y varios dispositivos

El sistema anterior fusionaba copias de dos dispositivos registro a registro, y ganaba la escritura más reciente. El modelo nuevo conserva la fusión con `LearningBackup`, que lleva `schemaVersion`, `exportedAt`, `deviceId`, `events` y `configs`. `planMerge` en `apps/web/src/domain/learning/backup/plan.ts` la planifica y `importEvents` del repositorio (`apps/web/src/persistence/learning/repository.ts`) la escribe.

Importar una copia une los eventos por `id`. Un evento que ya existe con el mismo contenido se ignora. La importación rechaza la copia entera, sin aplicar la regla de la última escritura, en cualquiera de estos casos:

- Un evento existe con el mismo `id` y contenido distinto.
- Dos eventos de intento comparten `attemptId` con distinto `id`.
- Una configuración no produce su propio `configId`, o su `packageVersion` no es la instalada.
- Un `scheduled-review` cita un `configId` que no aparece en ninguna de las dos partes.
- Un `attempt-voided` apunta a un evento que no está en la unión, a un tipo que no se puede anular, o lleva un `itemId` distinto del de su objetivo. Cada copia contiene el registro completo de su dispositivo, así que un objetivo ausente indica una copia dañada.
- Las acciones de un `scheduled-review` contradicen su nota según las reglas del evaluador.

Las configuraciones se unen por `configId`. Después de la unión, el consumidor reconstruye cada elemento que tenga algún evento nuevo, incluido el `itemId` de cada anulación nueva. Una copia rechazada no modifica nada.

La unión es conmutativa e idempotente, porque solo añade eventos y el orden de repetición no depende de qué copia llegó primero. Si dos dispositivos repasaron la misma palabra sin conexión, las dos revisiones quedan en el registro y la reconstrucción las aplica por orden de `occurredAt`. El vencimiento resultante puede diferir del que mostraba cada dispositivo antes de fusionar, y eso es correcto.

Restaurar sustituyendo todo es una acción aparte y explícita. Borra el registro local y sus cachés, escribe los eventos y configuraciones de la copia, ajusta el contador `sequence` y reconstruye todos los elementos.

## Inicio del día

El sistema anterior usaba el día del calendario local del dispositivo, que empieza a medianoche local. Lo nombraba con `toLocaleDateString('sv-SE')` y buscaba sus límites con `setHours`. Los contadores diarios de palabras nuevas se reiniciaban al cambiar de día, y una palabra contaba como pendiente hoy si vencía antes de la próxima medianoche local. `deviceLocalDayRule` en `apps/web/src/domain/learning/scheduler/localDay.ts` conserva esa regla.

Los contratos nuevos adoptan la misma regla para los presupuestos, la pantalla Hoy y la elegibilidad para programar. `pendingToday` en `apps/web/src/domain/learning/scheduler/rules.ts` aplica las condiciones de pendiente:

- Cada evento guarda `localDay`, calculado al escribirlo con `deviceLocalDayRule.localDay`. Los presupuestos diarios cuentan los eventos cuyo `localDay` coincide con el día local actual. Cambiar de zona horaria no mueve eventos ya escritos de un día a otro.
- Un elemento en estado `review` está pendiente hoy, y es elegible, si `dueAt` es anterior a la próxima medianoche local y su `lastReviewAt` cae en un día local anterior a hoy. El día del cambio de horario de otoño dura 25 horas, y un intervalo de un día puede vencer antes de su medianoche; sin la segunda condición, la misma palabra recibiría dos notas ese día.
- Un elemento en `learning` o `relearning` está pendiente, y es elegible, cuando `dueAt` es menor o igual que el instante actual, porque sus pasos cortos respetan su hora.
- El día anterior se obtiene restando un día al calendario local, no 24 horas.

Los vencimientos FSRS siguen siendo instantes absolutos. La regla del día solo decide qué entra en Hoy, qué puede programar y qué cuenta en los presupuestos.

## Decisiones de estudio

El apartado "Decisiones de estudio" de `docs/learning-system.md` fija estas reglas. Esta sección dice cómo las representan los contratos.

**Primera nota de una palabra nueva.** Una palabra sin revisiones FSRS tiene `state: 'new'` y `eligibleFrom`. La reconstrucción busca la primera exposición `teaching` no anulada y, después de ella, la primera respuesta `practice` no anulada con resultado `correct` cuya evidencia no está marcada `assisted` (`passesPractice`). Una pista que da la respuesta antes de contestar, o cualquier pista en escritura, deja la práctica sin valor para esta regla. Si esa respuesta tiene `localDay` D, `eligibleFrom` es D más un día de calendario y la palabra está pendiente desde ese día. Mientras no exista, `eligibleFrom` es `null`. La primera tarjeta `meaning` de un día igual o posterior escribe su primer `scheduled-review`. Si la práctica falla, la sesión vuelve a enseñar la palabra con otra exposición y la palabra sigue sin nota. `eligibleFromEvents` en `apps/web/src/domain/learning/scheduler/rebuild.ts` calcula `eligibleFrom`. El sistema anterior, en cambio, programaba la palabra en el acto con la primera respuesta de recuerdo.

**"Ya la sé".** Solo se ofrece en la primera enseñanza de una palabra (`reason: 'new'`), antes de mostrar la respuesta, y hasta `STUDY_RULES.alreadyKnownPerDay` veces por día local, contadas por las exposiciones `already-known` de ese `localDay`. Registra una exposición `already-known` y muestra en el acto una tarjeta `meaning` sin opciones. Un acierto escribe `scheduled-review` con `basis: 'already-known'`, nota `good` y evaluación `correct`. Los tipos no permiten otra nota con esa base. Un fallo escribe `practice` y la palabra sigue el camino de una palabra nueva. Es la única nota que no espera al día siguiente. Sustituye al "Ya la sé" del sistema anterior, que daba cinco días de intervalo sin preguntar.

**Salir de una sesión.** Desaparece "Descartar y salir". Al salir se conserva todo lo respondido. Una corrección anula un intento concreto con `attempt-voided`. No hay anulación por sesión.

**Flojas, dominadas y carga de mañana.** Las reglas están en `STUDY_RULES` y se calculan desde los eventos en `apps/web/src/domain/learning/scheduler/rules.ts`, nunca se guardan:

- Una palabra está floja si tiene un `scheduled-review` con nota `again` cuyo `localDay` cae en los últimos 30 días locales y no le siguen dos `scheduled-review` seguidos con nota distinta de `again`. Lo calcula `isWeak` y sustituye a la regla de flojas del sistema anterior.
- La sesión Flojos (`sessionMode: 'weak'`) solo escribe práctica, así que repasar flojas no las recupera. Solo las recuperan los repasos programados.
- Una palabra está dominada si su `stability` es de 21 días o más (`isMastered`). El sistema anterior miraba si el intervalo llegaba a 21 días.
- El límite de carga de mañana sigue en 60, como en el sistema anterior (`STUDY_RULES.tomorrowLoadLimit`). `tomorrowLoad` cuenta los elementos con `dueAt` entre el instante actual y 24 horas después, y los elementos nuevos cuyo `eligibleFrom` es mañana. Los vencidos y los nuevos ya elegibles son trabajo de hoy y no cuentan. El sistema anterior contaba hasta el final del día siguiente. El "Mañana" del resumen de sesión no usa esta ventana, que se mueve con la hora y daba cifras distintas en dos resúmenes del mismo día. Usa `pendingTomorrow`, lo que Hoy tendrá pendiente al final del día siguiente si no se estudia más hoy, incluido lo que quede de hoy.

**Presupuesto de palabras nuevas.** Cuenta presentaciones: los elementos distintos cuya primera exposición `teaching` tiene el `localDay` de hoy. Volver a enseñar una palabra tras fallar la práctica no gasta presupuesto otra vez. Una exposición `already-known` no lo gasta, igual que en el sistema anterior "Ya la sé" no gastaba palabras nuevas. El contador anterior subía con la primera nota.

**Después de "Otra vez".** La palabra vuelve `requeueGap` tarjetas después, cuatro como en el sistema anterior (`STUDY_RULES.requeueGap`, aplicado por `requeueAfterAgain` en `apps/web/src/domain/learning/sessions/requeue.ts`). Esa respuesta es práctica, porque el paso de reaprendizaje todavía no ha vencido. FSRS recibe la siguiente nota cuando vence el paso, dentro de la misma sesión si sigue abierta o en la siguiente. El resumen y Hoy no muestran la palabra como pendiente hasta que `dueAt` llega.

**Partículas y clasificadores.** Su tarjeta `meaning` pregunta qué función cumple la palabra. La respuesta que se descubre, `Exercise.answer.meaning`, es la glosa editorial, y el alumno se autoevalúa. `isFunctionWord` en `apps/web/src/domain/learning/exercises/ambiguity.ts` los reconoce. El sistema anterior los mandaba a `recognize`. Las frases con hueco siguen pendientes hasta que exista contexto editorial.

**Escritura de memoria.** La acción `drawing` guarda el número de errores que contó el corrector de trazos. Cero errores es `good`. Uno o dos errores es `hard` con evaluación `correct`. Tres o más errores, o cualquier pista, es `again`. `WRITING_FROM_MEMORY` recoge los umbrales. Coincide con la nota del sistema anterior salvo por las pistas, que entonces no contaban.
