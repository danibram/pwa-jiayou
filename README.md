# 加油 · Hanzi HSK

A phone-first progressive web app for Spanish speakers learning Chinese. It covers the HSK 2.0 word lists for levels 1 to 6, the characters behind them, and their stroke order. The interface is in Spanish.

## What it does

### Study lists

- On first launch the app asks which lists to study. HSK 1 ships in the bundle. HSK 2 to 6 download to the device when you tick them, and are dropped again when you untick them.
- Ticking a list saves the strokes and audio its words need, including characters that belong to another level. Download runs in the background with a progress line on Home. It retries when the connection comes back.
- "Extra" holds words outside HSK, curated in the content editor (`editor/`). It is always in the list picker, even while empty, so a learner who ticks it gets the words later releases add. Its characters outside HSK get strokes from the hanzi-writer CDN. Learners do not add or correct words in the app.
- A word has one progress record no matter how many lists contain it.

### Daily review

- Home shows what is due today, a goal ring, the streak and an activity calendar. The daily budget is 20 new words and 8 new characters.
- A session holds up to 20 words. New words are taught in groups of three, then recalled, and reviews are woven between the groups so a session never opens with twenty introductions.
- Prompts vary. Some cards ask for the meaning, some show the Spanish and ask for the word, some play audio only, and some are a pick-one-of-four.
- Grade yourself with Otra vez, Difícil or Bien (keys 1, 2, 3). Intervals start at 1 and 3 days and then multiply by an ease factor. A card counts as mastered at a 21-day interval. A miss resets it and lowers the ease.
- Missed cards come back four cards later. Words missed at some point and not yet stable form the "weak" set, reachable from Home.
- A session you leave is saved and can be resumed from Home.

### Browse

- Buscar finds words by Chinese, pinyin or Spanish, across HSK 1 to 6 and Extra.
- Temas groups characters into 22 topics (verbs, questions, family, food, …) and lets you practise one topic on its own.
- Every word opens its characters. A character sheet shows the gloss HSK uses, the dictionary definition, radical, stroke count, an example word, and the other words that use it.
- Home shows a word of the day.

### Escribir (stroke order)

- Ver plays the stroke order, plus a step-by-step view. Arrow keys move between characters.
- Calcar lets you trace over a guide. A mistake shakes the grid. Two misses on a stroke show where it starts, three draw the stroke for you, and eight misses in all reveal the whole character.
- De memoria gives you an empty grid. The result feeds the character schedule.

### Audio

Opciones offers three voice modes. "China continental" plays recordings by Chen Wang. "Taiwán" alternates a woman and a man from the CNS11643 open data set. "TTS" uses the device's Chinese voice. Clips are per syllable, and a syllable with no clip falls back to the character's citation tone and then to TTS. The policy and the refresh scripts are in [docs/audio.md](docs/audio.md).

### Offline and updates

- The app shell, fonts and HSK 1 are precached by the service worker. Pack lists, strokes and clips go into a separate cache named after a hash of the media folders, so a release with new media refreshes it without touching your lists.
- Opciones shows what is saved, how much storage it uses, and whether a new version is waiting.
- A banner offers new versions. The app checks hourly and when it comes back to the foreground.

### Backup

Opciones exports a JSON file with word progress, character progress and daily counters (format version 3). Older files that carry a `myWords` list still import; the list is ignored. Import accepts version 2 and the older character-only map. If local storage fails, a notice offers to retry, export, or recover the last saved copy.

### Look and feel

- Rice paper and ink palette with light and dark themes. A header button cycles system, dark and light.
- Pinyin is coloured by tone.
- Characters render in LXGW WenKai, subset to the app's characters, so printed shapes match handwritten strokes.
- Installable PWA, portrait first, judged at a 390px viewport.

## Data

| Level | Words | Characters | Where |
| --- | --- | --- | --- |
| HSK 1 | 151 | 174 | bundled |
| HSK 2 | 147 | 173 | `public/packs/hsk2` |
| HSK 3 | 298 | 270 | `public/packs/hsk3` |
| HSK 4 | 598 | 444 | `public/packs/hsk4` |
| HSK 5 | 1298 | 619 | `public/packs/hsk5` |
| HSK 6 | 2500 | 970 | `public/packs/hsk6` |

Word lists live in `src/data/vocabulary/hskN.json` and are bundled. Character lists are `src/data/hsk1.json` and `public/packs/hskN.json`. Each character pack folder holds its stroke JSON, syllable clips and a `manifest.json` with counts and missing files. `src/data/searchIndex.json` holds all 2650 characters for search.

Word levels come from the HSK 2.0 exclusive lists and do not describe the level of each character. HSK 1 has the 150 official words plus 你好. Sources, licences and the reading rules are in [docs/data/vocabulary.md](docs/data/vocabulary.md).

Character glosses are curated in Spanish for HSK 1 to 3. HSK 4 to 6 come from HanziDB with machine translation plus curated overrides. The layering is base list, then `src/data/drafts/`, then `src/data/overrides/`, and the local content API (below) assembles and publishes them.

## Getting started

You need Node.js 18 or newer and npm.

```bash
git clone https://github.com/danibram/pwa-jiayou.git
cd pwa-jiayou
npm install
npm run dev
```

```bash
npm test              # vitest, watch mode
npm run typecheck     # tsc --noEmit
npm run build         # typecheck, then vite build
npm run check         # tests once, then build
```

## Content pipelines

Run these after changing data. None of them run at build time.

### Words

```bash
npm run build-vocabulary      # fetch HSK 2.0 lists, English meanings
npm run localize-vocabulary   # Spanish meanings, curated overrides first
node scripts/fix-vocabulary-data.mjs
node scripts/fix-traditional.mjs
```

### Characters

```bash
npm run fetch-hsk             # HSK 4 to 6 rows from hanzidb.org
npm run localize-hsk          # Spanish glosses and examples for HSK 4 to 6
npm run search-index          # rebuild src/data/searchIndex.json
npm run strokes               # HSK 1 stroke data into public/strokes/
npm run media-packs           # strokes, clips and manifest per level into public/packs/hskN/
```

### Audio

Two Python scripts refresh the two voice sources, and [docs/audio.md](docs/audio.md) has the steps. Run `npm run media-packs` afterwards.

### Font

`scripts/hanzi-chars.mjs` prints every character the app can display. Feed it to pyftsubset to rebuild `public/fonts/wenkai-hsk.woff2`. The script header has the exact command.

### Content API

`npm run content-api` starts a local Bun server for reviewing and correcting character data (drafts, overrides, review flags, publish). It only listens on 127.0.0.1 and the app never calls it. See [api/README.md](api/README.md).

## Project layout

```
src/
├── pages/          Home, Listas, Vocabulario, VocabularyReview, Trazos, Opciones, Acerca
├── components/     StrokeCanvas (hanzi-writer), CharacterDetailSheet, GradeButtons, VoicePicker, ProgressBackup, …
├── stores/         progressStore (schedules, daily counters), vocabularyStore (list selection)
├── domain/         pure logic: progress/schedule, progress/serialization, vocabulary/sessionDeck
├── utils/          levelPacks (downloads and cache), speech, pinyin, search, word import, theme
├── data/           lists, catalog, topics, vocabulary JSON, character JSON, glosses, overrides, drafts
└── index.css       design tokens for light and dark
api/                local content API (Bun)
scripts/            data pipelines
tests/              vitest, jsdom
docs/               audio, vocabulary data, specs, vision, research
```

## Analytics

Production builds send screen views and exceptions to PostHog (EU host), cookieless, with no autocapture, no person profiles and no session recording. Development builds send nothing.

## Licences and credits

- Vocabulary lists from [Complete HSK Vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary) (MIT). Translated definitions derive from CC-CEDICT and are shared under CC BY-SA 4.0.
- Character lists from [HanziDB](http://hanzidb.org). Spanish glosses were written for this project.
- Stroke data from hanzi-writer-data, derived from Make Me a Hanzi and Arphic fonts, under the Arphic Public License (`docs/licenses/hanzi-writer-data-ARPHICPL.txt`).
- Woman and man voices from CNS11643, Ministry of Digital Affairs, Taiwan, under the Taiwan open government data licence v1.
- Chen Wang voice from [audio-cmn](https://github.com/hugolpz/audio-cmn), CC BY-SA 3.0, copied unchanged.
- Font LXGW WenKai, SIL Open Font License (`docs/licenses/LXGW-WenKai-OFL.txt`).

The full attribution text for the audio is in `public/audio/NOTICE.txt` and in the app under Acerca de.

## License

MIT
