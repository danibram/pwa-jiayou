# Preparar un borrador desde TongTong

El script lee las listas públicas de [TongTong](https://www.tongtong.app/es/dictionary/hsk/1), sigue su paginación y cruza cada entrada con el catálogo local por escritura y pinyin, incluidos los tonos. Extrae definiciones de las listas y consulta fichas para obtener relaciones y frases de referencia. No modifica el contenido publicado.

Requiere las dependencias del proyecto instaladas con `npm ci`. Usa `jsdom`, que ya está en el proyecto, y no necesita navegador ni credenciales.

## Primera descarga

Para preparar una muestra con una ficha por nivel solicitado:

```sh
npm run scrape-tongtong -- --levels 2,3,4,6 --example-levels 2,3,4,6 --max-pages 1 --details-per-level 1
```

Para recorrer todas las listas y consultar hasta cinco fichas por nivel:

```sh
npm run scrape-tongtong
```

Por defecto compara traducciones de palabras y caracteres locales de HSK 4, 5 y 6, y consulta fichas para palabras locales de HSK 2 a 6. Los niveles de TongTong pueden diferir de los del proyecto. Por eso consulta las listas 1 a 6 y conserva los niveles, identificadores y pronunciaciones locales. El nivel de la palabra no certifica la dificultad de toda la frase. Las relaciones y frases cubren la muestra de fichas consultadas, no todo el catálogo.

La ejecución completa puede tardar horas. El script respeta los 30 segundos entre peticiones indicados para rastreadores genéricos en [robots.txt](https://www.tongtong.app/robots.txt). Guarda cada página y su fecha en `.cache/tongtong/`. Se puede interrumpir y repetir el comando para continuar con las páginas ya descargadas. Ejecuta un solo proceso por caché.

## Revisar traducciones

La salida queda en `.cache/tongtong/output/`:

- `report.json` compara el texto actual con cada propuesta y conserva su URL. Incluye entradas sin coincidencia, relaciones propuestas, relaciones sin destino local, errores y páginas consultadas. `exampleCounts` cuenta las fichas consultadas por nivel.
- `draft.json` contiene la instantánea propuesta, su revisión de origen y las referencias de las fichas consultadas.
- `examples.json` contiene una frase de referencia por forma escrita. No es un archivo listo para publicar; el borrador conserva las referencias por identificador y lectura.
- `example-sources.json` registra la URL, fecha de descarga, pinyin de la frase y nivel local.

Abre `draft.json` con Importar en el editor. En Revisar puedes filtrar por nivel propuesto, tipo de entrada o texto, y recorrer las entradas con Anterior y Siguiente. La tabla compara Publicado y Propuesta por campo. Las frases y relaciones que no cambian aparecen en Se conserva. Editar ficha abre la palabra o carácter correspondiente.

Las propuestas de TongTong para palabras llegan como usos (`senses`): `scripts/word-senses.mjs` separa cada uso, su nota entre paréntesis y la categoría cuando TongTong la escribe ("(verbo)"). Los usos sin categoría salen como "Sin categoría" en el editor, donde se asigna antes de publicar. Revisa los sentidos antes de publicar. La coincidencia de escritura y pronunciación no garantiza que todos los sentidos de una definición sean adecuados para la tarjeta. Las glosas de caracteres usan el primer segmento separado por punto y coma, sin cortar palabras. Las entradas ambiguas o sin coincidencia quedan en el informe; el script no deduce significados de caracteres a partir de palabras compuestas.

Los filtros solo cambian lo que se ve en Revisar. Promover publica todo el borrador.

Para exportar los archivos que cambiaría un borrador sin publicarlos:

```sh
node scripts/content-publish.mjs import .cache/tongtong/output/draft.json
```

El editor y `content-publish.mjs` comprueban que el borrador corresponda a la revisión actual de `content/snapshot.json`. Si el contenido ha cambiado, vuelve a generar el borrador desde la caché. No copies solo las traducciones a los JSON de vocabulario, porque el editor mantiene una instantánea canónica y los caracteres tienen varios archivos derivados.

## Frases y relaciones

Las frases literales de TongTong quedan en `draft.references`, separadas de `draft.snapshot`. La UI las muestra bajo Referencias de TongTong. Guardar, exportar e importar un borrador conserva estas referencias, pero la publicación no las copia al vocabulario de la aplicación. La opción `--apply-examples` se ha retirado.

Para añadir una frase propia, abre Editar ficha y rellena Frase en chino y Traducción de la frase. La propuesta se guarda en `VocabularyEntry.example`, se compara en Revisar y se publica con la palabra. El valor `null` elimina una frase, incluso si procedía del archivo antiguo `src/data/vocabulary/examples.json`; omitir el campo conserva ese ejemplo antiguo.

El script solo propone relaciones que la ficha identifica como Sinónimos, Antónimos, Palabras relacionadas o Clasificadores. Excluye Fácil de confundir porque la app ya calcula vecinos de pronunciación. Una similitud visual o fonética no se convierte en sinónimo. El destino debe tener una sola coincidencia de escritura y pinyin en el catálogo. Las relaciones simétricas se añaden en ambos sentidos, sin duplicar las existentes; los clasificadores son unidireccionales. El script no presupone que todas las fichas tengan sinónimos.

Las cuatro frases de muestra para `比`, `啊`, `抱歉` y `恶心` se redactaron de nuevo después de revisar la importación. En `example-sources.json`, `exampleStatus` marca esa redacción y `sourceNote` limita la atribución a la consulta léxica; `sourcePinyin` conserva el pinyin del ejemplo importado para poder distinguirlo del pinyin de la frase actual. La URL y la fecha documentan qué ficha se consultó, no el origen de la redacción nueva.

Para volver a procesar la misma muestra sin acceder a la red:

```sh
npm run scrape-tongtong -- --levels 2,3,4,6 --example-levels 2,3,4,6 --max-pages 1 --details-per-level 1 --offline
```

La selección de fichas sigue el orden del catálogo local. El modo `--offline` falla si alguna página necesaria no está en la caché. Usa `--details-per-level 0` para regenerar solo las propuestas de traducción. `--examples-per-level` sigue disponible como alias de `--details-per-level`.

`--levels`, `--translation-levels` y `--example-levels` aceptan listas de números separados por comas. `--max-pages 0` recorre todas las páginas; cualquier otro valor limita cada lista. `--refresh` renueva la caché. `--cache-dir` y `--out` cambian los directorios de trabajo.

Si una descarga falla, el script guarda el informe y los resultados parciales y termina con código de error. `report.incomplete` también indica si el límite de páginas ha dejado listas sin terminar. Las cantidades `requested` y `added` muestran los niveles donde faltan fichas. Las páginas que no están en español, las fichas con otra pronunciación y los ejemplos incompletos causan un error.

## Comprobaciones

```sh
node --test scripts/scrape-tongtong.test.mjs
```

Las pruebas cubren paginación, pronunciaciones distintas, frases segmentadas en HTML, datos incompletos, conservación de contenido, caché, reanudación y respuestas HTTP con `Retry-After`.
