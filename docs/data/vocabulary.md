# Vocabulary data

The app ships the HSK 2.0 word lists for levels 1–6. The original source has 150 / 147 / 298 / 598 / 1298 / 2500 words; editorial additions and level changes alter those counts. Word levels do not describe the level of each character.

The lists also include words checked against the cumulative Asia Idiomas lists for [HSK 1](https://www.asiaidiomas.es/descargas/HSK1-VOCABULARIO.pdf), [HSK 2](https://www.asiaidiomas.es/descargas/HSK2-VOCABULARIO.pdf), and [HSK 3](https://www.asiaidiomas.es/descargas/HSK3-VOCABULARIO.pdf). These sources differ in some word forms and level assignments. Seven existing words were moved to lower levels while retaining their IDs. Selected HSK 1 example sentences appear in `apps/web/src/data/vocabulary/examples.json`, with Spanish translations.

To compare the HSK 3 PDF again, run `node scripts/compare-hsk3-pdf.mjs --pdf /path/to/HSK3-VOCABULARIO.pdf > /tmp/hsk3-report.json`. This needs `pdftotext` from Poppler. For text already extracted from the PDF, use `--text /path/to/file.txt`. When the text preserves the four columns, each result includes `sourceSpanish` beside the catalog's `entries[].meaning`. The report also lists missing words, words filed above level 3, missing characters, duplicates and fragments the parser could not resolve. A `found` status confirms the written form and level only, not the reading or translation. If the text has lost its columns, `sourceSpanish` is null and `source` keeps the unsplit row. Check `translationsExtracted`, duplicates, unresolved fragments and row totals before treating the report as complete. Run `node --test scripts/compare-hsk3-pdf.test.mjs` to check the parser.

Add `--tsv` to produce a tab-separated table with the PDF and catalog meanings side by side, suitable for opening in a spreadsheet.

The lists, traditional forms and readings were retrieved from [Complete HSK Vocabulary, exclusive old levels](https://github.com/drkameleon/complete-hsk-vocabulary/tree/main/wordlists/exclusive/old), by Yanis Zafirópulos. The project identifies `old-N` as HSK 2.0 level N and distributes the data under the MIT license. Each entry keeps one reading and one sense (the first form and first meaning in the source). Spanish meanings translate that sense. The source attributes its definitions to [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cc-cedict), licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The translated meanings are shared under the same license. The source includes more readings and senses than this selection.

Per-level JSON lives in `apps/web/src/data/vocabulary/hsk{1..6}.json`. Rebuild with `npm run build-vocabulary`, then `npm run localize-vocabulary`. For large remaining batches when Translate APIs throttle, `scripts/localize-vocabulary-bulk.py` (venv + `translators`) can fill the EN→ES cache. Curated Spanish overrides (including the original pilot senses) live under `apps/web/src/data/vocabulary/curated/`.

The checked-in `apps/web/src/data/vocabulary/source-fixture.json` records eight selected source forms for reading checks. Topic IDs refer to the existing topics in `apps/web/src/data/topics.ts` and describe the selected word sense for a subset of level 1. Words with no suitable topic have an empty list.

The word 东西 uses `dōng xi` for "thing", 多少 uses `duō shao` for "how many", and 对不起 uses `duì bu qǐ`. These readings belong to the words and must not be reconstructed from character readings. The `characters` array contains the simplified characters in order, including repetitions.

Word list JSON is bundled with the app. Stroke and syllable audio still come from the character packs (`apps/web/public/strokes`, `apps/web/public/audio`, `apps/web/public/packs/hskN/`).

Authored sentences use the optional `VocabularyEntry.example` field. Draft references (example sentences shown while reviewing in the editor) are not published.

## Where the Spanish comes from

The HSK translations and the HSK 4 to 6 character definitions start from CC-CEDICT senses. The split into uses, the parts of speech, the usage notes, the subtopics and the final wording are this project's. The licenses below describe the original vocabulary sources.

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

## Significados por uso

Cada palabra guarda `senses`, una lista de usos `{ pos, text, note }`, en lugar de un texto con punto y coma. El modelo y sus ayudas están en `packages/content/src/senses.ts`; el editor valida la categoría contra la misma lista cerrada. La migración desde `meaning` está en `scripts/migrate-word-senses.mjs`: `split` analiza cada texto con `scripts/word-senses.mjs` y escribe lotes en `.cache/senses/`, y `apply` junta las categorías asignadas y escribe un borrador para `content-publish.mjs promote`. El texto lo separa el script; un modelo solo asignó la categoría de los 7563 usos que no la traían escrita. Los scripts antiguos `localize-vocabulary.mjs`, `fix-vocabulary-data.mjs` y `compare-hsk3-pdf.mjs` siguen leyendo `meaning` y solo sirven para las listas de origen.
