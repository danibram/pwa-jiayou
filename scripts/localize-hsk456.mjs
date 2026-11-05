// Spanish glosses, definitions and example.es for HSK 4–6.
// Uses HanziDB for example words and Google Translate (gtx) for EN→ES.
// Resume: node scripts/localize-hsk456.mjs --level 4
// All:    node scripts/localize-hsk456.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCurated } from './curated-gloss-es.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://hanzidb.org';
const args = process.argv.slice(2);
const levelArg = args.find((a) => a.startsWith('--level='))?.split('=')[1] ?? args[args.indexOf('--level') + 1];
const levels = levelArg ? [Number(levelArg)] : [4, 5, 6];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const firstSense = (text) => text.split(/[;；]/)[0]?.trim() ?? '';

const shortGloss = (text) => {
  let line = firstSense(text).replace(/[,;]\s*$/, '');
  if (line.length <= 30) return line;
  const cut = line.slice(0, 30);
  const space = cut.lastIndexOf(' ');
  if (space > 18) line = cut.slice(0, space);
  else line = `${cut.slice(0, 27)}…`;
  return line.replace(/[,;]\s*$/, '');
};

const decode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const fetchText = async (path, tries = 3) => {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    } catch (error) {
      if (attempt === tries) throw error;
      await sleep(400 * attempt);
    }
  }
  return null;
};

const translateEnEs = async (text) => {
  const chunk = text.trim().slice(0, 450);
  if (!chunk) return '';
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=es&dt=t&q=${encodeURIComponent(chunk)}`;

  for (let round = 1; round <= 6; round++) {
    await sleep(450 + round * 200);
    const myMemory = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|es`;
    try {
      const mm = await fetch(myMemory);
      if (mm.ok) {
        const data = await mm.json();
        if (data.responseStatus === 200 && data.responseData?.translatedText) {
          return String(data.responseData.translatedText).trim();
        }
      }
    } catch {
      /* try gtx next */
    }
    for (let attempt = 1; attempt <= 3; attempt++) {
      await sleep(2_000 * attempt);
      try {
        const res = await fetch(url);
        if (res.status === 429) continue;
        if (!res.ok) continue;
        const data = await res.json();
        return data[0].map((part) => part[0]).join('').trim();
      } catch {
        /* retry */
      }
    }
  }
  return '';
};

const translateDefinition = async (english) => {
  const parts = english.split(/[;；]/).map((p) => p.trim()).filter(Boolean).slice(0, 4);
  if (parts.length === 0) return '';
  return translateEnEs(parts.join('; '));
};

const fetchExample = async (character) => {
  const html = await fetchText(`/character/${encodeURIComponent(character)}`);
  if (!html) return null;
  const dict = html.match(
    /<b>Examples of words containing this character:<\/b> <a href="\/dictionary\/([^"]+)" title="([^"]+)">([^<]*)<\/a>/,
  );
  if (!dict) return null;
  const word = decode(dict[3]);
  if (!word.includes(character)) return null;
  const pinyin = decode(dict[2])
    .trim()
    .split(/\s+/)
    .map((syllable) => syllable.replace(/\d/g, ''))
    .join(' ');
  return { word, pinyin };
};

const glossPath = (level) => join(root, `apps/web/src/data/glosses/hsk${level}.json`);
const dataPath = (level) => join(root, `apps/web/src/data/hsk${level}.json`);

const loadGlossSidecar = (level) => {
  const path = glossPath(level);
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8'));
};

const saveGlossSidecar = (level, data) => {
  writeFileSync(glossPath(level), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
};

const localizeLevel = async (level) => {
  const path = dataPath(level);
  const rows = JSON.parse(readFileSync(path, 'utf8'));
  const sidecar = loadGlossSidecar(level);
  let done = 0;
  const needsCurated = [];

  for (const row of rows) {
    const saved = sidecar[row.character];
    if (saved?.gloss) {
      row.gloss = saved.gloss;
      if (saved.example) row.example = saved.example;
      if (!row.definition || /^[a-zA-Z]/.test(firstSense(row.definition))) {
        row.definition = saved.gloss;
      }
      done += 1;
      continue;
    }

    const curated = getCurated(level, row.character);
    if (curated?.gloss) {
      const glossEs = curated.gloss;
      const definitionEs = curated.definition ?? glossEs;
      let example = curated.example ?? row.example;
      if (example?.word && !example.es) example = { ...example, es: glossEs };
      row.definition = definitionEs;
      row.gloss = glossEs;
      if (example) row.example = example;
      sidecar[row.character] = { gloss: glossEs, ...(example ? { example } : {}) };
      done += 1;
      if (done % 25 === 0) {
        saveGlossSidecar(level, sidecar);
        writeFileSync(path, `${JSON.stringify(rows, null, 4)}\n`, 'utf8');
        console.log(`HSK ${level}: ${done}/${rows.length}`);
      }
      continue;
    }

    const englishDef = row.definition || row.gloss || '';
    let definitionEs = englishDef ? await translateDefinition(englishDef) : '';
    if (!definitionEs.trim()) {
      needsCurated.push(row.character);
      continue;
    }
    const glossEs = shortGloss(definitionEs);

    let example = row.example;
    if (!example?.word?.includes(row.character)) {
      await sleep(80);
      const fetched = await fetchExample(row.character);
      if (fetched) example = fetched;
    }
    if (example?.word) {
      example = { ...example, es: glossEs };
    }

    row.definition = definitionEs;
    row.gloss = glossEs;
    if (example) row.example = example;

    sidecar[row.character] = {
      gloss: glossEs,
      ...(example ? { example } : {}),
    };

    done += 1;
    if (done % 25 === 0) {
      saveGlossSidecar(level, sidecar);
      writeFileSync(path, `${JSON.stringify(rows, null, 4)}\n`, 'utf8');
      console.log(`HSK ${level}: ${done}/${rows.length}`);
    }
  }

  saveGlossSidecar(level, sidecar);
  writeFileSync(path, `${JSON.stringify(rows, null, 4)}\n`, 'utf8');
  writeFileSync(join(root, `apps/web/public/packs/hsk${level}.json`), `${JSON.stringify(rows, null, 4)}\n`, 'utf8');
  console.log(`HSK ${level}: listo (${Object.keys(sidecar).length}/${rows.length} en sidecar)`);
  if (needsCurated.length) {
    console.warn(`HSK ${level}: sin traducción (${needsCurated.length}): ${needsCurated.slice(0, 12).join(' ')}${needsCurated.length > 12 ? '…' : ''}`);
    console.warn(`  Añade glosas en scripts/curated-gloss-es.mjs o src/data/glosses/curated/hsk${level}.json y ejecuta apply-curated-glosses.mjs`);
  }
};

for (const level of levels) {
  if (!Number.isFinite(level) || level < 4 || level > 6) continue;
  console.log(`Localizando HSK ${level}…`);
  await localizeLevel(level);
}
