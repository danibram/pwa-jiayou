// Apply char\tgloss\tword\tpinyin\tes TSV into hskN data + sidecar + pack.
// Usage: node scripts/apply-gloss-tsv.mjs --level=4 /tmp/hsk4-es.tsv
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const level = Number(args.find((a) => a.startsWith('--level='))?.split('=')[1] ?? args[args.indexOf('--level') + 1]);
const tsvPath = args.find((a) => !a.startsWith('--') && a.endsWith('.tsv')) ?? args.at(-1);

if (!Number.isFinite(level) || level < 1 || level > 6 || !tsvPath) {
  console.error('Usage: node scripts/apply-gloss-tsv.mjs --level=N file.tsv');
  process.exit(1);
}

const curated = {};
for (const line of readFileSync(tsvPath, 'utf8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const [ch, gloss, word, pinyin, es] = trimmed.split('\t');
  if (!ch || !gloss) throw new Error(`bad line: ${trimmed}`);
  curated[ch] = {
    gloss,
    definition: gloss,
    example: { word: word || ch, pinyin: pinyin || '', es: es || gloss },
  };
}

const dataPath =
  level === 1
    ? join(root, 'apps/web/src/data/hsk1.json')
    : level <= 3
      ? join(root, `apps/web/public/packs/hsk${level}.json`)
      : join(root, `apps/web/src/data/hsk${level}.json`);

const rows = JSON.parse(readFileSync(dataPath, 'utf8'));
const sidecarPath = join(root, `apps/web/src/data/glosses/hsk${level}.json`);
const sidecar = existsSync(sidecarPath) ? JSON.parse(readFileSync(sidecarPath, 'utf8')) : {};
let applied = 0;
const missing = [];

for (const row of rows) {
  const c = curated[row.character];
  if (!c) {
    missing.push(row.character);
    continue;
  }
  row.gloss = c.gloss;
  row.definition = c.definition;
  row.example = c.example;
  sidecar[row.character] = { gloss: c.gloss, example: c.example };
  applied += 1;
}

mkdirSync(dirname(sidecarPath), { recursive: true });
writeFileSync(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`, 'utf8');
writeFileSync(dataPath, `${JSON.stringify(rows, null, 4)}\n`, 'utf8');
if (level >= 4) {
  writeFileSync(join(root, `apps/web/public/packs/hsk${level}.json`), `${JSON.stringify(rows, null, 4)}\n`, 'utf8');
}
writeFileSync(
  join(root, `apps/web/src/data/glosses/curated/hsk${level}.json`),
  `${JSON.stringify(curated, null, 2)}\n`,
  'utf8',
);

console.log(`HSK ${level}: applied ${applied}/${rows.length}`);
if (missing.length) console.warn(`missing ${missing.length}: ${missing.slice(0, 20).join(' ')}`);
