// Copies hanzi-writer stroke data for every HSK character into public/strokes,
// so the stroke mode works offline and gets precached by the service worker.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules/hanzi-writer-data');
const target = join(root, 'public/strokes');
mkdirSync(target, { recursive: true });

const chars = new Set();
for (const level of [1, 2, 3]) {
    const data = JSON.parse(readFileSync(join(root, `src/data/hsk${level}.json`), 'utf8'));
    for (const entry of data) chars.add(entry.character);
}

const missing = [];
for (const char of chars) {
    const file = join(source, `${char}.json`);
    if (existsSync(file)) copyFileSync(file, join(target, `${char}.json`));
    else missing.push(char);
}

console.log(`strokes: ${chars.size - missing.length}/${chars.size} copied`);
if (missing.length) console.log(`missing: ${missing.join(' ')}`);
