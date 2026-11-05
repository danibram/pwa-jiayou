# Prueba de FSRS-7

La prueba aislada usa `ts-fsrs@6.0.0` con `DefaultScheduler({ version: 'FSRS-7' })` y no cambia la programación de la aplicación. `npm view ts-fsrs dist-tags` del 5 de noviembre de 2026 devuelve `6.0.0` como `latest` y `6.0.0-beta.15` como `beta`. El paquete declara `engines.node >=24` y depende de `@open-spaced-repetition/srs-kit@1.0.0`, que contiene el núcleo del scheduler.

Todo lo que sigue se comprobó el 5 de noviembre de 2026 leyendo las declaraciones y el código publicados en `node_modules` y ejecutando la prueba. Los archivos son `src/domain/learning/fsrsProbe.ts`, `tests/learning/fsrsProbe.test.ts` y `scripts/probe-fsrs-browser.mjs`.

## Configuración usada

La prueba pasa `version: 'FSRS-7'`, `desiredRetention: 0.9`, `enableFuzz: false`, `learningSteps: ['1m', '10m']` y `relearningSteps: ['10m']`. `scheduler.config` queda así:

- `weights` con 34 parámetros. Es el valor por defecto de FSRS-7, y `migrateFSRS7Parameters` rechaza cualquier otra longitud porque los pesos de FSRS-6 no se convierten.
- `desiredRetention` como `{ 1: 0.9, 2: 0.9, 3: 0.9, 4: 0.9 }`.
- `fractionalDays: true`, fijado por `DefaultScheduler` para FSRS-7. No es una opción.
- `enableShortTerm: true`, `graduatingInterval: 1`, `allowModelOverride: true`, `maximumInterval: 36500`, `clearStatsOnForget: true` y `enableFuzz: false`.

`DefaultSchedulerOptions.desiredRetention` solo acepta un número. El middleware lo guarda por calificación, con el mismo valor para las cuatro. Una retención distinta por calificación exige montar un scheduler propio con `defineScheduler` y `schedulerDesiredRetentionMiddleware`, cuyo esquema acepta `number | Record<Grade, number>`. `DefaultScheduler` usa `enableFuzz = false` por defecto. La prueba lo fija igualmente.

## La tarjeta

`newCard({ now, cardId })` y `review(...).card` devuelven objetos planos y no congelados con estos campos:

| Campo | Tipo y unidad |
| --- | --- |
| `stability` | número, días. Límites del modelo de 0,0001 a 36.500 |
| `stabilityFast` | número, días. Es la traza rápida de FSRS-7, con los mismos límites |
| `difficulty` | número de 1 a 10. Vale 0 en una tarjeta nueva |
| `state` | `State` numérico: 0 New, 1 Learning, 2 Review, 3 Relearning |
| `scheduleStatus` | texto: `'new'`, `'learning'` o `'review'` |
| `dueAt` | `Date` |
| `lastReviewAt` | `Date` o `null` en una tarjeta nueva. Tras `review` es el mismo objeto `Date` que se pasó como `now` |
| `cardId` | texto. Si se omite en `newCard`, la librería genera un UUID aleatorio |
| `reps`, `lapses` | enteros |
| `scheduledDays` | número de días con decimales, porque `fractionalDays` está activo. Diez minutos son 0,00694 |
| `learningStep` | índice entero dentro de los pasos de aprendizaje o reaprendizaje |

Una tarjeta nueva tiene `stability`, `stabilityFast`, `difficulty` y `scheduledDays` a 0, y `dueAt` igual a `now`.

`review` no copia la fecha. `card.lastReviewAt === now` y `revlog.reviewTime === now` son `true`, así que si quien llama modifica ese `Date` después cambia también la tarjeta. El adaptador tiene que guardar milisegundos, no el objeto. Las tarjetas que salen de `review` llevan además una propiedad `Symbol(parsedCardMemoryState)` no enumerable. `JSON.stringify`, el spread y `toEqual` la ignoran, y `review` acepta tarjetas sin ella.

## `state` frente a `scheduleStatus`

`state` es el estado que usa el cálculo. En `srs-kit`, `prepareParsedReview` pone a 0 los días transcurridos cuando `state` es New. En `ts-fsrs`, el middleware de pasos elige `relearningSteps` si `state` es Review o Relearning y `learningSteps` en otro caso, y `nextLearningState` pasa de New a Learning y de Review a Relearning. Los middlewares de estadísticas y de sanguijuelas cuentan un lapso cuando `state` es Review y la nota es Again.

`scheduleStatus` es una etiqueta más gruesa que los middlewares pueden ampliar. Ningún código de programación la lee. En el scheduler por defecto se escribe siempre junto a `state`. `newCard`, que también usa `forget`, pone `'new'` y New. `finalizeReview` pone `'review'` y Review. El middleware de pasos pone `'learning'` a la vez que cambia `state` a Learning o Relearning. `rollback` copia la pareja guardada en el registro. El middleware de sanguijuelas, que no forma parte del scheduler por defecto, añade `'suspended'` sin tocar `state`.

Con los middlewares por defecto, `scheduleStatus` es por tanto una función de `state`: New da `'new'`, Learning y Relearning dan `'learning'` y Review da `'review'`. El estado autoritativo es `state`. Sin embargo, `review` exige que el campo exista, porque el esquema de la tarjeta lo valida como texto conocido. Una tarjeta sin `scheduleStatus` falla con `Expected scheduleStatus string`. Una tarjeta con la pareja incoherente se acepta y produce la misma tarjeta que la coherente. La prueba crea una tarjeta el 1 de enero de 2026 a las 00:00 UTC, la responde Good en ese instante, cambia `scheduleStatus` a `'learning'` con `state` Review y la responde Good el 6 de enero a las 00:00 UTC. Las dos variantes dan `scheduledDays` 26,5359. La librería no comprueba la coherencia entre los dos campos. Las pruebas `requires scheduleStatus on the input card` e `ignores scheduleStatus when scheduling` fijan los dos comportamientos.

## Lo que devuelve `review`

`review({ card, grade, now })` devuelve `{ card, revlog }`. `card` es la tarjeta siguiente. `revlog` copia la tarjeta de antes de la revisión, es decir su memoria, `state`, `scheduleStatus`, `dueAt`, `lastReviewAt`, `scheduledDays` y `learningStep`, y añade `rating` y `reviewTime`. `rollback` usa ese registro para reconstruir la tarjeta anterior.

## Relojes que van hacia atrás

`review` lanza `SRSSchemaError: elapsedDays must be finite and non-negative` cuando `now` es anterior a `lastReviewAt`. Con `now` igual a `lastReviewAt` funciona. La prueba `rejects a review dated before the last review` lo comprueba con un minuto de diferencia. El adaptador necesita una regla para un reloj de dispositivo que retrocede. Puede usar `lastReviewAt` como fecha de la revisión o anular el evento. La librería no elige por él.

## Secuencia observada

La prueba aplica Good, Again, Good y Hard a una tarjeta nueva en fechas fijas:

| Nota y fecha (UTC) | `state` | `scheduleStatus` | `stability` | `stabilityFast` | `difficulty` | `scheduledDays` | `lapses` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Good, 1 ene 00:00 | Review | review | 3,9221 | 3,1377 | 3,5307 | 4,7777 | 0 |
| Again, 6 ene 00:00 | Relearning | learning | 1,2220 | 0,2654 | 8,7278 | 0,00694 | 1 |
| Good, 6 ene 00:15 | Review | review | 2,1415 | 11,4946 | 8,6428 | 1 | 1 |
| Hard, 9 ene 00:15 | Review | review | 3,9041 | 49,4976 | 9,1082 | 1 | 1 |

La primera respuesta Good no pasa por los pasos `1m` y `10m`. El modelo propone 4,78 días, más que `graduatingInterval`, y `allowModelOverride` vale `true` por defecto en FSRS-7, así que la tarjeta entra directamente en Review.

## Determinismo y restauración

Dentro de un mismo motor de JavaScript y con `enableFuzz: false`, la misma secuencia aplicada con dos instancias distintas del scheduler produce las mismas tarjetas. También coincide con una tercera ejecución que serializa la tarjeta a JSON y la restaura antes de cada revisión. `restoreProbeCard` solo convierte `dueAt` y `lastReviewAt` de texto a `Date`.

Entre motores, `scheduledDays` no es estable. Empaqueté con esbuild una cadena de 200 revisiones con las notas Good, Again, Good, Hard, Easy y Good en ciclo. Cada revisión llega tras entre el 60 % y el 140 % del intervalo anterior, con un mínimo de un minuto. Comparé la salida de Node 22.21.1, Node 24.22.2 y el `jsc` de JavaScriptCore del sistema:

| Comparación | `scheduledDays` distintos de 200 | `stability`, `stabilityFast`, `difficulty` y `dueAt` en ms |
| --- | --- | --- |
| Node 22 frente a Node 24 | 38 | iguales |
| Node 22 frente a JavaScriptCore | 68 | iguales |
| Node 24 frente a JavaScriptCore | 41 | iguales |

Las diferencias están en las últimas cifras. La primera revisión da 4.777721809269842 en V8 y 4.777721809269843 en JavaScriptCore. FSRS-7 redondea la memoria a 8 decimales en `next_state`, pero `next_interval` devuelve el intervalo sin redondear que sale de `Math.log`, `Math.exp` y una búsqueda iterativa. En estas 200 revisiones `dueAt` coincidió porque la diferencia es de unos 1e-7 ms y `Date` descarta la fracción de milisegundo. No hay garantía de que coincida siempre, porque un valor justo en el borde de un milisegundo podría caer a un lado distinto.

La librería nunca vuelve a leer `scheduledDays`. El siguiente cálculo usa `lastReviewAt`, `now`, la memoria, `state` y `learningStep`. El adaptador debería redondear `scheduledDays` antes de guardarlo o dejarlo fuera de cualquier comparación entre dispositivos. Una reconstrucción en otro motor puede dar otro `scheduledDays` sin que cambie nada más. Por eso la prueba de determinismo compara tarjetas normalizadas con `normalizeProbeCard`, que pasa las fechas a milisegundos y redondea `scheduledDays` a 6 decimales. También fija los valores de la primera revisión, que coinciden en los tres motores: `stability` 3.9221, `stabilityFast` 3.13768, `difficulty` 3.53072398, `dueAt` 2026-01-05T18:39:55.164Z y `scheduledDays` redondeado 4.777722.

Como `cardId` se genera al azar si falta, una reconstrucción a partir del historial tiene que pasar siempre el mismo `cardId`. Con el fuzz desactivado, la secuencia Good, Again, Good, Hard con dos `cardId` distintos da los mismos valores en todos los demás campos, pero la tarjeta guarda el `cardId` y deja de ser igual.

## Ejecuciones

Vitest, `npx vitest run tests/learning`, en Node 24.22.2, instalado con `fnm install 24`, y en Node 22.21.1, la versión por defecto del equipo:

```text
 ✓ tests/learning/fsrsProbe.test.ts  (6 tests)
 Test Files  4 passed (4)
      Tests  33 passed (33)
```

Los otros tres archivos pertenecen a otros paquetes y su número de pruebas ha cambiado mientras se escribía este documento. ts-fsrs funciona en Node 22 aunque declare `>=24`.

TypeScript, `npx tsc --noEmit`, termina con código 0 y sin errores en Node 24.22.2 y en Node 22.21.1.

Navegador, `scripts/probe-fsrs-browser.mjs` con `playwright-core` instalado fuera del proyecto y Google Chrome 157.0.8103.39 sin interfaz. El script compila una página con Vite y la sirve desde `127.0.0.1` con `Cache-Control: no-store`, para que la caché HTTP de Chrome no pueda responder a la recarga sin conexión. Un service worker de prueba precarga todos los archivos compilados. La página compara la secuencia con restauración entre pasos con la secuencia sin interrupciones, y continúa una tarjeta guardada en `localStorage` tras los dos primeros pasos. El script lo comprueba en dos momentos:

1. En línea, con la página recién cargada.
2. Sin conexión tras recargar. La respuesta de la página y la del chunk `fsrs-7-*.js` tienen que venir del service worker, y el servidor no puede recibir ninguna petición. El contador registra cada petición antes de leer el archivo, así que un 404 también cuenta.

Una revisión sin conexión en una página ya cargada no demuestra nada sobre el service worker, porque es solo cálculo, y el script ya no la hace. Con un service worker que reenvía todo a la red, la recarga falla con `net::ERR_FAILED`.

La salida con Node 24.22.2 y con Node 22.21.1 fue la misma, salvo el hash del chunk:

```text
online review: ok
offline FSRS-7 chunk from service worker: /assets/fsrs-7-DufrgJbA.js
offline reload from service worker, restore and continue: ok
server requests online: 12, offline: 0
PASS Chrome 157.0.8103.39: online and offline reload from test service worker
```

El service worker de la prueba no es el de la aplicación, que genera `vite-plugin-pwa`. No se probó la instalación como PWA ni un móvil.

## Carga del módulo y `await` de nivel superior

La primera versión del script esperaba `createFsrsProbe()` con `await` en el nivel superior del módulo de entrada y la página se quedó parada. `DefaultScheduler` carga el modelo FSRS-7 con un `import()` dinámico. Vite pone ese modelo en un chunk aparte que importa a su vez el chunk de entrada. El `fsrs-7-*.js` compilado empieza con `import ... from"./index-*.js"`, y el chunk de entrada no termina de evaluarse mientras espera ese `await`. La página nunca llega a crear el scheduler. Sin el `await` de nivel superior funciona. La aplicación tiene que crear el scheduler dentro de una función asíncrona, nunca en el nivel superior del módulo de entrada.

El ciclo lo comprobé en la compilación mínima de la sección de tamaño, no en la aplicación, que todavía no importa ts-fsrs. La solución estructural es una regla `manualChunks` en `vite.config.ts` que agrupe ts-fsrs y `@open-spaced-repetition/srs-kit`, por ejemplo `(id) => /node_modules\/(ts-fsrs|@open-spaced-repetition\/srs-kit)\//.test(id) ? 'fsrs' : undefined`. No la he aplicado. En la página mínima produce un único chunk `fsrs` de 60,07 kB (15,67 kB gzip) sin importaciones, y el chunk de entrada lo importa. Desaparecen el ciclo y la carga diferida, porque los modelos FSRS-3 a FSRS-7 acaban en ese chunk.

## Tamaño

`npx vite build` de la aplicación con Node 24.22.2 termina bien. El chunk principal `index-*.js` mide 931,38 kB (289,62 kB gzip). La aplicación todavía no importa ts-fsrs.

Para estimar el aumento compilé con Vite 5.4.21 dos páginas mínimas, sin la configuración del proyecto. Una no importa nada y otra crea un `DefaultScheduler` FSRS-7 y revisa una tarjeta. Es una estimación aislada, no una compilación de la aplicación con ts-fsrs.

| Archivo | Sin ts-fsrs | Con ts-fsrs |
| --- | --- | --- |
| Chunk de entrada | 0,74 kB (0,42 kB gzip) | 39,13 kB (12,32 kB gzip) |
| `fsrs-7-*.js`, cargado al crear el scheduler | | 6,67 kB (2,90 kB gzip) |
| `fsrs-3`, `fsrs-4`, `fsrs-4dot5` y `fsrs-5` | | 16,13 kB en total (7,39 kB gzip) |

El chunk principal de la aplicación crecería unos 38,4 kB (11,9 kB gzip), un 4 %. FSRS-6 va dentro del chunk de entrada. Los cuatro chunks de modelos antiguos no se cargan con FSRS-7, pero el patrón `**/*.{js,...}` de `workbox.globPatterns` en `vite.config` los añadiría a la precarga del service worker. El chunk de FSRS-7 tiene que estar precargado para que la primera revisión sin conexión funcione.

El código publicado usa `Object.hasOwn` en `ts-fsrs/dist/index.mjs`, en `middlewares-*.mjs` y en `srs-kit/dist/esm/schema-*.js`, y Vite lo deja tal cual en el chunk de entrada compilado. Safari y iOS lo soportan desde la versión 15.4. `vite.config.ts` no define `build.target`, así que nada lo transforma para navegadores más antiguos.

Fuentes primarias: [paquete publicado en npm](https://www.npmjs.com/package/ts-fsrs/v/6.0.0), [repositorio oficial](https://github.com/open-spaced-repetition/ts-fsrs) y el código publicado en `node_modules/ts-fsrs/dist` y `node_modules/@open-spaced-repetition/srs-kit/dist/esm`.
