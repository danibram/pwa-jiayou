// Builds src/data/searchIndex.json from HSK 1–6 list files (metadata only, bundled in the app).
// Run after changing lists: node scripts/build-search-index.mjs
// HSK 4–6 lists: node scripts/fetch-hsk-from-hanzidb.mjs first.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const sources = [
  join(root, 'src/data/hsk1.json'),
  join(root, 'public/packs/hsk2.json'),
  join(root, 'public/packs/hsk3.json'),
  join(root, 'src/data/hsk4.json'),
  join(root, 'src/data/hsk5.json'),
  join(root, 'src/data/hsk6.json'),
];

const hsk1GlossPath = join(root, 'src/data/glosses/hsk1.json');
const hsk1Glosses = existsSync(hsk1GlossPath)
  ? JSON.parse(readFileSync(hsk1GlossPath, 'utf8'))
  : {};

const glossSidecars = {};
for (const level of [4, 5, 6]) {
  const path = join(root, `src/data/glosses/hsk${level}.json`);
  if (existsSync(path)) glossSidecars[level] = JSON.parse(readFileSync(path, 'utf8'));
}

const firstSense = (definition) => {
  if (typeof definition !== 'string' || !definition) return '';
  return definition.split(/[;；]/)[0]?.trim() ?? '';
};

const glossFor = (entry) => {
  if (typeof entry.gloss === 'string' && entry.gloss) return entry.gloss;
  const fromFile = hsk1Glosses[entry.character]?.gloss;
  if (typeof fromFile === 'string' && fromFile) return fromFile;
  const level = entry.hsk_level;
  const fromSidecar = level && glossSidecars[level]?.[entry.character]?.gloss;
  if (typeof fromSidecar === 'string' && fromSidecar) return fromSidecar;
  return firstSense(entry.definition);
};

const exampleFor = (entry) => {
  const level = entry.hsk_level;
  const sidecarEx = level && glossSidecars[level]?.[entry.character]?.example;
  const raw = sidecarEx ?? entry.example;
  if (!raw || typeof raw.word !== 'string' || typeof raw.pinyin !== 'string') return undefined;
  const es = typeof raw.es === 'string' ? raw.es : glossFor(entry);
  return { word: raw.word, pinyin: raw.pinyin, es };
};

const rows = [];
for (const path of sources) {
  if (!existsSync(path)) {
    console.error(`missing ${path}`);
    process.exit(1);
  }
  for (const entry of JSON.parse(readFileSync(path, 'utf8'))) {
    const example = exampleFor(entry);
    rows.push({
      character: entry.character,
      traditional: entry.traditional ?? entry.character,
      pinyin: entry.pinyin ?? '',
      hsk_level: entry.hsk_level,
      gloss: glossFor(entry),
      radical: entry.radical ?? '',
      ...(example ? { example } : {}),
    });
  }
}

writeFileSync(
  join(root, 'src/data/searchIndex.json'),
  `${JSON.stringify(rows, null, 2)}\n`,
  'utf8',
);
console.log(`searchIndex: ${rows.length} characters`);
