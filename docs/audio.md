# Actualizar las voces

Dos fuentes. Cada una tiene un script. Vuelve a lanzarlo cuando el origen publique archivos nuevos. Los dos reescriben `apps/web/public/audio/NOTICE.txt`.

## Mujer y hombre, CNS11643

Licencia: cláusula de datos abiertos del gobierno de Taiwán, versión 1. Hay que citar 數位發展部，CNS11643中文標準交換碼全字庫網站, https://www.cns11643.gov.tw

El zip de las voces está en el listado de https://www.cns11643.gov.tw/opendata/release.txt

```bash
curl -L -o /tmp/Voice.zip https://www.cns11643.gov.tw/opendata/Voice.zip
python3 scripts/copy-cns-audio.py /tmp/Voice.zip
```

Eso deja en `apps/web/public/audio/f` y `apps/web/public/audio/m` solo las sílabas que usa la app, en MP3 mono, y regenera `apps/web/src/data/syllable-clips.json`. Incluye HSK 1–6 (lee `apps/web/src/data/hsk*.json` y `apps/web/public/packs/hsk*.json`).

Después, reparte esos clips por nivel:

```bash
npm run media-packs
```

Crea `apps/web/public/packs/hskN/strokes/`, `apps/web/public/packs/hskN/audio/` y `syllables.json` para cada lista descargable (2–6). HSK 1 sigue en `apps/web/public/strokes/`. `syllables.json` solo lista sílabas con MP3 real: si falta el archivo, Vite puede devolver el HTML de la app con 200 y la caché lo guarda como “audio”, y entonces todos los huecos suenan igual.

## Chen Wang, audio-cmn

Licencia: CC BY-SA 3.0, según la etiqueta de cada MP3. Repositorio: https://github.com/hugolpz/audio-cmn

La etiqueta de cada archivo dice que Chen Wang es mujer, de Jiangsu, y que la grabación es de 2013.

Los archivos se copian tal cual desde `64k/syllabs`. No los reencodes: la licencia pide compartir igual cualquier cambio.

```bash
python3 scripts/copy-cmn-audio.py
```

La primera vez clona el repo en `.cache/audio-cmn`, solo la carpeta de sílabas. Las siguientes hacen `git pull` y vuelven a copiar. El resultado queda en `apps/web/public/audio/c` y en `apps/web/src/data/syllable-clips-cmn.json`.

Si ya tienes el repo en otro sitio:

```bash
python3 scripts/copy-cmn-audio.py ~/src/audio-cmn
```

El script avisa de las sílabas que Chen Wang no grabó. Esas, al reproducir, usan el clip de la mujer. Lanza este script después del de CNS11643, porque la lista de sílabas sale de `syllable-clips.json`.

## Lectura oficial y audio

La lectura canónica es la del HSK / putonghua (continente): el pinyin de caracteres y de vocabulario no se adapta a Taiwán. Ejemplo: 朋友 se guarda como `péng you`, no como `péng yǒu` de la 國語辭典.

El audio sí viene sobre todo de CNS11643 (Taiwán). Ese paquete marca el neutro con sufijo `5` y solo graba un set cerrado (~49 sílabas: `ba5`, `ma5`, `zi5`, `de5`…). No tiene `you5`, `xie5`, `xi5`, `shao5`, `bu5` ni `sheng5`. En Guoyu, además, 朋友 lleva tercer tono en 友.

Política de reproducción:

1. Si existe el clip de la sílaba HSK exacta, se usa.
2. Si falta (casi siempre un neutro), se usa el tono de cita del carácter alineado, el que CNS sí tiene (`péng you` → `peng2` + `you3`, `xiè xie` → `xie4` + `xie4`). Se acepta por ahora.
3. Si tampoco hay cita, síntesis `zh-CN` del navegador. Sin conexión hace falta una voz china instalada.
