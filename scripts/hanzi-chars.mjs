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

// Character lists ship for every level, not only the bundled one.
for (const name of readdirSync(join(root, 'apps/web/src/data'))) {
    if (!/^hsk\d\.json$/.test(name)) continue;
    for (const entry of JSON.parse(readFileSync(join(root, 'apps/web/src/data', name), 'utf8'))) {
        add(entry.character);
        add(entry.traditional);
        add(entry.radical);
        add(entry.example?.word);
    }
}

// Every HSK 1-6 word, in both scripts. Words reach characters the character lists do not have.
const vocabularyDir = join(root, 'apps/web/src/data/vocabulary');
for (const name of readdirSync(vocabularyDir)) {
    if (!/^hsk\d\.json$/.test(name)) continue;
    const data = JSON.parse(readFileSync(join(vocabularyDir, name), 'utf8'));
    for (const entry of Array.isArray(data) ? data : data.entries ?? data.words ?? []) {
        add(entry.simplified);
        add(entry.traditional);
    }
}

const searchIndex = join(root, 'apps/web/src/data/searchIndex.json');
if (existsSync(searchIndex)) add(readFileSync(searchIndex, 'utf8'));

const packDir = join(root, 'apps/web/public/packs');
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

const glossDir = join(root, 'apps/web/src/data/glosses');
for (const name of readdirSync(glossDir)) {
    if (!name.endsWith('.json')) continue;
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
walk(join(root, 'apps/web/src'));

process.stdout.write([...chars].join(''));
