# Actualizar las voces

Dos fuentes. Cada una tiene un script. Vuelve a lanzarlo cuando el origen publique archivos nuevos. Los dos reescriben `public/audio/NOTICE.txt`.

## Mujer y hombre, CNS11643

Licencia: cláusula de datos abiertos del gobierno de Taiwán, versión 1. Hay que citar 數位發展部，CNS11643中文標準交換碼全字庫網站, https://www.cns11643.gov.tw

El zip de las voces está en el listado de https://www.cns11643.gov.tw/opendata/release.txt

```bash
curl -L -o /tmp/Voice.zip https://www.cns11643.gov.tw/opendata/Voice.zip
python3 scripts/copy-cns-audio.py /tmp/Voice.zip
```

Eso deja en `public/audio/f` y `public/audio/m` solo las sílabas que usa la app, en MP3 mono, y regenera `src/data/syllable-clips.json`.

## Chen Wang, audio-cmn

Licencia: CC BY-SA 3.0, según la etiqueta de cada MP3. Repositorio: https://github.com/hugolpz/audio-cmn

La etiqueta de cada archivo dice que Chen Wang es mujer, de Jiangsu, y que la grabación es de 2013.

Los archivos se copian tal cual desde `64k/syllabs`. No los reencodes: la licencia pide compartir igual cualquier cambio.

```bash
python3 scripts/copy-cmn-audio.py
```

La primera vez clona el repo en `.cache/audio-cmn`, solo la carpeta de sílabas. Las siguientes hacen `git pull` y vuelven a copiar. El resultado queda en `public/audio/c` y en `src/data/syllable-clips-cmn.json`.

Si ya tienes el repo en otro sitio:

```bash
python3 scripts/copy-cmn-audio.py ~/src/audio-cmn
```

El script avisa de las sílabas que Chen Wang no grabó. Esas, al reproducir, usan el clip de la mujer. Lanza este script después del de CNS11643, porque la lista de sílabas sale de `syllable-clips.json`.
