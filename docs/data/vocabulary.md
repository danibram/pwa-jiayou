# Vocabulary data

The app ships the full HSK 2.0 exclusive word lists for levels 1–6 (150 / 147 / 298 / 598 / 1298 / 2500). Word levels come from that list and do not describe the level of each character.

The lists, traditional forms and readings were retrieved from [Complete HSK Vocabulary, exclusive old levels](https://github.com/drkameleon/complete-hsk-vocabulary/tree/main/wordlists/exclusive/old), by Yanis Zafirópulos. The project identifies `old-N` as HSK 2.0 level N and distributes the data under the MIT license. Each entry keeps one reading and one sense (the first form and first meaning in the source). Spanish meanings translate that sense. The source attributes its definitions to [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cc-cedict), licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The translated meanings are shared under the same license. The source includes more readings and senses than this selection.

Per-level JSON lives in `src/data/vocabulary/hsk{1..6}.json`. Rebuild with `npm run build-vocabulary`, then `npm run localize-vocabulary`. For large remaining batches when Translate APIs throttle, `scripts/localize-vocabulary-bulk.py` (venv + `translators`) can fill the EN→ES cache. Curated Spanish overrides (including the original pilot senses) live under `src/data/vocabulary/curated/`.

The checked-in `src/data/vocabulary/source-fixture.json` records eight selected source forms for reading checks. Topic IDs refer to the existing topics in `src/data/topics.ts` and describe the selected word sense for a subset of level 1. Words with no suitable topic have an empty list.

The word 东西 uses `dōng xi` for "thing", 多少 uses `duō shao` for "how many", and 对不起 uses `duì bu qǐ`. These readings belong to the words and must not be reconstructed from character readings. The `characters` array contains the simplified characters in order, including repetitions.

Word list JSON is bundled with the app. Stroke and syllable audio still come from the character packs (`public/strokes`, `public/audio`, `public/packs/hskN/`).

## Source license

MIT License

Copyright (c) 2026 Yanis Zafirópulos

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
