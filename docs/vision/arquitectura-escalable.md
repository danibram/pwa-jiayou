# Arquitectura para crecer hacia API, cuentas y sincronización

Fecha: 3 de noviembre de 2026. Revisión hecha sobre el commit `f21b01c`; todas las referencias `archivo:línea` apuntan a ese commit. La PR #8 ya tocó `src/pages/Vocabulario.tsx`, así que las líneas de ese archivo pueden haberse movido.

El objetivo es que el salto a una API con cuentas y sincronización entre dispositivos sea barato, sin reescribir la app. Este informe respeta lo ya decidido en otros documentos:

- La app funciona sin red y sin cuenta. Ningún modo nuevo necesita red ni cuenta (`docs/vision/strategy.md:333`), y el offline es un requisito de producto (`docs/specs/functional-specifications.md:12`).
- La sincronización entre dispositivos está anotada como futura (`docs/specs/functional-specifications.md:570` y `:597`).
- El reto por enlace con semilla, `?duelo=semilla&nivel=4`, ya está diseñado (`docs/vision/strategy.md:239`). Es el primer caso real de URL con estado.
- No hay usuarios todavía, así que los cambios de formato en localStorage no necesitan migración.

## Resumen

1. La app ya es local-first. Conviene mantenerlo. La sincronización debe llegar como una fusión en segundo plano sobre el estado local, nunca como una dependencia de red para estudiar.
2. Los identificadores son estables y derivados del contenido (carácter por glifo, palabra por `wordId`). Eso está bien y no debe cambiar. Falta congelarlos con un test.
3. El bloqueo real para sincronizar es que varias operaciones sustituyen el progreso entero: `checkpoint` y `rollback` al descartar una sesión, importar copia, recuperar y borrar. Con dos dispositivos, un `rollback` borraría lo que llegó del otro.
4. A cada registro de progreso le falta un `updatedAt`. `lastSeen` no sirve para eso.
5. Para resolver conflictos recomiendo last-write-wins por registro (un carácter o una palabra), con un `deviceId` de desempate. CRDT y last-write-wins por campo cuestan más y, en el segundo caso, rompen la coherencia del repaso espaciado.
6. Diez módulos leen o escriben localStorage por su cuenta. Una capa de persistencia síncrona con claves centralizadas es la primera PR y no cambia comportamiento.
7. El contenido está empaquetado de forma desigual. Las seis listas de vocabulario y el índice de búsqueda van en el JS, los caracteres 2 a 6 van en packs. La caché de packs se invalida entera con cualquier cambio de audio.
8. El `api/` en Bun es una herramienta editorial que escribe en el repo. Sirve para lo que hace y debe seguir separada de la futura API de usuarios, compartiendo tipos y `wordId`.
9. La navegación sin router aguanta. Le falta traducir `Screen` a URL y de vuelta, algo que cabe junto a `parseScreen`.
10. El plan tiene tres fases. Primero refactors sin cambio de comportamiento, después preparar el modelo de datos sin servidor, y la API cuando exista.

## 1. Mapa actual

### Capas que existen de verdad

| Capa | Archivos | Qué hace |
| --- | --- | --- |
| Arranque | `src/index.tsx` | Analítica, tema, `render` de `App` y avisos globales |
| Navegación | `src/screen.ts`, `src/createScreenHistory.ts`, `src/App.tsx` | Unión `Screen`, historial del navegador y reglas de "volver" |
| Páginas | `src/pages/*.tsx` | Pantallas. Algunas construyen sesiones y deciden reglas de repaso |
| Componentes | `src/components/*.tsx` | UI reutilizable. `ProgressBackup.tsx` también coordina importar y descartar sesiones |
| Stores | `src/stores/*.ts` | Estado reactivo de Solid y, a la vez, persistencia en localStorage |
| Dominio puro | `src/domain/progress/*.ts`, `src/domain/vocabulary/sessionDeck.ts` | Calendario de repaso, parseo del progreso, armado de mazos |
| Contenido | `src/data/*.ts` y JSON, `public/packs/`, `public/audio/`, `public/strokes/` | Vocabulario, caracteres, glosas, temas, packs por nivel |
| Utilidades con estado | `src/utils/levelPacks.ts`, `src/utils/vocabularySession.ts`, `src/utils/sessionStore.ts` | Descargas, Cache Storage y sesiones guardadas |

### Quién depende de quién

```
index.tsx ─► App.tsx ─► pages ─► stores ─► domain
                │          │        │
                │          │        └─► data (JSON estático)
                │          ├─► utils/vocabularySession ─► localStorage
                │          └─► localStorage (Home.tsx)
                └─► utils/levelPacks ─► stores (los muta) ─► Cache Storage

Dependencias al revés:
  domain/progress/schedule.ts ─► stores/progressStore      (tipo Grade)
  data/lists.ts               ─► stores/myWordsStore       (data depende de store)
  utils/sessionStore.ts, utils/vocabularySession.ts ─► stores/progressStore (GRADES)
```

### Lo que está bien y no hay que tocar

- `schedule` es una función pura con `now` como parámetro (`src/domain/progress/schedule.ts:7`). Es la pieza que permite reproducir y fusionar progreso sin efectos.
- Todo lo que entra desde almacenamiento o historial se parsea como dato no confiable: `parseProgress` (`src/domain/progress/serialization.ts:60`), `parseScreen` (`src/screen.ts:48`), `parseData` de Mis palabras (`src/stores/myWordsStore.ts:112`), `parseCharacterList` (`src/stores/characterStore.ts:115`). Las respuestas de una API necesitarán exactamente esto.
- `importBackup` escribe en disco antes de tocar la memoria, así que un fallo deja todo como estaba (`src/stores/progressStore.ts:160-167`).
- Los fallos de almacenamiento se muestran al usuario con salida (exportar, reintentar, recuperar) en vez de perder datos en silencio (`src/components/ProgressBackup.tsx:27-58`).
- `tests/setup.ts:4-13` ya define un `Storage` en memoria. Es el adaptador de pruebas que necesitará la capa de persistencia.

### Dónde se mezclan responsabilidades

1. Los stores conocen localStorage. Cada uno tiene su clave, su `try/catch` y su política de errores: `progressStore.ts:58-67` y `:105-115`, `myWordsStore.ts:139-158`, `characterStore.ts:35-55` y `:147-157`, `vocabularyStore.ts:13-33`. Solo progreso y Mis palabras exponen `storageError`; los otros tragan el error.
2. Las páginas leen almacenamiento. `Home.tsx:88-105` guarda la última foto del progreso y `Home.tsx:107-122` recorre todas las claves con un prefijo copiado a mano de `vocabularySession.ts:5-6`. Si cambia uno, el otro deja de encontrar sesiones sin que falle ningún tipo.
3. Una utilidad orquesta stores. `levelPacks.ts:4-5` importa `characterStore` y `vocabularyStore` y los muta en `loadInstalledPacks` (`:270-276`) y `applyListChoice` (`:325-345`). `levelPacks.ts:20` (`USED_KEYS`) conoce claves de otros tres módulos.
4. Las páginas calculan dominio. `VocabularyReview.tsx:130-160` decide modo, mazo y cabecera de la sesión, y `:279` decide cuándo una respuesta mueve el calendario. Es lógica de repaso que hoy solo se prueba montando la página.
5. `progressStore.ts` mezcla persistencia, reglas de cola (`buildQueue`, `:329-347` y `:430-437`), límites diarios y dos stores en un archivo (`progressStore` en `:136`, `vocabularyProgressStore` en `:372`). `vocabularyProgressStore.ts` es solo un reexport. Hay código duplicado: `currentDaily` (`:122-131`) y `currentWordDaily` (`:366-370`), y `afterAnswer` existe en `schedule.ts:5` y en `progressStore.ts:54`.
6. Hay código muerto. `loadSession`, `saveSession`, `missedInWriting` y `recordWriting` de `src/utils/sessionStore.ts` no tienen llamadas en `src/` ni en `tests/`; solo se usa `discardSession` (`ProgressBackup.tsx:6`). El modo entrenamiento de `characterStore.ts:282-316` solo lo usan sus tests.
7. El contenido entra como JSON estático en el bundle. `src/data/vocabulary.ts:3-8` importa las seis listas (unos 1,45 MB sin comprimir), `src/utils/characterSearch.ts:1` importa `searchIndex.json` (658 KB), y `characterStore.ts:4` y `:89` importan HSK 1 y todas las glosas al cargar el módulo.

## 2. Persistencia y modelo de datos

### Qué se guarda hoy

| Clave | Dónde | Forma | Naturaleza |
| --- | --- | --- | --- |
| `hsk-flashcards-stats` | `progressStore.ts:12` | `{ version: 3, chars, daily, words, wordDaily, activity }` | Estado del usuario |
| `jiayou-my-words` | `myWordsStore.ts:30` | `{ ids: string[], own: Record<id, palabra> }` | Estado del usuario (incluye contenido creado por él) |
| `jiayou-study-lists` | `vocabularyStore.ts:11` | `{ selectedLists }` | Preferencia del usuario |
| `hsk-flashcards-progress` | `characterStore.ts:20` | `{ selectedLevels, currentIndex }` | Dispositivo. El nombre engaña: no es progreso |
| `hsk-installed-levels` | `levelPacks.ts:13` | `HskLevel[]` | Dispositivo |
| `jiayou-vocabulary-session-v1[:practice:<id>]` | `vocabularySession.ts:5-6` | Mazo, posición y `checkpoint` | Dispositivo |
| `jiayou-session-v1` | `sessionStore.ts:39` | Sesión de caracteres | Sin escritor; muerta |
| `jiayou-write-misses` | `sessionStore.ts:197` | `string[]` | Sin escritor; muerta |
| `jiayou-home-last-<modo>` | `Home.tsx:88` | `{ scope, mastered, learning }` | Dispositivo |
| `jiayou-theme` | `theme.ts:6` | Tema | Preferencia del dispositivo |
| `hsk-voice-mode` | `speech.ts:18` | Voz | Preferencia del dispositivo |

Cada registro de progreso es un `CharProgress` (`src/domain/progress/types.ts:2-19`) con contadores, intervalo, facilidad, `due` y `lastSeen` en milisegundos. Palabras y caracteres usan el mismo tipo.

Con las 2.650 entradas de `characterLevels.json` y las 4.992 palabras, un progreso completo ocupa del orden de 1,3 MB de JSON. Cada sesión pausada guarda también una copia entera de ese progreso en su `checkpoint` (`vocabularySession.ts:26`, `VocabularyReview.tsx:154`). Tres o cuatro sesiones pausadas con el progreso lleno rozan los 5 MB que suelen dar los navegadores a localStorage.

### Los identificadores están bien como están

- Un carácter se identifica por su glifo (`progressStore.ts:118`).
- Una palabra se identifica por `wordId(simplified, pinyin)` (`src/utils/pinyin.ts:112-116`), por ejemplo `word-7231-ai4` para 爱.
- Una corrección del usuario se guarda bajo el id de la palabra del catálogo, así que el progreso sigue con la palabra (`myWordsStore.ts:20-28` y `:123`).

Estos ids sirven tal cual como clave primaria en un servidor. Lo que falta es protegerlos. `tests/vocabularyData.test.ts:62-63` comprueba que cada id sale de la regla, pero si alguien corrige el pinyin de una palabra del catálogo el id cambia, el test sigue pasando y el progreso de esa palabra queda huérfano. Propongo un archivo de ids publicados (`src/data/vocabulary/published-ids.json`) y un test que falle si un id desaparece.

### Qué falta para que el mismo estado viva detrás de una API

1. Una marca de escritura por registro. Hace falta `updatedAt` (milisegundos) en cada `CharProgress`, puesta por el store en cada escritura. `lastSeen` no vale. `recoverWeak` cambia `clean` sin tocarlo (`progressStore.ts:313-318` y `:386-392`), y `recordStrokes` lo usa para práctica de trazos (`:273-281`).
2. Un `deviceId` generado una vez y guardado en el dispositivo. Desempata conflictos con la misma marca de tiempo y permite contadores por dispositivo.
3. Dejar de sustituir el documento entero. Hoy hay cinco escritores de documento completo:
   - `checkpoint` y `rollback` (`progressStore.ts:140-154`), usados al descartar una sesión (`VocabularyReview.tsx:154` y `:356`);
   - `importBackup` (`:160-167`);
   - `recoverStoredProgress` (`:191-207`);
   - `clear` (`:358-362`).

   Con sincronización, un `rollback` restaura una foto tomada al empezar la sesión y borra lo que haya llegado de otro dispositivo entretanto. La corrección es guardar en el checkpoint solo los registros que la sesión toca, con su valor anterior, y restaurar solo esos. Eso arregla también el tamaño de las sesiones pausadas.
4. Una regla para los días. `today()` usa el calendario local (`progressStore.ts:31`), y `activity` guarda respuestas por día local (`:75-80`). La racha se calcula desde `activity` (`:86-96`). Dos dispositivos en husos distintos suman a días distintos, y fusionar `activity` sumando duplica lo que ya se sincronizó, mientras que quedarse con el máximo pierde respuestas. La salida simple es guardar `activity` por dispositivo (`Record<deviceId, Record<día, número>>`), cada dispositivo solo incrementa lo suyo, y la pantalla suma. Es un contador que crece y se fusiona con máximo por dispositivo, sin librería.
5. Derivar lo que se puede derivar. `daily` y `wordDaily` (`introduced`, `reviewed`) son contadores del día que también chocarían entre dispositivos. `introduced` se puede calcular contando registros cuya primera vista cae hoy, si se guarda `introducedAt` en el registro. La excepción es la introducción "gratis" de caracteres ya vistos en palabras (`progressStore.ts:212-249`), que necesitaría guardar ese indicador en el registro.
6. Mis palabras como registros. `ids` es una lista ordenada (`myWordsStore.ts:25-28`). Si dos dispositivos añaden palabras distintas, quedarse con la última lista pierde una. Propongo un registro por palabra con `addedAt`, `removedAt` (lápida) y `updatedAt`, y ordenar por `addedAt`.

### Estado del usuario, contenido y dispositivo

| Tipo | Qué incluye | Dónde vivirá |
| --- | --- | --- |
| Estado del usuario, sincronizable | Progreso de caracteres y palabras, actividad, Mis palabras, listas elegidas | Local y servidor |
| Contenido | Vocabulario, caracteres, glosas, temas, trazos, audio | Bundle, packs y, más adelante, API de contenido |
| Dispositivo | Niveles instalados, posición en Explorar, sesiones pausadas, foto de Home, tema, voz | Solo local |

Las sesiones pausadas se quedan en el dispositivo. Retomar una sesión de un móvil en el portátil no compensa el coste de sincronizar mazos que referencian contenido que quizá no esté instalado.

### Cómo resolver conflictos entre dispositivos

Last-write-wins por registro. Cada carácter o palabra es un registro; gana el `updatedAt` mayor y, si empatan, el `deviceId` mayor. Es simple, el servidor solo compara dos números y la fusión es conmutativa e idempotente. El coste es perder una respuesta si dos dispositivos repasan el mismo carácter sin conexión antes de sincronizar, lo que en repaso espaciado mueve una fecha unos días.

Last-write-wins por campo. Fusiona `right` de un lado con `interval` del otro. Lo descarto porque `schedule` calcula `reps`, `interval`, `ease` y `due` juntos (`schedule.ts:7-37`); mezclarlos produce estados que ninguna secuencia de respuestas puede generar.

Registro de eventos. Guardar cada respuesta como evento y recalcular el registro reproduciendo `schedule` en orden. Es exacto y deja historial para estadísticas, y `schedule` ya es pura, así que es viable. Cuesta almacenamiento (decenas de miles de eventos al año por usuario activo) y una reproducción en cada fusión.

CRDT con librería (Automerge, Yjs). Resuelve listas y texto colaborativo, que aquí no hay. Añade peso al bundle y un formato opaco para un mapa de registros independientes.

Recomiendo last-write-wins por registro, con `activity` como contador por dispositivo. Si más adelante se quiere historial, el envío de registros cambiados se puede ampliar a eventos sin tocar el cliente de stores.

## 3. Capa de acceso a datos

### El coste real no es la interfaz

Todos los stores se crean de forma síncrona al importar el módulo: `createStore(load())` en `progressStore.ts:69`, `myWordsStore.ts:148`, `characterStore.ts:144` y `vocabularyStore.ts:23`. Las páginas leen en su creación, por ejemplo `Home.tsx:126` carga la sesión guardada antes del primer render. Un repositorio asíncrono obligaría a una fase de carga en toda la app.

La propuesta es un repositorio síncrono que lee de memoria, con un adaptador que puede hidratarse de forma asíncrona una sola vez antes de `render` en `src/index.tsx:29`. Las páginas no cambian.

### Interfaz propuesta

```ts
// src/persistence/keys.ts: todas las claves, en un sitio.
export const KEYS = {
  progress: 'jiayou-progress',
  myWords: 'jiayou-my-words',
  studyLists: 'jiayou-study-lists',
  installedLevels: 'jiayou-installed-levels',
  wordSession: 'jiayou-vocabulary-session',
  // ...
} as const;

// src/persistence/keyValue.ts: el único módulo que toca localStorage.
export interface KeyValueStore {
  read(key: string): string | null;
  write(key: string, value: string): void; // lanza si falla
  remove(key: string): void;
  keys(prefix: string): string[];
}

// src/persistence/progressRepository.ts
export interface ProgressRepository {
  load(): ProgressState;
  /** Guarda el estado y anota qué registros cambiaron, para la cola de envío. */
  save(next: ProgressState, changed: ChangedIds): void;
  /** Registros llegados de fuera (copia, otra pestaña, servidor), ya fusionados. */
  onReplaced(listener: (next: ProgressState) => void): () => void;
}
```

Hoy `ProgressRepository` tiene una implementación sobre `KeyValueStore` con localStorage, y otra en memoria para tests. Cuando exista la API, la implementación local sigue siendo la misma y se añade un `SyncEngine` aparte que:

1. lee la cola de ids cambiados que deja `save`;
2. envía esos registros y recibe los del servidor posteriores a su cursor;
3. fusiona con la función pura del dominio;
4. aplica el resultado con `reconcile`, por el mismo camino que ya usa `importBackup`, y avisa con la señal de `src/utils/progressReset.ts`, renombrada a algo como `stateReplaced`. `VocabularyReview.tsx:224` ya reacciona a esa señal saliendo de la sesión.

Para que los stores no dependan del repositorio concreto, cada store pasa a exportar una fábrica (`createProgressStore(repo)`) y una instancia por defecto con el mismo nombre que hoy. Las páginas siguen importando `progressStore`. Los tests crean instancias nuevas en vez de compartir el estado del módulo entre casos, que es lo que pasa ahora. `tests/setup.ts:52` limpia localStorage pero no la memoria de los stores.

### Local-first con cola de sincronización

La app ya es local-first y el offline es requisito. Una API como fuente de verdad en cada respuesta rompería el estudio sin red, así que la pregunta es cuánto cuesta la cola, no si ponerla.

Con last-write-wins por registro, el coste es acotado:

- una función de fusión pura con tests de propiedades (una PR);
- `updatedAt`, `deviceId` y la cola de ids cambiados en el repositorio (una PR);
- el `SyncEngine` con cursor, reintentos con espera creciente y disparo en `online`, al volver a primer plano y tras cada sesión (una PR, cuando exista la API).

No hace falta interfaz de conflictos para el usuario. Lo que sí hace falta es el checkpoint acotado de la sección 2, o descartar una sesión deshará trabajo de otro dispositivo.

IndexedDB no hace falta hoy. Con el checkpoint acotado, el progreso completo cabe en localStorage. Si más adelante pasa de unos 2 MB, el cambio queda dentro del adaptador gracias a la hidratación previa al render.

## 4. Contenido

### Qué hay hoy

| Contenido | Dónde | Cómo llega |
| --- | --- | --- |
| Vocabulario HSK 1 a 6 | `src/data/vocabulary/hsk1-6.json` | Bundle, importación estática (`vocabulary.ts:3-8`) |
| Índice de búsqueda | `src/data/searchIndex.json` | Bundle (`characterSearch.ts:1`) |
| Caracteres HSK 1 y glosas | `src/data/hsk1.json`, `src/data/glosses/*.json` | Bundle (`characterStore.ts:4` y `:89`) |
| Nivel de cada carácter | `src/data/characterLevels.json` | Bundle (`catalog.ts:3`) |
| Temas | `src/data/topics.ts` | Código |
| Caracteres HSK 2 a 6 | `public/packs/hskN.json` | Pack descargable (`levelPacks.ts:234-252`) |
| Trazos | `public/strokes/` (HSK 1), `public/packs/hskN/strokes/` | Precaché y packs |
| Audio por sílaba | `public/audio/` (34 MB), `public/packs/hskN/audio/` | Caché de medios |

Este reparto tiene tres problemas.

1. El reparto es desigual. Las 4.992 palabras van en el JS desde el primer arranque, pero los caracteres de HSK 2 a 6 se descargan por nivel.
2. La versión de la caché de medios es un único hash de todo `public/packs` y `public/audio` (`vite.config.ts:8-18`). Cambiar un MP3 invalida todos los packs de todos los usuarios. `previousCopy` (`levelPacks.ts:101-114`) lo compensa copiando la versión vieja marcada con `x-jiayou-stale`.
3. Los `manifest.json` de cada pack (`scripts/build-media-packs.mjs:83-92`) tienen recuentos pero no versión ni hash, y la app no los lee.

### Qué empaquetar y qué servir

- Seguir empaquetando el armazón de la app, HSK 1 (palabras, caracteres, trazos, glosas), `characterLevels.json`, los temas y el catálogo de niveles. Es lo que permite estudiar en el primer arranque sin red.
- Pasar a packs el vocabulario de HSK 4 a 6 y el índice de búsqueda de esos niveles, cuando exista la API o cuando el tamaño del bundle moleste. No antes. `allWords` y `catalogById` (`myWordsStore.ts:34` y `:300-308`) asumen que todo el vocabulario está en memoria al importar; moverlo exige la misma carga asíncrona que ya tienen los packs de caracteres.
- Servir desde la API lo que cambia por edición: correcciones de glosas, listas nuevas, listas compartidas. Trazos y audio siguen como archivos estáticos detrás de un CDN; no ganan nada pasando por un servidor de aplicación.

### Cómo versionar para que la app instalada siga funcionando

1. Un manifiesto de contenido (`content.json`) con una entrada por pack: id, hash del contenido, tamaño y `schema`.
2. URLs con versión, por ejemplo `/packs/hsk4.a1b2c3.json`. Un pack versionado no cambia nunca, se puede cachear para siempre, y actualizar HSK 4 no invalida HSK 2.
3. Una caché por pack en lugar de una global, borrando la versión anterior solo cuando la nueva está completa. Es lo que hoy hace `previousCopy` a mano.
4. Un número de `schema`. La app ignora packs con un `schema` mayor que el que entiende y se queda con el que tiene. Una app instalada que no se actualiza sigue estudiando con su contenido.
5. Los packs llevan la forma final ya fusionada. Hoy `parseCharacter` mezcla glosa en línea y glosa del sidecar (`characterStore.ts:97-111`); el `publish` del `api/` ya produce la mezcla, así que la app puede dejar de hacerla cuando todos los packs la traigan.

## 5. El `api/` en Bun

### Qué hace

Es una herramienta editorial local. Escucha solo en `127.0.0.1` (`api/src/index.ts:114-118`), lee y escribe archivos del repo, y su README dice que la app no la llama (`api/README.md:3`). Las rutas cubren salud, leer y corregir un carácter, revisión por nivel, ingesta (HanziDB y traducción) y publicación de packs (`api/src/index.ts:27-107`). Tiene tests de fusión con `bun test` (`api/src/merge.test.ts`) que no corren en `npm run check` (`package.json`, script `check`).

### Si encaja con el futuro

Como cadena editorial, sí, y conviene conservarla. Como API de usuarios, no. Cambia el público, la autenticación, el despliegue y el almacén (archivos del repo frente a una base de datos). Mezclar las dos en un proceso expone las rutas de escritura de contenido a internet.

Hay duplicados que hay que juntar antes de que existan dos backends:

- `syllableKey` está tres veces: `src/utils/pinyin.ts:95`, `api/src/syllableKey.ts:21` y `scripts/syllable-keys.mjs:23`.
- `wordId` está en `src/utils/pinyin.ts:112` y en `scripts/syllable-keys.mjs` (lo importa `scripts/build-vocabulary.mjs:7`). Como los ids son la clave del progreso, una divergencia entre las dos copias deja progreso huérfano.
- `HSKCharacter` está en `src/types.ts:5-18` y en `api/src/types.ts:9-21`.

### Forma propuesta

```
shared/
  contracts/   tipos y validadores: CharProgress, registros de sync, manifiesto de contenido
  pinyin/      syllableKey, wordId (la única copia)
api/
  src/
    content/   lo de hoy: ingest, overrides, publish, review
    sync/      pull y push de registros
    auth/      sesiones
    http.ts    router
```

`content/` sigue siendo local o de uso interno. `sync/` y `auth/` son lo único público. El router actual con expresiones regulares basta para seis rutas; con más, un router pequeño como Hono encaja con Bun, pero no hace falta ahora.

### Contrato con la app

```
GET  /v1/content/manifest
     → { packs: [{ id, hash, size, schema, url }] }

GET  /v1/sync?since=<cursor>
     → { records: SyncRecord[], cursor }

POST /v1/sync
     { deviceId, records: SyncRecord[] }
     → { cursor, rejected: SyncRecord[] }   // la versión del servidor cuando gana

SyncRecord = {
  kind: 'char' | 'word' | 'my-word' | 'list-choice' | 'activity',
  id: string,
  data: unknown,        // validado con el parser compartido
  updatedAt: number,
  deviceId: string,
}
```

El servidor guarda por cada registro la versión con mayor `(updatedAt, deviceId)` y un número de secuencia propio para el cursor. No confía en el reloj del cliente para el cursor, solo para desempatar.

### Autenticación

Primero la app sin cuenta, como hoy. Al iniciar sesión, el dispositivo sube su estado local por el mismo `POST /v1/sync`: adoptar los datos de un dispositivo es una fusión más, sin caso especial.

Para el inicio de sesión hay dos caminos razonables:

- Enlace mágico por correo o passkeys, con sesión en cookie `httpOnly` del mismo origen. Sin tokens en localStorage, sin dependencia de terceros, y Bun lo soporta sin librerías grandes.
- Un proveedor gestionado (Supabase, Firebase Auth). Ahorra el envío de correos y la recuperación de cuenta, a cambio de un SDK en el cliente y de atar el modelo de usuario a otro servicio.

Recomiendo el primero con cookie del mismo origen, porque el cliente solo necesita `fetch` con credenciales y la PWA no guarda secretos.

La analítica hoy no identifica a nadie (`src/analytics.ts:8-17`, `cookieless_mode` y `person_profiles: 'never'`). Con cuentas habrá que decidir si se identifica al usuario en PostHog; propongo no hacerlo por defecto.

## 6. Navegación y estado de pantalla

### Cómo funciona

`Screen` es una unión de siete pantallas (`src/screen.ts:8-15`). `createScreenHistory` guarda la pantalla en `history.state` con `pushState` y URL vacía (`src/createScreenHistory.ts:23` y `:52`), y la restaura en `popstate` validándola con `parseScreen`. El botón atrás funciona. La URL no cambia nunca.

Eso tiene cuatro consecuencias.

- Recargar vuelve a Home. `App.tsx:30` arranca en `homeScreen` y `createScreenHistory.ts:23` reemplaza el estado guardado.
- No hay enlaces profundos ni forma de compartir una palabra.
- El reto por enlace de `strategy.md:239` no tiene dónde leerse.
- No hay forma de volver a una pantalla después de un inicio de sesión con redirección.

### Si aguanta

Sí. La unión tipada y `parseScreen` son la mitad de un router y ya tratan el historial como entrada no confiable. Falta la otra mitad, junto a `parseScreen`:

```ts
export const screenToUrl = (screen: Screen): string => { /* ... */ };
export const urlToScreen = (url: URL): Screen | undefined => { /* ... */ };
```

Rutas propuestas: `/palabra/<wordId>`, `/caracter/<glifo>`, `/trazos/<glifo>`, `/mis-palabras`, `/opciones`, `/acerca`, `/repaso`, y `?duelo=<semilla>&nivel=<n>` cuando exista el duelo.

Hay dos casos que no caben en una URL y no deben caber:

- `trazos` lleva `from: Screen`, recursivo (`screen.ts:15`). Desde un enlace, `from` es Home.
- Una sesión de repaso vive en localStorage. `/repaso` abre la sesión guardada si existe y, si no, cae a la palabra o a Home, como ya hace `createScreenHistory.ts:27-38` con el historial.

Con rutas reales en la URL (no `#`), el alojamiento debe servir `index.html` para cualquier ruta; sin red lo resuelve el `navigateFallback` que vite-plugin-pwa configura por defecto. Si el alojamiento no lo permite, `#/palabra/...` funciona sin configuración a costa de URLs menos limpias.

Volver tras un login se reduce a guardar `screenToUrl(screen())` antes de redirigir y leerlo al volver.

No recomiendo una librería de rutas. Las reglas de "volver" viven en `App.tsx:85-131` dentro del JSX; sacarlas a funciones puras en un `navigation.ts` las hace testeables sin montar la app, y eso da más que un router.

## 7. Tests y tooling

### Qué existe

- 40 archivos de test en `tests/` con Vitest y jsdom (`vite.config.ts`, bloque `test`), unas 3.400 líneas, y `api/src/merge.test.ts` con Bun.
- Dominio y stores, en `progressStore`, `vocabularyProgress`, `weakAndCap`, `characterStore`, `myWords`, `vocabularyStore`, `progressBackup`.
- Calidad de datos, en `vocabularyData`, `vocabularyQuality`, `traditionalForms`, `topics`.
- Utilidades, en `pinyin`, `searchRank`, `speech`, `theme`, `levelPacks`, `strokeData`, `wordOrder`, `wordListImport`, `screen`, `serviceWorker`.
- UI, en `vocabularyReview`, `misPalabrasUi`, `progressBackupUi`, `accessibility` y los de rondas `r7*` y `r8*`.
- `npm run check` ejecuta los tests de Vitest y el build con `tsc` (`package.json`). Los tests del `api/` quedan fuera.

`tests/progressBackup.test.ts:13` ya prueba la ida y vuelta de la copia, y `tests/vocabularyData.test.ts:62` la regla de ids. Es una buena base.

### Qué tests de contrato hacen falta

1. Fixtures congeladas de cada formato persistido (progreso, Mis palabras, sesión de vocabulario) en `tests/fixtures/`, con un test que las parsea. Si un cambio rompe el parseo de una copia, falla aquí y no en el móvil de alguien.
2. Ids publicados congelados (sección 2).
3. Tests de propiedades de la fusión sobre registros generados al azar, que comprueben que `merge(a, b)` es igual a `merge(b, a)`, que `merge(a, a)` es igual a `a` y que la fusión es asociativa.
4. Un servidor falso en memoria que implementa el contrato de `/v1/sync` con los tipos de `shared/contracts`, y tests del `SyncEngine` contra él: sin red, red que vuelve, conflicto, rechazo.
5. Un test de esquema de packs en el que cada `public/packs/*.json` valida contra el esquema compartido y el manifiesto coincide con los archivos.
6. Los tests del `api/` dentro de `npm run check`, para que un cambio en `shared/` no rompa la herramienta editorial sin avisar.
7. Un test del checkpoint acotado. Descartar una sesión restaura los registros tocados y deja intacto un registro cambiado por fuera durante la sesión.

## 8. Plan por fases

Cada paso es una PR. Al terminar cada una, la app se comporta igual que hoy salvo donde se indica.

### Fase 0. Ordenar sin cambiar comportamiento

| PR | Archivos | Riesgo | Desbloquea |
| --- | --- | --- | --- |
| 0.1 Borrar código muerto | `src/utils/sessionStore.ts` (dejar `discardSession` o quitarlo con su clave), `characterStore.ts:282-316`, `tests/characterStore.test.ts`, `levelPacks.ts:20` | Bajo | Menos superficie que migrar |
| 0.2 Claves y adaptador de almacenamiento | Nuevos `src/persistence/keys.ts` y `keyValue.ts`; cambiar `progressStore.ts`, `myWordsStore.ts`, `characterStore.ts`, `vocabularyStore.ts`, `vocabularySession.ts`, `levelPacks.ts`, `theme.ts`, `speech.ts`, `Home.tsx` | Bajo, muchos archivos con cambios mecánicos | Un solo punto que toca localStorage; inventario de lo que se guarda |
| 0.3 Sacar lecturas de almacenamiento de Home | `Home.tsx:88-122` a `vocabularySession.ts` (listar sesiones pausadas) y a un util para la foto de Home | Bajo | El prefijo de sesión deja de estar duplicado |
| 0.4 Dependencias al derecho | `Grade` y `GRADES` a `domain/progress/types.ts`; `data/lists.ts` recibe las palabras propias como parámetro o pasa a `stores/` | Bajo | `domain` y `data` sin imports de stores |
| 0.5 Separar reglas de cola del store | `buildQueue`, límites diarios y `currentDaily` a `domain/progress/queue.ts`; un archivo por store; quitar el reexport `vocabularyProgressStore.ts` | Medio. Lo cubren `progressStore.test.ts` y `weakAndCap.test.ts` | Reglas probables sin store; menos duplicado |
| 0.6 Fábricas de store | `createProgressStore(repo)` y `createMyWordsStore(repo)` con instancia por defecto | Bajo | Tests con estado limpio; inyectar repositorio |

### Fase 1. Preparar el modelo, todavía sin servidor

| PR | Archivos | Riesgo | Desbloquea |
| --- | --- | --- | --- |
| 1.1 Checkpoint acotado | `progressStore.ts:140-154`, `VocabularyReview.tsx:154` y `:356`, `vocabularySession.ts:26` | Medio. "Descartar" debe dejar todo igual que hoy; lo cubre `vocabularyReview.test.tsx` más el test 7 de la sección 7 | Sesiones pausadas pequeñas; descartar no pisa la sincronización |
| 1.2 `updatedAt` y `deviceId` | `domain/progress/types.ts`, `serialization.ts`, la función `update` de los stores; formato `version: 4` sin migración | Bajo | Fusión por registro |
| 1.3 Actividad por dispositivo y contadores derivados | `progressStore.ts:72-96` y `:121-131`, `ActivityCalendar.tsx`, `HomeProgress.tsx` | Medio. La racha y el calendario deben dar los mismos números con un solo dispositivo | Racha correcta con varios dispositivos |
| 1.4 Mis palabras como registros | `myWordsStore.ts:25-28` y `:112-158` | Medio | Añadir palabras en dos dispositivos sin perder ninguna |
| 1.5 Fusión pura y "combinar copia" | Nuevo `domain/sync/merge.ts`; opción en `ProgressBackup.tsx` de combinar en vez de reemplazar | Bajo. Es una función nueva con tests de propiedades | Sincronización manual entre dispositivos con el archivo de copia, útil ya; prueba en uso real la fusión que usará la API |
| 1.6 URL y pantalla | `screen.ts`, `createScreenHistory.ts`, `App.tsx:30`, nuevo `navigation.ts` | Medio. Recargar deja de volver a Home, que es un cambio visible y deseado | Compartir una palabra, el duelo por enlace, volver tras login |
| 1.7 Manifiesto y packs versionados | `scripts/build-media-packs.mjs`, `vite.config.ts:8-18`, `levelPacks.ts` | Medio. Toca el service worker y la caché | Actualizar un pack sin invalidar los demás; servir packs desde CDN o API |
| 1.8 Código compartido | Nuevo `shared/pinyin` y `shared/contracts`; `src/utils/pinyin.ts`, `api/src/syllableKey.ts`, `api/src/types.ts`, `scripts/syllable-keys.mjs`; tests del `api/` en `npm run check` | Bajo | Una sola regla de ids; contrato común app y servidor |
| 1.9 Ids publicados congelados | Nuevo `src/data/vocabulary/published-ids.json`, test en `tests/vocabularyData.test.ts` | Bajo | Corregir contenido sin dejar progreso huérfano |

### Fase 2. Cuando exista la API

| PR | Archivos | Riesgo | Desbloquea |
| --- | --- | --- | --- |
| 2.1 Separar `api/` en `content/` y añadir `http.ts` | `api/src/*` | Bajo | Sitio para `sync/` y `auth/` |
| 2.2 Autenticación | `api/src/auth/`, pantalla de inicio de sesión, vuelta con `screenToUrl` | Medio | Cuentas |
| 2.3 Sincronización | `api/src/sync/`, `src/sync/syncEngine.ts`, cola de ids en el repositorio, señal `stateReplaced` | Medio. La app sigue funcionando sin red porque el motor solo fusiona | Progreso compartido entre dispositivos |
| 2.4 Adoptar datos al primer inicio de sesión | `syncEngine.ts` | Bajo, es un envío más | Usuarios actuales no pierden nada al crear cuenta |
| 2.5 Vocabulario 4 a 6 en packs | `data/vocabulary.ts`, `myWordsStore.ts:34` y `:300-308`, `characterSearch.ts`, `levelPacks.ts` | Alto. Hay que convertir lecturas síncronas del catálogo en carga por nivel | Bundle inicial menor; contenido servido desde la API |

### Qué no hacer todavía

- Una librería CRDT. El modelo es un mapa de registros independientes y last-write-wins basta.
- IndexedDB, mientras el progreso quepa en localStorage tras el checkpoint acotado.
- Una librería de rutas. La unión `Screen` con sus dos funciones de conversión cubre los casos.
- Mover el vocabulario a packs antes de que haya API o un problema medido de tamaño.
- Exponer las rutas de contenido del `api/` fuera de localhost.
- Sincronizar sesiones pausadas, tema o voz.
- Infraestructura de tiempo real para duelos en directo; el reto por enlace no la necesita.
