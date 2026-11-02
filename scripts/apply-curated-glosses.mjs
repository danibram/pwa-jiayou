// Apply curated gloss sidecars (scripts/curated-gloss-es.mjs + src/data/glosses/curated/hskN.json).
// node scripts/apply-curated-glosses.mjs --level=5
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURATED_BY_LEVEL } from './curated-gloss-es.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const levelArg = args.find((a) => a.startsWith('--level='))?.split('=')[1] ?? args[args.indexOf('--level') + 1];
const levels = levelArg ? [Number(levelArg)] : [4, 5, 6];

const glossPath = (level) => join(root, `src/data/glosses/hsk${level}.json`);
const curatedFilePath = (level) => join(root, `src/data/glosses/curated/hsk${level}.json`);
const dataPath = (level) => join(root, `src/data/hsk${level}.json`);

const loadSidecar = (level) => {
  const path = glossPath(level);
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8'));
};

const curatedForLevel = (level) => {
  const inline = CURATED_BY_LEVEL[level] ?? {};
  let file = {};
  const path = curatedFilePath(level);
  if (existsSync(path)) file = JSON.parse(readFileSync(path, 'utf8'));
  return { ...file, ...inline };
};

const applyLevel = (level) => {
  const rows = JSON.parse(readFileSync(dataPath(level), 'utf8'));
  const sidecar = loadSidecar(level);
  const curated = curatedForLevel(level);
  let applied = 0;

  for (const row of rows) {
    const c = curated[row.character];
    if (!c?.gloss) continue;
    const example = c.example ?? sidecar[row.character]?.example ?? row.example;
    const entry = {
      gloss: c.gloss,
      ...(example?.word ? { example: { ...example, es: c.example?.es ?? example.es ?? c.gloss } } : {}),
    };
    sidecar[row.character] = entry;
    row.gloss = c.gloss;
    row.definition = c.definition ?? c.gloss;
    if (entry.example) row.example = entry.example;
    applied += 1;
  }

  mkdirSync(dirname(glossPath(level)), { recursive: true });
  writeFileSync(glossPath(level), `${JSON.stringify(sidecar, null, 2)}\n`, 'utf8');
  writeFileSync(dataPath(level), `${JSON.stringify(rows, null, 4)}\n`, 'utf8');
  writeFileSync(join(root, `public/packs/hsk${level}.json`), `${JSON.stringify(rows, null, 4)}\n`, 'utf8');
  console.log(`HSK ${level}: ${applied} curated glosses applied (${Object.keys(sidecar).length} in sidecar)`);
};

for (const level of levels) {
  if (!Number.isFinite(level) || level < 4 || level > 6) continue;
  applyLevel(level);
}
