// One-off migration from `meaning: string` to `senses: { pos, text, note }[]`.
//   node scripts/migrate-word-senses.mjs split          parse every meaning, write batches of words that need a part of speech
//   node scripts/migrate-word-senses.mjs apply          read the answered batches, validate them, write an editor draft
// Work files live in .cache/senses/. The draft goes through `content-publish.mjs promote` like any other.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORK = join(ROOT, '.cache/senses');
const BATCH_SIZE = 500;

import { parseMeaning, WORD_POS } from './word-senses.mjs';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

async function split() {
  const snapshot = await readJson(join(ROOT, 'content/snapshot.json'));
  await mkdir(WORK, { recursive: true });
  const parsed = {};
  const pending = [];
  for (const word of snapshot.vocabulary) {
    const senses = parseMeaning(word.meaning);
    parsed[word.id] = senses;
    if (senses.some((sense) => !sense.pos)) {
      pending.push({ id: word.id, word: word.simplified, pinyin: word.pinyin, uses: senses.map((sense) => ({ text: sense.text, ...(sense.note ? { note: sense.note } : {}), ...(sense.pos ? { pos: sense.pos } : {}) })) });
    }
  }
  await writeFile(join(WORK, 'parsed.json'), json(parsed));
  for (let i = 0; i * BATCH_SIZE < pending.length; i++) {
    await writeFile(join(WORK, `batch-${i + 1}.json`), json(pending.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)));
  }
  const senses = Object.values(parsed).flat();
  console.log(`${snapshot.vocabulary.length} palabras, ${senses.length} usos, ${senses.filter((s) => s.pos).length} con categoría.`);
  console.log(`${pending.length} palabras en ${Math.ceil(pending.length / BATCH_SIZE)} lotes en ${WORK}.`);
}

async function apply() {
  const snapshot = await readJson(join(ROOT, 'content/snapshot.json'));
  const parsed = await readJson(join(WORK, 'parsed.json'));
  const answers = {};
  for (const file of (await readdir(WORK)).filter((name) => /^pos-\d+\.json$/.test(name))) Object.assign(answers, await readJson(join(WORK, file)));
  const problems = [];
  const vocabulary = snapshot.vocabulary.map((word) => {
    const senses = parsed[word.id].map((sense, index) => {
      if (sense.pos) return sense;
      const pos = answers[word.id]?.[index];
      if (!WORD_POS.includes(pos)) { problems.push(`${word.simplified} #${index + 1}: ${JSON.stringify(pos)}`); return sense; }
      return { pos, ...sense };
    });
    const { meaning: _, ...rest } = word;
    const out = {};
    // Keep the field order of a catalog row: senses where meaning was.
    for (const [key, value] of Object.entries(word)) {
      if (key === 'meaning') out.senses = senses;
      else out[key] = rest[key] ?? value;
    }
    return out;
  });
  const { createHash } = await import('node:crypto');
  const baseRevision = createHash('sha256').update(json(snapshot)).digest('hex');
  await writeFile(join(WORK, 'draft.json'), json({ schemaVersion: 1, baseRevision, snapshot: { ...snapshot, vocabulary } }));
  await writeFile(join(WORK, 'problems.json'), json(problems));
  console.log(`${problems.length} usos sin categoría válida (problems.json). Borrador en ${join(WORK, 'draft.json')}.`);
}

const action = process.argv[2];
if (action === 'split') await split();
else if (action === 'apply') await apply();
else if (action) throw new Error('Usa split o apply.');
