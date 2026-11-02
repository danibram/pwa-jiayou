// Merge curated/hsk6-a.json + b + c → curated/hsk6.json, then apply.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'src/data/glosses/curated');
const parts = ['hsk6-a.json', 'hsk6-b.json', 'hsk6-c.json'];
const merged = {};

for (const part of parts) {
  const path = join(outDir, part);
  if (!existsSync(path)) {
    console.error(`missing ${path}`);
    process.exit(1);
  }
  Object.assign(merged, JSON.parse(readFileSync(path, 'utf8')));
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'hsk6.json'), `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
console.log(`merged hsk6 curated: ${Object.keys(merged).length} entries`);
