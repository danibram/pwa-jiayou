# Sistema de aprendizaje

Este documento coordinó la implementación por fases. Todas las pantallas usan ya el registro de eventos, y el sistema de progreso anterior se ha retirado.

## Estado

| Fase | Estado |
| --- | --- |
| 0 | Entregada. Contratos, prueba de FSRS-7 en Node y Chrome sin conexión, e identidad del contenido |
| 1 | Entregada. Planificador FSRS-7 con reconstrucción desde eventos, evaluador versionado y evidencia por habilidad |
| 2 | Entregada. Repositorio IndexedDB atómico e idempotente con bloqueo entre pestañas, copias por unión de eventos y registro permanente de IDs publicados |
| 3 | Entregada. Constructor de sesiones común, selector de ejercicios sin preguntas ambiguas y simulaciones de varios días |
| 4 | Entregada. Controlador de sesión, componentes de estudio, ajustes y resumen. El vocabulario dejó el planificador antiguo |
| 5 | Entregada. Enseñanza con "Ya la sé", peldaños de práctica, respuestas escritas con política de pinyin versionada y Trazos sobre el registro |
| 6 | Pendiente. Necesita varias semanas de eventos reales |
| 7A | Entregada. Limpieza descrita abajo |
| 7B y 7C | En curso. Validación de la PWA en el navegador y auditoría de pérdida de datos, evaluación y carga |

## Desviaciones del plan

- En Trazos no se ofrece "Ya la sé". Un carácter siempre se ve y se calca antes de escribirlo de memoria.
- Un carácter fuera del catálogo HSK, fuera de los niveles elegidos o sin descargar solo muestra sus trazos. No entra en ninguna sesión, porque su glosa sale de la palabra que lo usa y no tiene una revisión c1 estable.
- No existe `src/domain/learning/introduction/`. La enseñanza vive en el constructor de sesiones (`sessions/requeue.ts`) y en el selector de ejercicios (`exposureCard`).
- La copia combinada de la fase 4, con eventos de vocabulario y progreso v4 de caracteres, duró hasta la fase 5C. Ahora se exporta solo el registro de eventos. Las copias v4 y combinadas se siguen leyendo, pero su progreso antiguo no se importa y la pantalla lo avisa.
- Las sesiones guardadas empezaron siendo una sola para toda la app. En 7A pasó a haber una por modo, para que abrir Trazos no borre una sesión de palabras en pausa.
- La rúbrica de escritura cita las versiones de `hanzi-writer` y `hanzi-writer-data` (`STROKE_RUBRIC_REVISION`), fijadas con versión exacta en `package.json`. Un test comprueba que coinciden con las instaladas.
- Las frases con hueco para partículas y clasificadores siguen pendientes hasta que exista contexto editorial.
- Al arrancar, la app borra las claves de localStorage que dejó el sistema anterior (progreso v4 y sesiones guardadas). Sus datos no se migran.
- "Ya la sé" se ofrecía sobre la lección completa, con la respuesta a la vista. En 7A pasó a ofrecerse antes de mostrarla, solo en la primera enseñanza y con un tope diario.
- La misma sesión abierta en dos pestañas podía calificar dos veces una tarjeta. Desde 7A la respuesta lleva el estado sobre el que se decidió. Si otra pestaña lo cambió, no se escribe y la pestaña toma la sesión guardada o evalúa de nuevo. Una sesión guardada tampoco retrocede salvo al deshacer, y borrar el progreso en otra pestaña detiene la sesión abierta.
- El evaluador pasó a `learning-evaluator@3`: una autoevaluación solo vale después de descubrir la respuesta. Los eventos `@1` y `@2` se siguen aceptando sin esa comprobación.
- Se retiró la comprobación de caracteres "probablemente conocidos" del constructor de sesiones. Ninguna lista la activaba.
- Al reanudar, una tarjeta escrita con una política de respuestas que ya no existe se genera de nuevo en vez de quedar sin corrección posible.
- Las simulaciones de la fase 3 encontraron dos fallos, ya corregidos. Los temas dejaban repasos esperando y el día de 25 horas permitía calificar dos veces.

## Decisiones del producto

- La aplicación calcula y guarda todo el aprendizaje localmente, sin backend.
- El nuevo modelo comienza sin importar el progreso v4. El reinicio de desarrollo será explícito cuando conectemos la nueva persistencia.
- Cada palabra tiene una planificación principal para recordar su significado desde los caracteres sin opciones.
- Producción, escucha, tonos y contexto aportan evidencia y refuerzo. No crean seis tarjetas por palabra.
- La escritura conserva una entidad por carácter y no acredita el conocimiento de las palabras que lo contienen.
- La retención objetivo inicial es 0,9. La versión del paquete, el modelo y sus parámetros deben quedar fijados.
- El primer intento, las ayudas y los errores técnicos forman parte de la evaluación.
- Los eventos distinguen exposición, práctica, repaso programado y anulación.
- IndexedDB guardará respuesta, estado y avance de sesión en una transacción. Las preferencias pueden seguir en localStorage.
- Los identificadores publicados son permanentes. La revisión del contenido describe qué se preguntó.

## Decisiones de arquitectura

Estas decisiones se tomaron al revisar la fase 0 y condicionan todas las fases siguientes.

1. El registro de eventos es la fuente de verdad. El estado FSRS y los agregados por habilidad son cachés que se reconstruyen por elemento repitiendo sus eventos vigentes en orden determinista. Deshacer añade un evento `attempt-voided` y reconstruye ese elemento.
2. La nota FSRS de una palabra solo sale de un ejercicio. La app muestra los caracteres, el alumno recuerda el significado sin opciones, descubre la respuesta y se autoevalúa. Las preguntas de opciones, las de escucha y las inversas son práctica y aportan evidencia. El tiempo de respuesta no decide la nota.
3. La configuración del planificador se guarda una vez y los estados y eventos la citan por `configId`.
4. Importar una copia une los eventos por ID y reconstruye los elementos afectados. Así se conserva la fusión entre dispositivos que ya ofrece la app. Restaurar sustituyendo todo es una acción aparte y explícita. La fusión exige que `enableFuzz` siga desactivado.
5. Los presupuestos y la pantalla Hoy usan la misma regla de inicio del día que la app actual. Los vencimientos FSRS son instantes absolutos.
6. Cada intento guarda `contentRevision`, calculada por entrada desde una representación canónica versionada. La fase 0 entrega una versión provisional calculada en el cliente. La fase 2 la convierte en un dato publicado.

## Decisiones de estudio

Se tomaron tras la revisión de la fase 0 y sustituyen el comportamiento actual donde difiere.

1. Una palabra enseñada y acertada en práctica sin una pista que dé la respuesta queda pendiente para el día local siguiente. En escritura cuenta como ayuda cualquier pista. La primera tarjeta de significado de ese día da su primera nota FSRS. Si falla la práctica, se vuelve a enseñar en la misma sesión y sigue sin nota.
2. Desaparece "Descartar y salir". Al salir se conserva lo respondido. Las correcciones se hacen deshaciendo respuestas concretas.
3. Una palabra es floja si tiene un fallo programado en los últimos 30 días y todavía no tiene dos aciertos programados seguidos después. La sesión Flojos es práctica. Una palabra está dominada con estabilidad FSRS de 21 días o más. El límite de carga de mañana se mantiene. Cuenta los vencimientos FSRS de las 24 horas siguientes y las palabras enseñadas hoy cuya primera nota llega mañana. El resumen de la sesión muestra esa misma cifra como "Mañana". Cada evento guarda el modo de sesión para que estas reglas se reconstruyan igual en cualquier dispositivo.
4. La primera enseñanza de una palabra muestra primero solo los caracteres, con "Ya la sé" y "Enséñamela". "Enséñamela" abre la lección completa. "Ya la sé" lleva a una tarjeta de significado sin opciones sin haber mostrado la respuesta. Un acierto cuenta como primera nota Bien y un fallo devuelve la palabra al camino normal. Es la única nota que se permite sin la espera del punto 1, porque la palabra no se acaba de enseñar. No se ofrece al volver a enseñar una palabra ni pasadas 10 respuestas "Ya la sé" en el día local (`STUDY_RULES.alreadyKnownPerDay`).
5. El presupuesto de palabras nuevas cuenta presentaciones, no primeras notas.
6. Tras "Otra vez", la palabra vuelve cuatro tarjetas después como práctica. FSRS recibe la siguiente nota cuando vence el paso de reaprendizaje, en esa sesión si sigue abierta o en la siguiente. El resumen no la muestra pendiente hasta que vence.
7. Para partículas y clasificadores, la tarjeta de significado pregunta su función y la respuesta es la glosa editorial, con autoevaluación. La fase 5 añade frases con hueco cuando exista contexto editorial.
8. En escritura de memoria, cero errores es Bien. Uno o dos errores es Difícil con recuerdo correcto. Tres o más errores, o una pista, es Otra vez. El intento guarda el número de errores.
9. La práctica de una palabra retira ayudas por peldaños. El peldaño 0 es reconocer el significado entre opciones. El 1 es elegir la palabra entre opciones desde la glosa o el audio. El 2 es recordarla sin opciones y autoevaluarse. El 3 es escribir el pinyin, los caracteres o el significado, y la app lo corrige. El peldaño sale de la evidencia del elemento y no se guarda. Cada acierto autónomo sube un peldaño, un acierto tras una pista que da la respuesta lo mantiene y cualquier otro resultado lo baja. Justo después de enseñar, la práctica no pasa del peldaño 1. Si un formato no se puede construir, se prueban los peldaños inferiores, después los de opciones y por último la tarjeta de significado. Las respuestas escritas son siempre práctica y nunca dan nota FSRS.

## Fase 0. Contratos y prueba técnica

| Paquete | Entrega | Alcance |
| --- | --- | --- |
| 0A | [Contratos](learning/contracts.md) y `src/domain/learning/types.ts` | Entidades, eventos, evaluación, sesión, copia y papel de cada ejercicio existente |
| 0B | [Prueba FSRS](learning/fsrs-probe.md) y prueba ejecutable | Paquete real, Node 24, navegador sin conexión, serialización y repetición determinista |
| 0C | [Identidad del contenido](learning/content-identity.md) y `src/domain/learning/content/` | IDs, revisión por entrada, retiradas y preguntas ambiguas |

La prueba técnica debe comprobar el artefacto publicado. La documentación web por sí sola no confirma que una versión o API esté disponible en npm. Cualquier diferencia se registra antes de fijar el adaptador.

Las decisiones de producto que la revisión dejó abiertas están en la sección "Decisiones pendientes" de los [contratos](learning/contracts.md). Se resuelven antes de abrir la fase 1.

La prueba de Chrome necesita `playwright-core` fuera del repositorio y no corre en CI. La fase 7B la convierte en una prueba de navegador repetible. La fase termina cuando la prueba FSRS-7 pasa en Chrome sin conexión, los tests de `tests/learning` y la comprobación de tipos pasan con Node 24, y los contratos representan las seis modalidades actuales.

## Fases de implementación

### Fase 1. Dominio

Depende de la fase 0.

| Paquete | Archivos propios | Trabajo y aceptación |
| --- | --- | --- |
| 1A | `src/domain/learning/scheduler/` | Crear, evaluar y restaurar estados FSRS con reloj explícito. Reconstruir un elemento desde sus eventos y obtener el mismo estado que la aplicación incremental |
| 1B | `src/domain/learning/evaluation/` y `src/domain/learning/evidence/` | Evaluar primer intento, ayudas y anulación; Hard exige recuerdo correcto. Registrar evidencia por habilidad sin alterar la planificación |

Evaluación y evidencia comparten tipos y casos de prueba, por eso van en un mismo encargo. 1B es dueño de `evaluatorVersion` y de cuándo cambia. 1A publica primero su interfaz, porque la fase 2 la necesita para reconstruir elementos. El scheduler se crea al iniciar la app y `review` es síncrono, así que nunca se espera a una promesa dentro de una transacción de IndexedDB. El dominio no importa componentes, almacenamiento ni el reloj global. El evaluador devuelve una unión discriminada que indica si puede actualizarse FSRS. Los tests cubren fallo seguido de acierto, pistas, audio fallido, pregunta ambigua, práctica complementaria y anulación de un repaso intermedio.

### Fase 2. Persistencia y contenido

Depende de la fase 0 y de la interfaz publicada por 1A. Puede avanzar en paralelo con el resto de la fase 1.

| Paquete | Archivos propios | Trabajo y aceptación |
| --- | --- | --- |
| 2A | `src/persistence/learning/` | Registro de eventos e índices en IndexedDB, cachés derivadas, idempotencia y bloqueo entre pestañas |
| 2B | `src/domain/learning/backup/` | Exportar, fusionar por unión de eventos y restaurar sustituyendo. Una copia inválida no modifica nada |
| 2C | `editor/`, `scripts/published-ids.mjs`, `scripts/content-publish.mjs` y `tests/vocabularyData.test.ts` | Registro de IDs con HSK y Extra, retiradas, revisión por entrada publicada y test de IDs aplicado solo a candidatos nuevos |

La misma transacción añade el evento y actualiza la caché del elemento y la posición de la sesión. Cerrar conserva respuestas confirmadas. Las escrituras de aprendizaje pasan por `navigator.locks`, y un `BroadcastChannel` avisa a las otras pestañas para que recarguen el estado. Las pruebas de interrupción, repetición y dos pestañas viven en `tests/learning/persistence/` y las escribe el responsable de 2A. El coordinador conecta la inicialización y controla el reinicio explícito del progreso de desarrollo.

### Fase 3. Sesiones y ejercicios

Depende de las fases 1 y 2.

| Paquete | Archivos propios | Trabajo y aceptación |
| --- | --- | --- |
| 3A | `src/domain/learning/sessions/` | Presupuesto de trabajo, pendientes, nuevas y repetición acotada |
| 3B | `src/domain/learning/exercises/` | Formatos, disponibilidad de audio, opciones equivalentes y ambigüedad |
| 3C | `tests/learning/simulations/` | Estudio regular, ausencias, carga acumulada y listas pequeñas. Empieza cuando 3A publique su interfaz |

Hoy, Temas, Flojos y la práctica individual comparten política. Los pasos cortos respetan su hora; los repasos de días usan la regla de inicio del día fijada en la fase 0. Diez palabras nuevas no cuentan como diez ejercicios. Un tema no desplaza los pendientes para introducir nuevas. Las opciones auditivas no presentan homófonos como respuestas excluyentes sin contexto.

### Fase 4. Sesión utilizable y retirada del planificador antiguo

Depende de la fase 3.

| Paquete | Archivos propios | Trabajo y aceptación |
| --- | --- | --- |
| 4A | `src/stores/learningSessionStore.ts` | Presentar, responder, guardar, pausar, reanudar y deshacer |
| 4B | `src/components/learning/` | Ejercicios, ayudas, autoevaluación y feedback; no calcula notas ni intervalos |
| 4C | Componentes acordados de ajustes y resumen | Presupuesto configurable, resultados y próximos repasos |

El coordinador es dueño de VocabularyReview, Home, navegación, `ProgressBackup.tsx` y `vite.config.ts`. Hasta la fase 5C la copia de seguridad de la interfaz exporta e importa las dos partes: eventos de vocabulario y progreso v4 de caracteres. En `vite.config.ts` una regla `manualChunks` agrupa `ts-fsrs` y `@open-spaced-repetition/srs-kit`, y la precarga incluye el chunk de FSRS-7. Al conectar la sesión nueva, el coordinador retira la planificación, las sesiones y los contadores antiguos del vocabulario. Las funciones de caracteres siguen en uso hasta la fase 5. No hay usuarios que migrar, así que no conviven dos planificadores de vocabulario. La fase termina con una sesión completa offline y con reanudación después de un error de almacenamiento, provocado en los tests mediante un repositorio falso que falla en la escritura elegida. Los intentos parciales y las pistas sobreviven a la recarga.

### Fase 5. Enseñanza y habilidades

Depende de la fase 4.

| Paquete | Archivos propios | Trabajo y aceptación |
| --- | --- | --- |
| 5A | `src/domain/learning/introduction/` y componentes asignados | Enseñar, retirar ayudas y comprobar "Ya la sé" sin inventar respuestas anteriores |
| 5B | Evaluadores y componentes asignados de producción y escucha | Definir y versionar la política de pinyin (números, marcas, `ü`/`v`, tono neutro, sandhi), aceptar equivalencias y utilizar contexto editorial |
| 5C | Trazos y adaptador de escritura | Registrar pistas explícitas y automáticas, separar ejecución de recuerdo y retirar la planificación antigua de caracteres |

En Trazos, ver el orden de los trazos es la exposición de enseñanza, calcar es práctica y solo escribir de memoria da nota. La acción `drawing` guarda los errores que contó `hanzi-writer`. "Pista" y "Contorno" se guardan como pistas que revelan la respuesta, y también el trazo que el lienzo muestra por sí solo tras varios fallos. Al escribir de memoria el lienzo espera al tercer fallo en un trazo para mostrarlo, así que dos errores en el mismo trazo siguen dando Difícil. La copia de seguridad solo lleva el registro de eventos. Una copia v4 o combinada se sigue leyendo, pero su progreso antiguo no se importa y un aviso lo dice.

Cada resultado identifica qué habilidad comprueba. La escritura no modifica el estado de una palabra. El contenido sin una respuesta evaluable queda como práctica o autoevaluación. No se añade evaluación automática de pronunciación en esta fase.

### Fase 6. Refuerzo y métricas

Depende de la fase 5 y de varias semanas de eventos reales. Antes de eso solo hace falta que los eventos se guarden completos.

| Paquete | Archivos propios | Trabajo y aceptación |
| --- | --- | --- |
| 6A | `src/domain/learning/confusions/` | Considerar oportunidades, errores, habilidad y fechas; comprobar resolución diferida |
| 6B | `src/domain/learning/metrics/` | Retención por habilidad, esfuerzo, carga y calibración de FSRS |
| 6C | `src/components/learning/progress/` | Historial por palabra, evidencia y motivos de selección |

Las métricas separan primer intento de corrección, práctica de repaso, respuesta asistida de autónoma y recuerdo inmediato de diferido. Cada indicador se puede rastrear hasta eventos. No se entrena FSRS personalmente sin datos suficientes y una evaluación comparativa.

### Fase 7. Integración final

Depende de las fases anteriores.

| Paquete | Trabajo |
| --- | --- |
| 7A | Retirar el código antiguo que quede, incluidos `progressStore`, `vocabularyProgressStore` y la fusión v4, sin eliminar funciones compartidas de caracteres. Entregado. Además de esos módulos se retiraron el código que dejaron sin uso, las claves antiguas de localStorage y las citas a archivos borrados en los contratos |
| 7B | Probar PWA offline, actualizaciones con sesión pendiente, reinicio, audio, paquetes no descargados y contenido retirado |
| 7C | Auditar pérdida de datos, evaluación y carga de estudio con pruebas dirigidas, incluidos cambio de día y horario de verano |

El coordinador controla stores existentes, dependencias y configuración. La entrega exige tipos, compilación, tests del dominio, integración y pruebas de navegador. No puede haber dos fuentes de verdad para el mismo aprendizaje.

## Coordinación de subagentes

Un coordinador integra el trabajo de hasta tres subagentes. Cada encargo identifica objetivo, dependencias, archivos propios, archivos de solo lectura, casos de aceptación y verificación. Los contratos compartidos cambian a través del coordinador. Un paquete pequeño que comparte tipos con otro se agrupa con él en vez de repartirse.

Los subagentes aplican las instrucciones de escritura de `unslop` y no modifican trabajo ajeno. Una entrega enumera resultados comprobados y limitaciones; no presenta pruebas pendientes como aprobadas. El coordinador inspecciona los cambios y ejecuta las comprobaciones de integración antes de cerrar una fase.
