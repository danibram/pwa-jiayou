// Normalises traditional forms to the common Taiwan standard.
// The word source picked rare variants (碗 → 㼝, 和 → 咊), and the character
// lists for HSK 4–6 often repeat the simplified form or leave it empty.
// Idempotent. Run after build-vocabulary and fix-vocabulary-data:
//   node scripts/fix-traditional.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const levels = [1, 2, 3, 4, 5, 6];

/** Variant or Extension A form → the standard form, in any word. */
export const VARIANT_FIX = {
  '㝡': '最', '㧱': '拿', '㼝': '碗', '㽞': '留', '㕁': '卻', '㴱': '深', '䠀': '趟', '㕥': '以', '㟁': '岸', '㠀': '島',
  '咊': '和', '嵗': '歲', '晻': '暗', '徧': '遍', '辢': '辣', '嬾': '懶', '墻': '牆', '跴': '踩', '擧': '舉', '捄': '救',
  '飃': '飄', '凴': '憑', '虵': '蛇', '胷': '胸', '亱': '夜', '煑': '煮', '舖': '鋪', '竪': '豎', '綉': '繡', '裏': '裡',
};

/**
 * Single-character words whose traditional form depends on the sense. The
 * source picked the wrong sense (布 "tela" → 佈, 脏 "sucio" → 臟).
 */
export const SINGLE_WORD_FIX = {
  '布': '布', '家': '家', '几': '幾', '听': '聽', '念': '念', '背': '背', '蒙': '蒙', '钟': '鐘', '系': '系', '脏': '髒',
};

/** Characters whose words point at a minor sense (复苏 → 甦, but 苏 is 蘇 first). */
export const CHARACTER_FIX = { '苏': '蘇', '凄': '淒', '松': '松' };

const indents = new Map();
const readJson = (path) => {
  const text = readFileSync(path, 'utf8');
  // Keep each file's own indentation so a rerun leaves no noise.
  indents.set(path, /^\[\n( +)/.exec(text)?.[1].length ?? 2);
  return JSON.parse(text);
};
const writeJson = (path, data) => writeFileSync(path, `${JSON.stringify(data, null, indents.get(path) ?? 2)}\n`);
const normalise = (text) => [...text].map((char) => VARIANT_FIX[char] ?? char).join('');

let wordChanges = 0;
const votes = new Map();
for (const level of levels) {
  const path = join(root, `apps/web/src/data/vocabulary/hsk${level}.json`);
  const words = readJson(path);
  for (const word of words) {
    if (typeof word.traditional !== 'string') continue;
    let next = word.simplified.length === 1 && SINGLE_WORD_FIX[word.simplified]
      ? SINGLE_WORD_FIX[word.simplified]
      : normalise(word.traditional);
    if (next !== word.traditional) {
      word.traditional = next;
      wordChanges++;
    }
    const simple = [...word.simplified];
    const trad = [...next];
    if (simple.length !== trad.length) continue;
    simple.forEach((char, index) => {
      const counts = votes.get(char) ?? new Map();
      counts.set(trad[index], (counts.get(trad[index]) ?? 0) + 1);
      votes.set(char, counts);
    });
  }
  writeJson(path, words);
}

/** A character takes its words' form only when every word agrees. */
const agreed = (char) => {
  const counts = votes.get(char);
  if (!counts || counts.size !== 1) return null;
  return [...counts.keys()][0];
};

let charChanges = 0;
const fixCharacters = (path) => {
  if (!existsSync(path)) return;
  const rows = readJson(path);
  for (const row of rows) {
    const current = typeof row.traditional === 'string' && row.traditional ? normalise(row.traditional) : null;
    const fromWords = agreed(row.character);
    // Keep a form that already differs from the simplified one: it came from a character source.
    const next = CHARACTER_FIX[row.character]
      ?? (current && current !== row.character ? current : fromWords ?? current ?? row.character);
    if (next !== row.traditional) {
      row.traditional = next;
      charChanges++;
    }
  }
  writeJson(path, rows);
};

for (const level of levels) {
  fixCharacters(join(root, `apps/web/src/data/hsk${level}.json`));
  if (level > 1) fixCharacters(join(root, `apps/web/public/packs/hsk${level}.json`));
}

console.log(`traditional forms: ${wordChanges} words, ${charChanges} characters changed`);
