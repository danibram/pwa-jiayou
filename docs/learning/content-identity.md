# Identidad y revisión del contenido

## Estado actual comprobado

El vocabulario guarda `id` en cada entrada. El progreso actual usa ese identificador. `shared/pinyin/index.ts` genera IDs a partir de los caracteres simplificados y la lectura de diccionario, con un token por sílaba. El tono 1 no lleva sufijo, los tonos 2 a 4 llevan número y el tono neutro lleva `5`. La lectura mostrada puede aplicar cambios tonales de 一 y 不, pero el ID usa la lectura original del JSON.

`editor/lib/model.ts` exige conservar los IDs presentes en la base y permite trasladar una palabra entre HSK y Extra sin cambiarlo. `scripts/published-ids.mjs` y `tests/vocabularyData.test.ts` comprueban actualmente los IDs de HSK 1 a 6, no los de Extra. El test también exige que cada ID HSK coincida con el resultado actual de `wordId`. Por tanto, conservar un ID publicado mientras se corrige su lectura entra en conflicto con ese test. El editor no impide reutilizar un ID para otra palabra si se mantienen los campos válidos.

La revisión del editor identifica el snapshot completo. `scripts/content-publish.mjs` calcula su SHA-256 y `baseRevision` evita promover un borrador basado en otro snapshot. Los datos publicados no guardan una revisión por palabra ni un historial de revisiones por palabra. HSK 1 y Extra se incluyen en la app. Los paquetes de HSK 2 a 6 se instalan por separado, según `src/data/vocabulary.ts`. La ausencia de un paquete no demuestra que su contenido se haya retirado.

Los caracteres no tienen un campo de ID. `progressStore` guarda el progreso de trazos con el propio carácter como clave. Las listas de caracteres son `src/data/hsk1.json` y `public/packs/hsk2.json` a `hsk6.json`, y `characterStore` añade a cada fila la glosa y el ejemplo de `src/data/glosses/*.json` cuando la fila no los trae. Los trazos que corrigen el dibujo se cargan de forma asíncrona desde `public/strokes`, desde `public/packs/hskN/strokes` o desde `hanzi-writer-data@2.0.1` en jsDelivr.

## Contrato de identidad

Una referencia de aprendizaje contiene `contentId` y `contentRevision`, ambos strings no vacíos. `contentId` es exactamente el `id` publicado de la entrada. `contentRevision` identifica una versión inmutable de los datos con los que se formuló y evaluó la pregunta. Cada intento conserva ambos valores. El historial no sustituye una revisión antigua por la actual.

La primera publicación asigna el ID una sola vez. La regla `wordId` puede generar candidatos para entradas nuevas, pero no vuelve a calcular la identidad de una entrada publicada. El registro de IDs incluye HSK y Extra, conserva los retirados y prohíbe asignar un ID anterior a otra entrada. Una entrada representa una palabra con una lectura y sentidos editoriales relacionados. Dos lecturas distintas como 还 hái y 还 huán mantienen IDs distintos. Una corrección de un error en la lectura o en los sentidos conserva el ID si sigue siendo la misma entrada. Si la corrección descubre dos entradas distintas, se conserva el ID para la entrada original que el editor identifique y se asigna otro a la nueva. La decisión y la correspondencia requieren revisión editorial, no una comparación automática de texto. Este párrafo describe la regla que debe aplicar la fase 2C. Hoy el registro y los tests no la cumplen, como explica la última sección.

La revisión cambia cuando cambia cualquier dato que pueda alterar la pregunta, las respuestas aceptadas o su evaluación. El productor versiona las reglas de normalización y evaluación por separado mediante `evaluatorVersion`, que cada intento conserva junto a la referencia. Cambiar el evaluador no cambia por sí solo la revisión de la palabra. Cambios de tema o nivel no necesitan una revisión nueva. Algunas preguntas sí dependen de otras entradas y del nivel. `askGloss` en `src/domain/vocabulary/sessionDeck.ts` usa `levelRank` y los sentidos de otras palabras para decidir si añade el segundo sentido o una pista, y `pickChoices` elige las opciones entre otras palabras. Eso no exige incluir nivel ni catálogo en la revisión, porque cada intento guarda `Exercise.prompt` y `options` tal como se mostraron. Una corrección de lectura o sentidos sí la necesita. La revisión global del snapshot no sustituye esta revisión por entrada.

El traslado entre HSK y Extra conserva ID, revisión y progreso cuando no cambia el contenido evaluado. Retirar una entrada cambia su disponibilidad, no borra su identidad ni su historial. El catálogo futuro debe guardar un registro de retirada con el ID y el estado, y excluir la entrada de nuevas preguntas. No debe convertir una retirada en una respuesta incorrecta ni borrar intentos. Si una entrada vuelve a publicarse, recupera su ID y recibe una revisión nueva si cambia el contenido evaluado.

Cuando falta un paquete, el lector conserva referencias e intentos y declara el contenido temporalmente no disponible. No infiere una retirada ni genera una pregunta sin la revisión necesaria. La instalación del paquete permite resolver la referencia otra vez. Una revisión histórica que el dispositivo no tenga tampoco debe sustituirse silenciosamente por la revisión actual.

## Revisión provisional por entrada

`src/domain/learning/content/revision.ts` calcula la revisión en el cliente, de forma síncrona y sin dependencias. `contentReferenceForWord` devuelve el `id` de la palabra y su revisión. `contentReferenceForCharacter` devuelve `char-` seguido del código del carácter en hexadecimal, con la misma escritura que `wordId` usa para cada hanzi, y su revisión. Así 的 es `char-7684` y no puede coincidir con un ID de palabra, que siempre empieza por `word-`. `tests/learning/content/revision.test.ts` comprueba el contrato con los datos reales.

La forma canónica es un array JSON con posiciones fijas, precedido de su versión. Como la función elige cada campo por nombre, el orden de las claves del objeto de entrada no influye. Los textos se normalizan a NFC y se recortan, y las lecturas reducen cualquier secuencia de espacios a uno.

La forma `w1` de una palabra contiene estos datos:

- `simplified` y `traditional`. La tarjeta enseña el tradicional cuando difiere del simplificado.
- La lectura con cambios tonales.
- El `pos` del primer sentido. La tarjeta no lo muestra, pero `isFunctionWord` en `sessionDeck.ts` lo usa para preguntar al revés por partículas y clasificadores, así que decide qué pregunta se hace.
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

Esta revisión es provisional por tres motivos. Depende del código de la app, porque un cambio en `withToneSandhi` o en los archivos de glosas cambia revisiones sin una edición del contenido. No cubre la geometría de los trazos, que decide si un dibujo es correcto. Tampoco hay un archivo con las revisiones antiguas, así que un dispositivo solo puede calcular la revisión del contenido que tiene instalado.

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

## Cambios necesarios en una fase posterior

`docs/learning-system.md` asigna los cambios 1 a 3 al paquete 2C. Los cambios 4 y 5 dependen de las fases que guardan intentos y construyen preguntas.

1. Fase 2C. Ampliar el registro de IDs publicados a HSK y Extra, con estados de disponibilidad y retirada. Hoy `scripts/published-ids.mjs` solo lee `hsk1.json` a `hsk6.json`, y `published-ids.json` no contiene IDs de Extra. Incorporar los IDs existentes sin regenerarlos ni reutilizarlos.
2. Fase 2C. Cambiar `tests/vocabularyData.test.ts`. El caso `derives every word id from the hanzi and the raw reading` compara cada ID con `wordId(simplified, pinyin)`. Si se corrige la lectura de una palabra publicada y se conserva su ID, ese caso falla. También falla con los IDs que el editor genera ante una colisión, porque `catalogId` en `editor/lib/store.ts` añade `-2`, `-3` al ID calculado. La comprobación debe aplicarse solo a los IDs que no estén en el registro publicado y aceptar ese sufijo. El caso `covers exclusive levels 1–6 with stable identities` exige además que el ID empiece por los hanzi actuales, lo que impide corregir `simplified` y conservar el ID, así que debe limitarse igual. El mensaje de `keeps every published id in the catalog` pide migrar el progreso al corregir una lectura, y debe pedir en cambio conservar el ID. Hay que añadir pruebas de permanencia tras corregir lectura y sentidos, trasladar entre listas y retirar una entrada. El paquete 0C no modifica ese test.
3. Fase 2C. Cambiar el editor y la publicación para impedir que un ID publicado pase a representar otra entrada, conservar retiradas y publicar la revisión de cada entrada junto al contenido. La revisión publicada debe calcularse con `revision.ts` sobre los datos que verá el cliente, para que coincida con las revisiones `w1` y `c1` ya guardadas, o declarar una forma nueva. Publicar también el material de las revisiones antiguas para interpretar intentos anteriores. El control requiere una decisión editorial para divisiones o fusiones.
4. Fases 2A y 3. Guardar `contentId`, `contentRevision` y `evaluatorVersion` en cada intento con las funciones de `revision.ts`. Distinguir una revisión o un paquete ausente de una retirada. Decidir antes de conectar Trazos si la revisión `c1` debe incluir la versión de los datos de trazos, por ejemplo `hanzi-writer-data@2.0.1`, o un hash de sus archivos. Los caracteres fuera de HSK que muestra `characterOrWordStub` no tienen fila propia, y su glosa depende de las palabras que el alumno estudia. No deben recibir una referencia `c1` hasta que exista una regla para ellos. El progreso de trazos usa hoy el carácter como clave y deberá pasar a `char-<hex>`. No hay usuarios que migrar.
5. Fases 3 y 5. Probar preguntas con los pares de la tabla y la política de normalización elegida. Verificar que el contexto o el conjunto de respuestas aceptadas resuelva cada ambigüedad antes de contar una respuesta como incorrecta.
