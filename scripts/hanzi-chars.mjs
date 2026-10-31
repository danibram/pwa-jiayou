// Prints every CJK character the app can display: HSK data (simplified and
// traditional), example words, and hanzi used in the UI. Feed it to pyftsubset to rebuild
// public/fonts/wenkai-hsk.woff2 when the data changes:
//   node scripts/hanzi-chars.mjs > chars.txt
//   pyftsubset LXGWWenKai-Medium.ttf --text-file=chars.txt --flavor=woff2 \
//     --output-file=public/fonts/wenkai-hsk.woff2 --layout-features='*'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chars = new Set();
const add = text => {
    for (const ch of text ?? '') if (/\p{Script=Han}/u.test(ch)) chars.add(ch);
};

for (const level of [1]) {
    for (const entry of JSON.parse(readFileSync(join(root, `src/data/hsk${level}.json`), 'utf8'))) {
        add(entry.character);
        add(entry.traditional);
        add(entry.radical);
    }
}

const packDir = join(root, 'public/packs');
if (existsSync(packDir)) {
    for (const name of readdirSync(packDir)) {
        if (!name.endsWith('.json')) continue;
        for (const entry of JSON.parse(readFileSync(join(packDir, name), 'utf8'))) {
            add(entry.character);
            add(entry.traditional);
            add(entry.radical);
            add(entry.example?.word);
        }
    }
}

const glossDir = join(root, 'src/data/glosses');
for (const name of readdirSync(glossDir)) {
    for (const entry of Object.values(JSON.parse(readFileSync(join(glossDir, name), 'utf8')))) {
        add(entry.example?.word);
    }
}

const walk = dir => {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name)) add(readFileSync(path, 'utf8'));
    }
};
walk(join(root, 'src'));

process.stdout.write([...chars].join(''));
