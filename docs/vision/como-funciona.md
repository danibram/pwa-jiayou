# Cómo funciona la app

Jiayou enseña palabras chinas a hispanohablantes. Las palabras vienen de las listas HSK 2.0 (niveles 1 a 6) y de la lista Extra, que se cura en el editor de contenidos. Cada palabra tiene su página y cada carácter su drawer; las normas de esas dos vistas están en [palabra-y-caracter.md](palabra-y-caracter.md).

## Solo se usa lo que activas

El alumno elige en Home (o en Opciones, Elegir niveles) qué listas estudia. La app descarga y usa solo esas listas. Ninguna pantalla enseña una palabra de una lista apagada, ni en Hoy, ni en Buscar, ni en Temas, ni en la ficha de una palabra, ni en el drawer de un carácter.

Hay una sola excepción. Temas lista también las palabras de Extra que tienen tema aunque Extra esté apagada, para que un tema no se quede sin sus palabras fuera de HSK. Buscar no las muestra hasta que se activa Extra.

## Qué trae la app y qué se descarga

| Contenido | Dónde vive | Cuándo llega |
| --- | --- | --- |
| Palabras de HSK 1 y de Extra | En el JS de la app (`src/data/vocabulary/hsk1.json`, `extra.json`) | Siempre, con la app |
| Palabras de HSK 2 a 6 | `packs/hskN/words.json`, servido desde `src/data/vocabulary/hskN.json` | Al activar esa lista |
| Caracteres de HSK 1 | En el JS (`src/data/hsk1.json`) | Siempre |
| Caracteres de HSK 2 a 6 | `public/packs/hskN.json` | Cuando lo necesitan las palabras activas |
| Trazos y audios | `public/packs/hskN/strokes`, `public/packs/hskN/audio`, `public/audio` | Solo los de las palabras activas, en segundo plano |
| Cuántas palabras tiene cada nivel | Contado al compilar (`__WORD_COUNTS__` en `vite.config.ts`) | Siempre, para que el selector diga el tamaño antes de descargar |

Las listas de palabras y las de caracteres no van por el mismo nivel. Las palabras de HSK 3 usan caracteres de HSK 2 y de HSK 4, y cinco palabras de HSK 1 usan caracteres de HSK 2. Por eso activar HSK 1 descarga la lista de caracteres de HSK 2 (unos 9 KB), pero no sus palabras. De sus trazos y audios solo baja lo de los caracteres que aparecen en palabras de HSK 1.

## Activar y desactivar una lista

Al activar una lista, `prepareListMedia` (`src/utils/levelPacks.ts`) hace esto, en orden:

1. Descarga las palabras de la lista (`loadLevelWords`). Si falla una, las demás siguen y el error se avisa al final.
2. Mira qué caracteres usan las palabras activas y descarga las listas de caracteres de esos niveles.
3. Guarda los trazos y audios de esos caracteres, seis a la vez, con una barra de progreso en Home.

Desactivar una lista en Home la quita del estudio al momento. Sus archivos siguen en el dispositivo hasta el siguiente cambio en Elegir niveles (`applyListChoice`), que borra las palabras de las listas apagadas y los packs que ya no usa ninguna palabra activa, también los que quedaron a medias por una descarga fallida. El progreso de una palabra no se borra al apagar su lista: vuelve tal cual al activarla otra vez.

## Arranque y uso sin conexión

Antes de pintar la primera pantalla, `src/index.tsx` carga las palabras de las listas activas desde la caché (`loadSelectedWords`). Así un enlace a `/palabras/<id>` o una sesión a medias encuentran su palabra. La espera dura como mucho un segundo y medio. Si la red va lenta, por ejemplo tras una actualización que cambia un pack, la app abre igual y las palabras aparecen al llegar. Si no hay red, abre con lo que tenga y reintenta la descarga cuando vuelve la conexión.

Un enlace a la página de una palabra cuya lista está apagada abre la lista de Palabras de las listas activas.

Cada pack tiene su caché, con el hash de sus archivos en el nombre (`jiayou-pack-hsk4-<hash>`). Las palabras de un nivel forman parte de su pack, así que un cambio en ellas cambia el hash de ese pack y de ningún otro. Si una actualización no se puede descargar, la app usa la copia anterior marcada como antigua y la cambia en cuanto hay red.

El service worker precachea el JS, el CSS, las fuentes y los trazos de HSK 1. Los packs quedan fuera de la precaché (`globIgnores` en `vite.config.ts`), porque solo se descargan si se activan.

## Qué lee cada pantalla

| Pantalla | De dónde saca las palabras |
| --- | --- |
| Hoy y repaso | Las listas activas (`vocabularyStore.getSelectedWords`) |
| Buscar | Palabras de las listas activas y caracteres de los niveles HSK activos. Debajo del buscador dice en qué listas busca ("en HSK 1 y 6") |
| Temas | Las listas activas, más las palabras de Extra con tema |
| Página de palabra | Solo abre palabras de las listas activas (`findSelectedWord`). Palabras cercanas, Suena parecido y Cómo se forma también salen de ahí |
| Drawer de carácter | Palabras con X y Suena parecido salen de las listas activas; el radical muestra caracteres de los niveles HSK activos |
| Trazos | Un tema enseña los caracteres de los niveles activos y los de sus palabras de Extra. Un carácter suelto, abierto desde un drawer, se puede practicar aunque su nivel esté apagado |

## Lo que aún no sigue la regla

`src/data/searchIndex.json` (unos 650 KB) y las glosas de HSK 4 a 6 (`src/data/glosses/`) van en el JS con los caracteres de todos los niveles. Las pantallas ya no listan caracteres de niveles apagados, pero el índice se usa para dar el pinyin y la glosa de un carácter suelto, por ejemplo el de un radical. Pasarlo a los packs de caracteres quitaría más de la mitad del JS que queda.

## Comprobarlo

- `tests/activeLists.test.tsx` comprueba que Buscar, Temas, la página de palabra y el drawer solo usan las listas activas.
- `tests/levelPacks.test.ts` comprueba que la app trae solo HSK 1, que activar HSK 2 descarga un único `words.json` en la caché de su pack, que se lee sin red al arrancar y que desaparece al desactivar la lista.
- En el navegador: borrar datos del sitio, empezar con HSK 1 y mirar la pestaña de red. No debe aparecer ningún `words.json`. Al marcar HSK 6 en Home aparece `packs/hsk6/words.json` y nada más de palabras.
