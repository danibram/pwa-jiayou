// Fetches HSK 4–6 character rows from hanzidb.org (CC-BY-ish community data; see Acerca).
// Writes src/data/hsk{4,5,6}.json and refreshes src/data/characterLevels.json tallies.
// Run: node scripts/fetch-hsk-from-hanzidb.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const listOnly = process.argv.includes('--list-only');
const BASE = 'http://hanzidb.org';

const firstSense = (definition) => definition.split(/[;；]/)[0]?.trim() ?? '';

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
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
      return res.text();
    } catch (error) {
      if (attempt === tries) throw error;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  return null;
};

const parseListRow = (chunk) => {
  if (!chunk.includes('class="smmr"')) return null;
  const character = chunk.match(/<td><a href="\/character\/([^"]+)">/);
  const pinyin = chunk.match(/<span style="color:[^"]+">([^<]*)<\/span>/);
  const definition = chunk.match(/<span class="smmr">([^<]*)<\/span>/);
  const radical = chunk.match(/<td><a href="\/character\/([^"]+)"[^>]*>[^<]*<\/a>&nbsp;/);
  if (!character || !pinyin || !definition || !radical) return null;
  return {
    character: decode(character[1]),
    pinyin: pinyin[1],
    definition: definition[1],
    radical: decode(radical[1]),
  };
};

const scrapeLevel = async (level) => {
  const byChar = new Map();
  for (let page = 1; page <= 80; page++) {
    const html = await fetchText(`/character-list/hsk/level-${level}?page=${page}`);
    if (html === null) break;
    let rows = 0;
    for (const chunk of html.split('</tr>')) {
      const parsed = parseListRow(chunk);
      if (!parsed) continue;
      rows += 1;
      byChar.set(parsed.character, {
        character: parsed.character,
        traditional: parsed.character,
        pinyin: parsed.pinyin,
        definition: parsed.definition,
        radical: parsed.radical,
        stroke_count: 0,
        hsk_level: level,
        gloss: firstSense(parsed.definition),
      });
    }
    if (rows === 0) break;
  }
  return [...byChar.values()].sort((a, b) => a.character.localeCompare(b.character, 'zh'));
};

const enrichEntry = async (entry) => {
  await new Promise((r) => setTimeout(r, 120));
  const html = await fetchText(`/character/${encodeURIComponent(entry.character)}`);
  if (html === null) return entry;
  const trad = html.match(/Traditional variant:<\/b> <a href="\/character\/([^"]+)">/);
  if (trad) entry.traditional = decode(trad[1]);
  const dict = html.match(
    /<b>Examples of words containing this character:<\/b> <a href="\/dictionary\/([^"]+)" title="([^"]+)">([^<]*)<\/a>/,
  );
  if (dict) {
    const word = decode(dict[3]);
    const pinyin = dict[2]
      .trim()
      .split(/\s+/)
      .map((syllable) => syllable.replace(/\d/g, ''))
      .join(' ');
    entry.example = { word, pinyin, es: entry.gloss };
  }
  entry.general_standard = 0;
  entry.frequency_rank = 0;
  return entry;
};

const poolMap = async (items, limit, fn) => {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return out;
};

const existingLevels = () => {
  const map = {};
  const hsk1 = JSON.parse(readFileSync(join(root, 'src/data/hsk1.json'), 'utf8'));
  for (const row of hsk1) map[row.character] = row.hsk_level;
  for (const level of [2, 3]) {
    const pack = JSON.parse(readFileSync(join(root, `public/packs/hsk${level}.json`), 'utf8'));
    for (const row of pack) map[row.character] = row.hsk_level;
  }
  return map;
};

for (const level of [4, 5, 6]) {
  console.log(`HSK ${level}: scraping list…`);
  const rows = await scrapeLevel(level);
  console.log(`HSK ${level}: ${rows.length} rows${listOnly ? '' : ', enriching…'}`);
  const enriched = listOnly
    ? rows.map((row) => ({ ...row, general_standard: 0, frequency_rank: 0 }))
    : await poolMap(rows, 5, enrichEntry);
  writeFileSync(join(root, `src/data/hsk${level}.json`), `${JSON.stringify(enriched, null, 4)}\n`, 'utf8');
  console.log(`wrote src/data/hsk${level}.json`);
}

const levels = existingLevels();
for (const level of [4, 5, 6]) {
  for (const row of JSON.parse(readFileSync(join(root, `src/data/hsk${level}.json`), 'utf8'))) {
    levels[row.character] = row.hsk_level;
  }
}
const sorted = Object.fromEntries(Object.entries(levels).sort(([a], [b]) => a.localeCompare(b, 'zh')));
writeFileSync(join(root, 'src/data/characterLevels.json'), `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
console.log(`characterLevels: ${Object.keys(sorted).length} characters`);
