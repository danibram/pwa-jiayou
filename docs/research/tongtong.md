# Qué aprovechar de Tongtong en Jiayou

Revisión del 3 de noviembre de 2026. Comparación de páginas públicas con el código de Jiayou. Las propuestas son decisiones de producto, no resultados experimentales.

## Qué pude comprobar

- El [diccionario público](https://www.tongtong.app/dictionary) ofrece acceso por frecuencia, nivel HSK y tema, además de búsqueda por hanzi, pinyin o inglés.
- La [sección de gramática](https://www.tongtong.app/grammar) agrupa explicaciones por nivel y destaca palabras que se confunden. La [ficha de posesión con 的](https://www.tongtong.app/grammar/expressing-possession-with-de) reúne una estructura, ejemplos y un enlace a la palabra.
- La [portada](https://www.tongtong.app/) anuncia diagnóstico inicial, frecuencia de palabras, historias ajustadas al vocabulario conocido y FSRS para repasar junto con IRT para estimar nivel. Muestra una lectura con pinyin y traducción. No probé estas funciones dentro de una cuenta; sus promesas de eficacia quedan sin verificar.
- El lector web no recuperó el acceso, el blog ni algunas fichas. Eso no demuestra que fallen en un navegador.

## Punto de partida de Jiayou

El README describe un piloto obsoleto. [El catálogo](../../src/data/vocabulary.ts) carga 4.992 entradas HSK 2.0. Tongtong anuncia HSK 3.0, así que los tamaños no son directamente comparables. El modelo local no incluye frases. En [VocabularyReview](../../src/pages/VocabularyReview.tsx), `relatedWord` ofrece otra palabra con un carácter compartido como ejemplo.

[El orden de aprendizaje](../../src/utils/wordOrder.ts) usa el rango del carácter menos frecuente de cada palabra y entrelaza niveles. Eso no equivale a medir la frecuencia de la palabra completa. [El calendario](../../src/domain/progress/schedule.ts) aplica intervalos iniciales de uno y tres días y después los ajusta por facilidad; no usa FSRS.

## Propuestas por prioridad

### 1. Enseñar cada palabra dentro de una frase

Empezaría por 20 palabras HSK 1 y 2 con una frase propia revisada, traducción al español, pinyin ocultable y audio completo. La tarjeta mostraría la frase al revelar la respuesta. Tocar una palabra abriría su significado sin abandonar el ejercicio.

La ficha gramatical de Tongtong aporta una referencia concreta para conectar palabra, estructura y ejemplo. Jiayou puede añadir comparaciones breves cuando dos palabras suelen confundirse, con ejemplos propios revisados. Esto completa el objetivo de aprender palabras con ejemplos que ya fija [CONTEXT.md](../../CONTEXT.md).

### 2. Ordenar por frecuencia de palabras

Mantendría las listas y temas elegidos por el usuario, pero ordenaría las palabras nuevas de cada selección con un rango de frecuencia de palabras documentado. El diccionario de Tongtong permite explorar precisamente ese criterio. No trasladaría sus rangos sin conocer corpus, licencia y tratamiento de significados distintos.

Compararía las primeras 50 palabras de ambos órdenes para revisar su utilidad en las situaciones que queremos enseñar.

### 3. Ofrecer un diagnóstico inicial opcional

Para Jiayou probaría unas 15 preguntas y una opción para empezar desde cero. El resultado sugeriría listas y priorizaría palabras nuevas. Reconocer una palabra no la marcaría como dominada; los repasos posteriores tendrían que confirmar ese conocimiento.

### 4. Añadir microlecturas después de las frases

Probaría cinco textos de cuatro a seis frases que reutilicen esas 20 palabras, con audio y consulta de vocabulario. Cada texto tendría sus palabras identificadas para compararlas con el progreso del alumno. Mostraría cuántas ha estudiado y cuáles son nuevas, sin equiparar ese recuento con comprensión.

Tongtong anuncia historias adaptadas al vocabulario conocido. Para Jiayou, empezar con textos revisados permitiría comprobar el flujo antes de generar contenido o ampliar la biblioteca. [La estrategia existente](../vision/strategy.md) ya contempla una primera lectura dentro del modo historia; conviene integrar ambos planes.

### 5. Evaluar FSRS cuando tengamos datos de repaso

La página de Tongtong no permite concluir que FSRS mejoraría nuestro calendario. Jiayou conserva progreso agregado. Primero añadiría un historial con fecha, nota y tipo de repaso. Después compararía carga diaria y aciertos posteriores, preservando vencimientos y copias de seguridad durante la migración.

## Qué dejaría fuera por ahora

No priorizaría ampliar el catálogo para igualar el tamaño anunciado, añadir ligas ni introducir ventajas de pago en la puntuación. Jiayou tiene vocabulario suficiente para probar el aprendizaje en contexto. Tomaría ideas de formato y escribiría contenido propio revisado.

Elegiría primero las 20 palabras con frases y después las cinco microlecturas. Observaría comprensión, consultas repetidas y recuerdo posterior antes de ampliar el contenido. Esta revisión no cambia el funcionamiento de la app.
