# Editor de contenidos

Herramienta de escritorio para editar el vocabulario, los caracteres y los temas de Jiāyóu. Funciona en el navegador, guarda borradores locales y promueve cada borrador a la siguiente versión del contenido escribiendo los archivos del repo. No toca el código de la app.

## Abrir el editor

Desde la raíz del repo, con sus dependencias instaladas:

```bash
npm --prefix editor run dev
```

Abre `http://127.0.0.1:4318`. El comando copia `content/snapshot.json`, `content/version.json` y la fuente WenKai a `editor/public/base/` y arranca Vite. El mismo servidor atiende la promoción; sin él, el editor solo puede descargar archivos.

## Editar

- **Palabras**: busca por chino, pinyin o traducción, filtra por nivel HSK y corrige la lectura, la traducción y los temas. En la ficha, el pinyin se edita sílaba a sílaba con su tono (o como texto, para lecturas con erhua) y los temas son fichas que se marcan con un clic. La escritura de una palabra publicada no cambia. "Lista" elige entre Extra y HSK 1 a 6, también para palabras publicadas: el identificador se conserva, así que el progreso sigue. "Nueva palabra" crea la entrada en el nivel del filtro activo, la pone arriba de la lista con la etiqueta "Nueva" y, si esa palabra ya existe, muestra sus datos con un botón para editarla en vez de duplicarla. El filtro Extra muestra las palabras sin nivel.
- **Caracteres**: significado breve, definición y ejemplo (palabra, pinyin y traducción van juntos).
- **Temas**: nombre, carácter representativo, caracteres como fichas (pega varios de golpe) y palabras del tema con búsqueda, filtro "solo asignadas" y asignación en bloque. Un tema nuevo toma su identificador del nombre hasta que se publica. Cada tema necesita al menos cinco caracteres de las listas.
- Las flechas recorren la lista activa. El borrador se guarda solo un momento después de cada cambio; Cmd+S lo guarda al instante. Un punto dorado marca las entradas modificadas.

"Guardar borrador" conserva el trabajo en este navegador. "Exportar borrador" descarga una copia que puedes importar en otro. Si el navegador no permite guardar o el borrador corresponde a otra versión de la base, el editor muestra el error y permite descargar la copia guardada antes de descartarla.

## Revisar y promover

Revisar muestra una entrada cada vez con las columnas Publicado y Propuesta. Puedes filtrar por HSK 1 a 6 o Extra, elegir palabras, caracteres o temas, y buscar en el texto anterior y propuesto. El filtro usa el nivel del borrador. Anterior y Siguiente recorren las entradas visibles; Editar ficha abre la entrada seleccionada.

La comparación incluye traducciones, frases propias y relaciones, como sinónimos y antónimos. Las frases y relaciones sin cambios aparecen en Se conserva. Un borrador puede incluir frases de referencia por palabra; el editor las muestra al revisar y no las publica.

Promover publica el borrador completo, aunque la lista de revisión esté filtrada.

"Revisar" muestra cada cambio campo a campo, los archivos del repo que se escribirán y la versión actual del contenido junto a la siguiente. Escribe qué cambia en esta versión y pulsa "Promover a la versión N". El servidor de desarrollo entonces:

1. Valida el borrador contra `content/snapshot.json` (identificadores, niveles, temas, ejemplos).
2. Escribe los archivos afectados en sus rutas del repo: `src/data/vocabulary/hskN.json`, `src/data/topics.ts`, `src/data/hsk1.json`, `public/packs/hskN.json`, `src/data/hskN.json`, las glosas de `src/data/glosses/` y `content/snapshot.json`.
3. Sube `content/version.json` (número, fecha y notas) y regenera `src/data/searchIndex.json` si cambió algún carácter.
4. Refresca `editor/public/base/` y vacía el borrador local, de modo que el editor parte de la nueva base.

Después, revisa el diff con git, haz commit y despliega. La app muestra la versión del contenido en Opciones y, como los datos van en el build, ofrece la actualización con su aviso habitual a quien la tenga instalada. Las listas HSK 2 a 6 se sirven desde `public/packs/`, cuyo hash entra en el nombre de la caché, así que una lista corregida se vuelve a descargar.

Sin servidor (por ejemplo, el build estático de `editor/dist/`), "Prefiero descargar el archivo" guarda `jiayou-publicacion.json`. Desde la raíz del repo:

```bash
npm --prefix editor run promote -- /ruta/jiayou-publicacion.json --notes "Qué cambia"
```

`npm --prefix editor run export -- archivo.json` sigue existiendo: genera los mismos archivos en `editor/export/` sin tocar el repo.

## Compatibilidad actual

Las correcciones de vocabulario HSK, caracteres y temas se promueven con los formatos actuales del proyecto. Una palabra nueva en un nivel HSK toma el identificador de catálogo (caracteres y lectura) y entra en `src/data/vocabulary/hskN.json`. Los recuentos por nivel de la app salen de esas listas. Las palabras en Extra van a `src/data/vocabulary/extra.json`. En la app, Extra es una lista de estudio más, junto a HSK 1 a 6, y aparece siempre en el selector de listas, aunque esté vacía: quien la marca recibe las palabras que traigan las siguientes versiones. Todo el vocabulario de la app sale del editor: el alumno no crea ni corrige palabras.

Los generadores antiguos (`build-vocabulary`, `localize-hsk`, `fetch-hsk`) reconstruyen datos desde sus fuentes externas y pueden pisar correcciones. Revisa el diff si los ejecutas después de promover.

## Comprobaciones y distribución

```bash
npm --prefix editor test
npm --prefix editor run build
npm --prefix editor run preview
```

El build genera una web estática en `editor/dist/`. Sirve para editar y descargar borradores; promover requiere el servidor de desarrollo.
