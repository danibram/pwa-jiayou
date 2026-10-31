// Copies hanzi-writer stroke data for every HSK character into public/strokes,
// so the stroke mode works offline and gets precached by the service worker.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules/hanzi-writer-data');
const target = join(root, 'public/strokes');
mkdirSync(target, { recursive: true });

const chars = new Set();
const addFile = (path) => {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    for (const entry of data) chars.add(entry.character);
};
addFile(join(root, 'src/data/hsk1.json'));
const packs = join(root, 'public/packs');
if (existsSync(packs)) {
    for (const name of readdirSync(packs)) {
        if (name.endsWith('.json')) addFile(join(packs, name));
    }
}

const missing = [];
for (const char of chars) {
    const file = join(source, `${char}.json`);
    if (existsSync(file)) copyFileSync(file, join(target, `${char}.json`));
    else missing.push(char);
}

console.log(`strokes: ${chars.size - missing.length}/${chars.size} copied`);
if (missing.length) console.log(`missing: ${missing.join(' ')}`);
