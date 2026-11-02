# API local de ingesta

Servidor HTTP en Bun para montar datos de caracteres, generar borradores, guardar correcciones y publicar los JSON que usa la PWA. Solo escucha en `127.0.0.1`. La app no llama a este servidor; sigue leyendo `src/data/` y `public/packs/`.

Los `GET` leen disco. HanziDB y Google Translate entran solo cuando haces un `POST /levels/:level/ingest` con `fetch` o `translate`.

## Requisitos

- [Bun](https://bun.sh) instalado
- Repo clonado con listas HSK, trazos y (opcional) audio ya generados (`npm run media-packs`, etc.)

## Arranque

Desde la raíz del proyecto:

```bash
npm run content-api
```

O desde esta carpeta:

```bash
bun run dev    # recarga al guardar
bun run start  # una sola ejecución
```

Por defecto: `http://127.0.0.1:8787`. Otro puerto:

```bash
CONTENT_API_PORT=9000 bun run start
```

Comprobar que responde:

```bash
curl -s http://127.0.0.1:8787/health
```

## Datos en disco

| Ruta | Qué es |
| --- | --- |
| `src/data/hskN.json`, `public/packs/hskN.json` | Listas publicadas (la app las consume) |
| `src/data/glosses/hskN.json` | Sidecar de glosas (HSK 1 y 4–6) |
| `src/data/drafts/hskN.json` | Borrador automático (traducción, HanziDB, `stroke_count`) |
| `src/data/overrides/hskN.json` | Correcciones humanas; el generador no las pisa |

Prioridad al ensamblar y al publicar: **override** > **draft** > **base** (lista + sidecar).

La primera vez que tocas HSK 4–6, si no existe `drafts/hskN.json`, se copia el contenido del sidecar de glosas al draft. Eso no crea overrides.

Un override puede ser parcial. Solo bloquea los campos que envías:

```json
{
  "gloss": "pulsar; según",
  "example": { "es": "pulsar hacia abajo" }
}
```

## Flujo habitual

1. `POST /levels/6/ingest` con cuerpo vacío: rellena drafts con `stroke_count` desde los JSON de trazos.
2. `POST /levels/6/ingest` con `{ "fetch": true }`: tradicional y palabra de ejemplo desde HanziDB (respeta campos bloqueados por override).
3. `POST /levels/6/ingest` con `{ "translate": true }`: glosa y definición al español en draft (solo HSK 4–6; no pisa overrides).
4. `GET /levels/6/review`: filas con banderas de revisión.
5. `PUT /characters/按` con el parche que quieras fijar.
6. `POST /levels/6/publish`: escribe los JSON que instala la app.

Tras publicar HSK 2–6, conviene `npm run search-index` si cambiaste textos de búsqueda. Los MP3 no los copia esta API; sigue siendo `npm run media-packs`.

## Rutas

En las URLs, el carácter va codificado (UTF-8). Ejemplo: 哀 → `%E5%93%80`.

### `GET /health`

Estado del servidor.

```bash
curl -s http://127.0.0.1:8787/health
# {"ok":true}
```

### `GET /characters/:char`

Devuelve un objeto ensamblado:

- `character`: fila merged (mismo shape que en la app)
- `provenance`: de dónde sale `gloss` y cada campo de `example` (`base`, `draft`, `override`)
- `locked`: qué campos tienen override y no se retraducen
- `flags`: problemas detectados (ver tabla abajo)
- `media`: trazo en disco, clip de la sílaba de cita (`f` / `m` / `c`)

```bash
curl -s "http://127.0.0.1:8787/characters/%E5%93%80" | jq '.character, .flags, .media'
```

404 si el carácter no está en ninguna lista HSK 1–6.

### `GET /levels/:level/review`

Lista solo entradas con al menos una bandera. `:level` es 1–6.

```bash
curl -s "http://127.0.0.1:8787/levels/4/review" | jq '.count'
```

Respuesta: `{ "level", "count", "items": [ …AssembledCharacter ] }`.

### `PUT /characters/:char`

Fusiona un parche en `src/data/overrides/hskN.json` (nivel inferido del carácter).

Cuerpo JSON (todos opcionales):

```json
{
  "gloss": "string",
  "definition": "string",
  "example": {
    "word": "按下",
    "pinyin": "àn xià",
    "es": "pulsar hacia abajo"
  }
}
```

```bash
curl -s -X PUT "http://127.0.0.1:8787/characters/%E6%8C%89" \
  -H 'Content-Type: application/json' \
  -d '{"gloss":"pulsar; según","example":{"es":"pulsar hacia abajo"}}'
```

### `DELETE /characters/:char`

Quita el override entero de ese carácter.

```bash
curl -s -X DELETE "http://127.0.0.1:8787/characters/%E6%8C%89"
```

### `POST /levels/:level/ingest`

Actualiza `src/data/drafts/hskN.json` para todas las filas del nivel.

Cuerpo opcional:

| Campo | Efecto |
| --- | --- |
| (vacío) | Solo disco: `stroke_count` desde `public/packs/hskN/strokes/` (o `public/strokes/` en HSK 1) |
| `"fetch": true` | Página HanziDB: tradicional, palabra y pinyin de ejemplo |
| `"translate": true` | EN→ES en draft (glosa, definición, `example.es`). **Solo HSK 4–6.** Rechazado en 1–3 |

No escribe overrides. No llama a la red salvo que pidas `fetch` o `translate`.

```bash
# Solo trazos / stroke_count en draft
curl -s -X POST http://127.0.0.1:8787/levels/6/ingest

# HanziDB + traducción (HSK 6)
curl -s -X POST http://127.0.0.1:8787/levels/6/ingest \
  -H 'Content-Type: application/json' \
  -d '{"fetch":true,"translate":true}'
```

Respuesta: `{ "level", "characters", "updated" }` (`updated` = filas cuyo draft cambió).

### `POST /levels/:level/publish`

Mezcla base + draft + override y escribe en disco.

| Nivel | Archivos |
| --- | --- |
| 2–3 | `public/packs/hskN.json` (overrides + `stroke_count` mecánico del draft) |
| 4–6 | `public/packs/hskN.json`, `src/data/hskN.json`, `src/data/glosses/hskN.json` |
| 1 | 404 (no soportado) |

```bash
curl -s -X POST http://127.0.0.1:8787/levels/6/publish
```

Respuesta: `{ "level", "characters", "paths": [ … ] }`.

## Banderas de revisión (`flags`)

Reglas mecánicas, no juicio de un modelo.

| Flag | Significado |
| --- | --- |
| `stroke_count_zero_with_strokes` | Hay JSON de trazos pero `stroke_count` sigue en 0 en la fila merged |
| `stroke_file_missing` | No hay fichero de trazos para ese carácter en el pack |
| `definition_english` | La definición empieza en inglés |
| `gloss_trailing_comma` | Glosa termina en `,` o `，` |
| `gloss_trailing_ellipsis` | Glosa termina en `…` o `...` |
| `example_es_equals_gloss` | `example.es` es idéntico a la glosa |
| `example_word_missing_char` | La palabra de ejemplo no contiene el carácter |
| `citation_audio_missing` | Falta el MP3 de la sílaba de cita en alguna voz (`f`, `m`, `c`) |

El audio es por **sílaba** (p. ej. `āi` → `public/audio/f/ai.mp3`), no un archivo por carácter.

## Tests

```bash
cd api && bun test
```

Cubren clave de sílaba, merge override/draft/base y banderas.

## Errores

Las respuestas de error son JSON: `{ "error": "mensaje" }` con el código HTTP habitual (400, 404).
