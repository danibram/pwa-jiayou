# Palabra y carácter: normas de las dos vistas

La app tiene dos fichas de consulta. La página de palabra (`/palabras/<id>`) y el drawer de carácter, que se abre desde una palabra, la búsqueda o Trazos. Cada una responde a una pregunta distinta y no repite la de la otra.

Qué se descarga y qué lee cada pantalla está en [como-funciona.md](como-funciona.md).

## Normas comunes

1. Una sección aparece solo si tiene datos. Nunca se muestra "sin sinónimos" ni una lista vacía.
2. Cada sección empieza con una etiqueta en versalitas (`eyebrow`) y, si hace falta, una línea que diga para qué sirve. Dentro de una sección, los grupos (Sinónimos, Otro tono) llevan una etiqueta pequeña en `text-xs font-medium`. No hay más niveles de texto.
3. Todo hanzi visible se puede tocar, también los de la frase. Una palabra abre su página; un carácter abre su drawer.
4. El color de tono es exclusivo del pinyin. Jade marca el radical. Sello marca error o un aviso de confusión. El sello de estado de la card usa los colores de estado de toda la app (rojo de sello para lo que pide acción, oro aprendiendo, jade dominada). Oro no se usa en estas vistas. Para resaltar una palabra o un carácter dentro de otro texto se usa tinta plena frente a tinta tenue, o un subrayado, nunca un color.
5. Cada palabra guarda sus usos como datos: `senses`, una lista de `{ pos, text, note }` (`src/data/wordSenses.ts`). `pos` es una categoría de una lista cerrada (sustantivo, verbo, adjetivo, adverbio, clasificador, pronombre, numeral, preposición, conjunción, partícula, interjección, expresión). `text` es lo que se enseña, sin paréntesis. `note` dice cómo se usa. La página de palabra los muestra todos. Las tarjetas de repaso, las listas y las fichas pequeñas muestran el `text` del primer uso (`leadSense`), que no pasa de 80 caracteres. Ninguna vista analiza texto para sacar la categoría o la nota.
6. Los datos editoriales (relaciones y frases del editor) y los calculados (familia, sílabas parecidas, radical) van en secciones separadas. La única excepción es Fácil de confundir, que se suma a Suena parecido con borde sello.
7. Cada tipo de relación tiene su forma visual. Una lista de filas idénticas para cosas distintas no enseña la diferencia.
8. Una palabra aparece una sola vez por página. Si ya está en Palabras cercanas, no se repite en Suena parecido.
9. Las dos vistas solo enseñan palabras de las listas activas y caracteres de los niveles HSK activos. Una palabra de una lista apagada no sale en ninguna sección, aunque esté descargada, y su página no se abre. En esta página, "catálogo" quiere decir lo que el alumno estudia ahora.

## Página de palabra

Responde a: qué significa esta palabra, cómo suena, cómo se usa y con qué no debo confundirla.

Orden fijo:

| # | Sección | Contenido | Origen |
| - | ------- | --------- | ------ |
| 1 | Ficha | Solo la palabra: caracteres en cuadrícula, pinyin y forma tradicional. En la esquina, un sello con el estado (新 nueva, 复 para repasar hoy, 学 aprendiendo, 熟 dominada) que al tocarlo dice qué significa. Sin significado en la card | Catálogo y progreso |
| 2 | Significados | Justo debajo de la card, sin título visible. Todos los usos de `senses`, agrupados por categoría seguida (Verbo, Sustantivo), uno por línea. El primer uso va más grande. La nota de cada uso va detrás, entre paréntesis y en tinta tenue | Editor |
| 3 | Acción | Aprender, Repasar o Practicar | Progreso |
| 4 | En una frase | Frase con la palabra en tinta plena y subrayada, el resto en tinta tenue, y su traducción. Cada carácter abre su drawer | Editor |
| 5 | Palabras cercanas | Sinónimos (≈ delante del hanzi), antónimos como pareja (esta palabra en tinta tenue y sin glosa ↔ la contraria con su glosa), clasificador como la frase que se dice (一 本 书) y relacionadas como fichas | Editor |
| 6 | Suena parecido | Palabras de las listas activas con las mismas sílabas sin tono, hasta nueve, en fichas pequeñas centradas de tres columnas. La forma no cambia con el número de fichas y no se parece a la de la familia. Grupos en este orden: Fácil de confundir (editor), Suena igual, Otro tono | Calculado y editor |
| 7 | Cómo se forma | Por cada carácter, una fila (glifo, pinyin, glosa) que abre su drawer y, debajo, colgando de una línea, hasta cuatro palabras de las listas activas que lo comparten. No cuentan la palabra que es solo ese carácter ni las que ya salen más arriba. En una palabra de un carácter la ficha ya es el carácter: la sección se llama El carácter y su fila muestra lo que la ficha no dice (el radical en jade, su significado y el número de trazos) antes de la lista Palabras con X | Calculado |

La ficha muestra la forma tradicional de la palabra entera. El radical, los trazos y la forma tradicional de cada carácter están en el drawer, a un toque.

## Drawer de carácter

Responde a: cómo está hecho este carácter, cómo suena y qué palabras construye.

Orden fijo:

| # | Sección | Contenido |
| - | ------- | --------- |
| 1 | Cabecera | Glifo animado con el radical en jade, pinyin con audio, glosa, sentidos secundarios, estado si ya lo estudias, trazos y forma tradicional |
| 2 | Radical | Tarjeta con el glifo del radical, su pinyin y significado, y hasta seis caracteres de los niveles HSK activos que lo llevan, de nivel más bajo primero |
| 3 | Palabras con X | Hasta seis palabras de las listas activas en una tarjeta: la propia palabra primero, después las de nivel más bajo. Sin la palabra desde la que se abrió |
| 4 | Suena parecido | Caracteres de los niveles activos con la misma sílaba: hasta seis con el mismo tono y ocho con otro tono, como fichas pequeñas |
| 5 | Acción | Ver trazos y escribirlo, o descargar el nivel |

El drawer no muestra relaciones de palabra ni frases. Un sinónimo es una propiedad de la palabra, no del carácter.

## Suena parecido en las dos vistas

Es el mismo concepto con dos alcances. En la página de palabra compara palabras de las listas activas con el mismo número de sílabas (时间 y 实践). En el drawer compara caracteres sueltos, incluidos los que no son palabra por sí solos (必, 毕). En una palabra de un carácter las dos listas se parecen. La página enseña las palabras que se pueden confundir al oír una frase; el drawer enseña los caracteres que se pueden confundir al escribir pinyin.

## Pendiente

El tono 3 (verde oliva) y el radical (jade) son dos verdes. En el drawer, "nǚ" en tono 3 queda junto al 女 en jade. Hay que separar uno de los dos colores en toda la app, no solo en estas vistas.
