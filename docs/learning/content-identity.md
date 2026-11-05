# Identidad y revisión del contenido

## Estado actual comprobado

El vocabulario guarda `id` en cada entrada. El progreso actual usa ese identificador. `shared/pinyin/index.ts` genera IDs a partir de los caracteres simplificados y la lectura de diccionario, con un token por sílaba. El tono 1 no lleva sufijo, los tonos 2 a 4 llevan número y el tono neutro lleva `5`. La lectura mostrada puede aplicar cambios tonales de 一 y 不, pero el ID usa la lectura original del JSON.

`src/data/vocabulary/published-ids.json` es el registro de IDs publicados. Tiene una línea por ID con su estado (`available` o `retired`), la lista que lo distribuye (`hsk1` a `hsk6` o `extra`) y `revisions`, todas las revisiones publicadas para ese ID de la más antigua a la más reciente. Cubre las 5005 palabras de HSK 1 a 6 y Extra, que hoy está vacía, y los 2650 caracteres con su ID `char-<hex>`. Los 5005 IDs del registro anterior, un array de IDs de HSK, se importaron tal cual. Ningún ID se volvió a calcular.

`updateRegistry` en `scripts/content-publish.mjs` mantiene el registro. Un ID nunca sale de él. Si una palabra publicada falta del contenido, la función falla y pide retirarla en lugar de borrarla. Una revisión distinta de la última se añade al final de `revisions`. La promoción de un borrador y `npm run published-ids` usan la misma función. El script lee las listas `hsk*.json` y `extra.json`, las palabras retiradas de `content/snapshot.json` y los caracteres del snapshot. Un script que añada palabras a las listas también debe añadirlas a `content/snapshot.json`. El test exige que el registro y el snapshot tengan los mismos IDs, y la siguiente promoción fallaría si no. No hay todavía un script que regenere el snapshot desde las listas.

Retirar una palabra marca su fila del snapshot con `retired: true`. La fila sigue en el snapshot, así que su ID sigue ocupado, pero la publicación la saca de `hsk*.json` y `extra.json`. El editor tiene `setWordRetired` en `editor/lib/store.ts`, que además quita los enlaces de otras palabras hacia la retirada. Quitar la marca vuelve a publicar la misma entrada con su ID. `editor/lib/model.ts` sigue impidiendo borrar o cambiar un ID de la base, rechaza que una palabra viva enlace con una retirada y rechaza una palabra nueva cuyo ID ya esté en el registro. `catalogId` cuenta las filas retiradas como ocupadas, así que una palabra nueva con la misma lectura recibe el sufijo `-2`.

`tests/vocabularyData.test.ts` compara con `wordId(simplified, pinyin)` y con el prefijo de hanzi solo los IDs que el registro no tiene, y acepta el sufijo `-N` de `catalogId`. Un ID publicado se conserva aunque se corrijan sus hanzi, su lectura o sus sentidos. El test también comprueba que cada ID disponible está en las listas, que ninguno retirado aparece en ellas, que el registro coincide con el snapshot y que la última revisión publicada de cada palabra y cada carácter es la que calcula la app.

La revisión del editor identifica el snapshot completo. `scripts/content-publish.mjs` calcula su SHA-256 y `baseRevision` evita promover un borrador basado en otro snapshot. Esto no cambia. HSK 1 y Extra se incluyen en la app. Los paquetes de HSK 2 a 6 se instalan por separado, según `src/data/vocabulary.ts`. La ausencia de un paquete no demuestra que su contenido se haya retirado. El estado `retired` del registro sí lo demuestra.

Los caracteres no tienen un campo de ID. Su progreso de trazos vive en el registro de eventos, en el elemento `character-writing:char-<hex>`. Las listas de caracteres son `src/data/hsk1.json` y `public/packs/hsk2.json` a `hsk6.json`, y `characterStore` añade a cada fila la glosa y el ejemplo de `src/data/glosses/*.json` cuando la fila no los trae. Los trazos que corrigen el dibujo se cargan de forma asíncrona desde `public/strokes`, desde `public/packs/hskN/strokes` o desde `hanzi-writer-data@2.0.1` en jsDelivr.

## Contrato de identidad

Una referencia de aprendizaje contiene `contentId` y `contentRevision`, ambos strings no vacíos. `contentId` es exactamente el `id` publicado de la entrada. `contentRevision` identifica una versión inmutable de los datos con los que se formuló y evaluó la pregunta. Cada intento conserva ambos valores. El historial no sustituye una revisión antigua por la actual.

La primera publicación asigna el ID una sola vez. La regla `wordId` puede generar candidatos para entradas nuevas, pero no vuelve a calcular la identidad de una entrada publicada. El registro de IDs incluye HSK y Extra, conserva los retirados y prohíbe asignar un ID anterior a otra entrada. Una entrada representa una palabra con una lectura y sentidos editoriales relacionados. Dos lecturas distintas como 还 hái y 还 huán mantienen IDs distintos. Una corrección de un error en la lectura o en los sentidos conserva el ID si sigue siendo la misma entrada. Si la corrección descubre dos entradas distintas, se conserva el ID para la entrada original que el editor identifique y se asigna otro a la nueva. La decisión y la correspondencia requieren revisión editorial, no una comparación automática de texto. El registro y los tests aplican esta regla desde la fase 2C, salvo esa decisión editorial, que ningún código comprueba.

La revisión cambia cuando cambia cualquier dato que pueda alterar la pregunta, las respuestas aceptadas o su evaluación. El productor versiona las reglas de normalización y evaluación por separado mediante `evaluatorVersion`, que cada intento conserva junto a la referencia. Cambiar el evaluador no cambia por sí solo la revisión de la palabra. Cambios de tema o nivel no necesitan una revisión nueva. Algunas preguntas sí dependen de otras entradas y del nivel. `askGloss` en `src/domain/learning/exercises/glosses.ts` usa los sentidos de otras palabras para decidir si añade el segundo sentido o una pista, y `buildOptions` en `src/domain/learning/exercises/options.ts` elige las opciones entre otras palabras. Eso no exige incluir nivel ni catálogo en la revisión, porque cada intento guarda `Exercise.prompt` y `options` tal como se mostraron. Una corrección de lectura o sentidos sí la necesita. La revisión global del snapshot no sustituye esta revisión por entrada.

El traslado entre HSK y Extra conserva ID, revisión y progreso cuando no cambia el contenido evaluado. Retirar una entrada cambia su disponibilidad, no borra su identidad ni su historial. El registro guarda el ID con el estado `retired`, y la entrada sale de las listas que lee la app, así que no aparece en preguntas nuevas. No debe convertir una retirada en una respuesta incorrecta ni borrar intentos. Si una entrada vuelve a publicarse, recupera su ID y recibe una revisión nueva si cambia el contenido evaluado.

Cuando falta un paquete, el lector conserva referencias e intentos y declara el contenido temporalmente no disponible. No infiere una retirada ni genera una pregunta sin la revisión necesaria. La instalación del paquete permite resolver la referencia otra vez. Una revisión histórica que el dispositivo no tenga tampoco debe sustituirse silenciosamente por la revisión actual.

## Revisión provisional por entrada

`src/domain/learning/content/revision.ts` calcula la revisión en el cliente, de forma síncrona y sin dependencias. `contentReferenceForWord` devuelve el `id` de la palabra y su revisión. `contentReferenceForCharacter` devuelve `char-` seguido del código del carácter en hexadecimal, con la misma escritura que `wordId` usa para cada hanzi, y su revisión. Así 的 es `char-7684` y no puede coincidir con un ID de palabra, que siempre empieza por `word-`. `tests/learning/content/revision.test.ts` comprueba el contrato con los datos reales.

La forma canónica es un array JSON con posiciones fijas, precedido de su versión. Como la función elige cada campo por nombre, el orden de las claves del objeto de entrada no influye. Los textos se normalizan a NFC y se recortan, y las lecturas reducen cualquier secuencia de espacios a uno.

La forma `w1` de una palabra contiene estos datos:

- `simplified` y `traditional`. La tarjeta enseña el tradicional cuando difiere del simplificado.
- La lectura con cambios tonales.
- El `pos` del primer sentido. La tarjeta no lo muestra, pero `isFunctionWord` en `src/domain/learning/exercises/ambiguity.ts` lo usa para preguntar al revés por partículas y clasificadores, así que decide qué pregunta se hace.
- La `note` del primer sentido. `displayGloss` de `VocabularyReview` la muestra en lugar del primer sentido cuando este coincide con el pinyin.
- El texto de todos los sentidos, en orden. El primero encabeza la tarjeta, los demás forman la línea inferior y `askGloss` añade el segundo cuando otra palabra comparte el primero.

Quedan fuera `id`, `level`, `topicIds`, `sourceId`, `characters`, que se deriva de `simplified`, `relations`, `example` y el `pos` y la `note` de los sentidos posteriores, que solo aparecen en la ficha de la palabra. Un ejercicio de contexto que use el ejemplo debe citarlo con su propia referencia, no con la revisión de la palabra.

`w1` cubre la entrada, no todo el reverso de la tarjeta. El reverso también muestra otra palabra relacionada y, en palabras de un carácter sin relacionada, el ejemplo del carácter que viene de `src/data/glosses/*.json` (`VocabularyReview.tsx`, bloque «Ejemplo»). Ninguno de los dos interviene en la pregunta ni en la evaluación.

La lectura se pasa por `withToneSandhi`. Las filas del JSON traen la lectura de diccionario (yī dìng) y las entradas que la app analiza traen la de la tarjeta (yí dìng). La función es idempotente sobre esas dos formas, así que una fila cruda y la entrada analizada producen la misma revisión. El test lo comprueba con las 5005 palabras.

La forma `c1` de un carácter contiene el carácter, `pinyin`, `definition`, `gloss` y la traducción del ejemplo (`example.es`). Trazos solo muestra `glossHead(spokenMeaning(...))` y el pinyin, y `spokenMeaning` lee la glosa, la definición cuando no hay glosa, el pinyin y `example.es`. Quedan fuera `traditional`, la palabra y la lectura del ejemplo, `hsk_level`, `radical`, `stroke_count`, `general_standard` y `frequency_rank`. La entrada debe ser el carácter ya combinado con su glosa, igual que lo lee la página de trazos.

El hash `hash64` es de 64 bits y recorre las unidades UTF-16 con dos carriles de 32 bits. Después de cada unidad, cada carril multiplica y desplaza con XOR para que los bits altos lleguen a los bajos, y el segundo carril incorpora el primero. Al final se mezclan como en cyrb53. La primera versión solo multiplicaba, así que el bit 15 de un carácter nunca bajaba. Con 200 000 cadenas de 'A' (U+0041) y '聁' (U+8041) producía tres colisiones, y el test de regresión comprueba ahora que no hay ninguna. Solo usa `Math.imul` y desplazamientos, que ECMAScript define exactamente, por lo que Node y el navegador dan el mismo resultado. La revisión tiene la forma `w1:` o `c1:` seguida de 16 dígitos hexadecimales. Calcular las 7655 revisiones del catálogo, 5005 palabras y 2650 caracteres, tarda entre 20 y 40 ms en Vitest con jsdom.

`ConfigId` usa SHA-256 y las revisiones usan `hash64` a propósito. La configuración del planificador se calcula pocas veces y puede esperar a `crypto.subtle`, que es asíncrono. La revisión hace falta de forma síncrona para cada entrada. No hay que unificar los dos hashes.

El test fija el hash de varias cadenas, la revisión de 爱, de 不客气 (bú kè qi), de 一定 (yí dìng) y de 的, y un hash de la lista ordenada de todos los pares de ID y revisión del catálogo. Un cambio en los datos, en la forma canónica, en `withToneSandhi` o en las glosas hace fallar ese test. Si el cambio es intencionado, se actualiza el valor fijado. Si no lo es, dejaría huérfanos los intentos guardados.

Cambiar los campos o la normalización exige una forma nueva, `w2` o `c2`. Las revisiones `w1` y `c1` ya guardadas en intentos siguen siendo válidas y no se recalculan.

## Revisión publicada

La publicación calcula la revisión de cada palabra y cada carácter con el mismo `revision.ts` que usa el cliente. `loadRevisions` en `scripts/content-publish.mjs` lo empaqueta con esbuild, porque Node no resuelve su import sin extensión de `src/utils/pinyin`. El cálculo usa las filas del snapshot, y las de caracteres ya traen la glosa y el ejemplo. El test de `tests/vocabularyData.test.ts` compara cada valor con el que calcula la app sobre las palabras analizadas y sobre los caracteres de `src/data/hsk1.json` y `public/packs/hsk*.json` con las glosas combinadas. Si el snapshot y los archivos de glosas no coinciden, ese test falla.

Un cambio en `withToneSandhi` o en las glosas cambia revisiones sin editar el contenido. El test lo detecta, y `npm run published-ids` añade la revisión nueva sin borrar la anterior.

La revisión sigue siendo provisional en dos puntos. No cubre la geometría de los trazos, que decide si un dibujo es correcto. El registro guarda los hashes de las revisiones antiguas, pero no su contenido, así que un dispositivo solo puede reconstruir la revisión del contenido que tiene instalado. El registro permite distinguir una revisión antigua de un ID desconocido, pero la app todavía no lo lee. Calcula la revisión en el dispositivo, y el test comprueba que ese valor coincide con el publicado.

## Caracteres en Trazos

`learningStore` resuelve `character-writing:char-<hex>` con la fila del catálogo que tiene `characterStore`, ya combinada con su glosa. Es la misma entrada que muestra Trazos y la que usa el registro publicado, así que la revisión `c1` del intento coincide con la publicada. El conjunto de Trazos son los caracteres de los niveles marcados, en el orden del catálogo, y cada uno lleva los temas que lo listan para las sesiones de un tema.

Un carácter fuera de HSK no tiene fila. `characterOrWordStub` le construye una glosa con la primera palabra estudiada que lo usa, y esa glosa cambia cuando cambian las listas del alumno. Por eso no recibe referencia `c1` ni entra en ninguna sesión. Trazos muestra su orden de trazos y no guarda nada. Lo mismo pasa con un carácter de HSK que no está en los niveles marcados o cuyo paquete no está descargado.

`c1` no incluye la versión de los datos de trazos. Hay tres motivos:

- `c1` describe lo que la pregunta muestra, el significado y la lectura, y se calcula de forma síncrona desde la fila. La geometría de los trazos se carga después desde `public/strokes`, los paquetes o jsDelivr.
- La versión es la misma para todos los caracteres. Cambiarla en `c1` cambiaría a la vez las 2650 revisiones publicadas e invalidaría todos los intentos abiertos de escritura, sin decir nada sobre un carácter concreto.
- Lo que cambian los datos de trazos y `hanzi-writer` es cómo se corrige un dibujo, no qué se pregunta. Esa es la función de la rúbrica.

Por eso la rúbrica de los ejercicios de escritura debe citar la versión de `hanzi-writer` y de `hanzi-writer-data` que corrigió el dibujo, igual que las respuestas escritas citan su política. `package.json` debe fijar las dos versiones exactas, porque `scripts/build-media-packs.mjs` copia los trazos desde `node_modules` y `remoteStrokeUrl` en `src/utils/levelPacks.ts` pide `hanzi-writer-data@2.0.1` a jsDelivr. Actualizar cualquiera de los dos paquetes es una decisión explícita que cambia esa revisión de la rúbrica.

## Casos del catálogo para diseñar preguntas

Los fixtures de `tests/learning/fixtures/contentCases.ts` recogen estos casos para las pruebas posteriores. Sus variantes de entrada no declaran una política de aceptación.

Los IDs y sentidos siguientes proceden de `src/data/vocabulary/hsk*.json`. Las conclusiones sobre preguntas son reglas propuestas, no comportamiento implementado.

| Entradas | Ambigüedad y consecuencia para preguntas |
| --- | --- |
| `word-4ed6-ta` 他 y `word-5979-ta` 她 | Ambas se leen tā. Un audio aislado no permite exigir uno de los dos caracteres. La pregunta necesita contexto o debe aceptar ambas respuestas cuando corresponda. |
| `word-5728-zai4` 在 y `word-518d-zai4` 再 | Ambas se leen zài. El audio aislado no distingue los caracteres. En el catálogo, 在 incluye "estar en" y "en", y 再 incluye "otra vez" y "luego". |
| `word-7684-de5` 的, `word-5730-de5` 地 y `word-5f97-de5` 得 | Las tres se leen de y sus funciones gramaticales difieren. Hace falta una frase que determine la función para pedir el carácter. |
| `word-559c-6b22-xi3-huan5` 喜欢 y `word-7231-ai4` 爱 | Ambas incluyen "querer". Una traducción aislada de esa palabra no identifica una única respuesta china. |
| `word-9ad8-5174-gao-xing4` 高兴 y `word-5feb-4e50-kuai4-le4` 快乐 | Ambas incluyen "feliz". La pregunta debe aceptar ambas cuando el contexto no las distinga. |
| `word-8fd8-hai2` 还 hái y `word-8fd8-huan2` 还 huán | Comparten escritura, pero tienen lectura y sentidos distintos. La escritura aislada no identifica la lectura que se pide. |
| `word-957f-chang2` 长 cháng y `word-957f-zhang3` 长 zhǎng | Comparten escritura y requieren contexto o un sentido para pedir una lectura concreta. |
| `word-7238-7238-ba4-ba5` 爸爸 y `word-8c22-8c22-xie4-xie5` 谢谢 | Sus segundas sílabas tienen tono neutro. La ausencia de marca en `ba` o `xie` representa el tono 5 en los datos, no un tono desconocido. |
| `word-55ef-ng4` 嗯 | El catálogo usa `ǹg`. La normalización debe contemplar sílabas sin vocal y no perder su tono. |

La entrada de teclado con números y la escritura con marcas requieren una política de respuestas propia. `markTones` acepta formas como `ni3` y `lv4`, mientras `syllableKey` espera marcas y trata una sílaba sin marca como tono neutro. No se debe aplicar `wordId` directamente a la respuesta numérica para decidir si es correcta. La búsqueda `loosePinyin` también equipara ü con u, pero esa tolerancia de búsqueda no prueba equivalencia fonética para evaluar respuestas. La política futura debe definir explícitamente si acepta tonos omitidos, `ü`, `v`, `u:`, marcas, números y cambios tonales hablados, y guardar su versión con el intento.

## Cambios pendientes

La fase 2C hizo los cambios de registro, test y publicación que describen las secciones anteriores. Queda esto:

1. Fase 2C, fuera de los archivos del paquete. El editor no tiene todavía un botón para retirar una palabra ni la marca como retirada en sus listas. `setWordRetired` existe en el store, pero `Editor.tsx` y `editor/components/` no lo usan.
2. Publicar el contenido de las revisiones antiguas, no solo su hash, si hace falta mostrar o reevaluar un intento antiguo. Decidir también si la app debe leer la revisión del registro o del paquete en lugar de calcularla.
3. Fases 2A y 3. Guardar `contentId`, `contentRevision` y `evaluatorVersion` en cada intento con las funciones de `revision.ts`. Distinguir una revisión o un paquete ausente de una retirada. La fase 5C resolvió las dos preguntas de Trazos que seguían abiertas. Se describen en el apartado siguiente.
4. Fases 3 y 5. Probar preguntas con los pares de la tabla y la política de normalización elegida. Verificar que el contexto o el conjunto de respuestas aceptadas resuelva cada ambigüedad antes de contar una respuesta como incorrecta.
5. Una división o fusión de entradas sigue siendo una decisión editorial. El código impide reutilizar un ID, pero no puede saber si una corrección de hanzi convierte la entrada en otra palabra.
