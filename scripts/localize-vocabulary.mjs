// Spanish meanings for vocabulary/hskN.json.
// Curated overrides → single-char character glosses → EN→ES (gtx / MyMemory).
// Resume: node scripts/localize-vocabulary.mjs --level 1
// All:    node scripts/localize-vocabulary.mjs
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vocabDir = join(root, 'apps/web/src/data/vocabulary');
const curatedDir = join(vocabDir, 'curated');
const glossDir = join(root, 'apps/web/src/data/glosses');
const cachePath = join(vocabDir, '.translate-cache.json');
const args = process.argv.slice(2);
const levelArg = args.find((a) => a.startsWith('--level='))?.split('=')[1] ?? args[args.indexOf('--level') + 1];
const levels = levelArg ? [Number(levelArg)] : [1, 2, 3, 4, 5, 6];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const loadJson = (path, fallback) => {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
};

const loadCurated = () => {
  const map = {};
  if (!existsSync(curatedDir)) return map;
  for (const name of readdirSync(curatedDir)) {
    if (!name.endsWith('.json')) continue;
    const data = loadJson(join(curatedDir, name), {});
    if (!data || typeof data !== 'object' || Array.isArray(data)) continue;
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string' && value.trim()) map[key] = value.trim();
    }
  }
  return map;
};

const loadCharacterGlosses = () => {
  const map = {};
  if (!existsSync(glossDir)) return map;
  for (const name of readdirSync(glossDir)) {
    if (!/^hsk\d\.json$/.test(name)) continue;
    const data = loadJson(join(glossDir, name), {});
    for (const [char, entry] of Object.entries(data)) {
      if (entry && typeof entry.gloss === 'string' && entry.gloss.trim()) {
        map[char] = entry.gloss.trim();
      }
    }
  }
  for (const level of [1, 2, 3, 4, 5, 6]) {
    for (const rel of [`apps/web/src/data/hsk${level}.json`, `apps/web/public/packs/hsk${level}.json`]) {
      const path = join(root, rel);
      if (!existsSync(path)) continue;
      const rows = loadJson(path, []);
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        if (typeof row?.character === 'string' && typeof row?.gloss === 'string' && row.gloss.trim()) {
          map[row.character] ??= row.gloss.trim();
        }
      }
    }
  }
  return map;
};

const loadCache = () => {
  const raw = loadJson(cachePath, {});
  return {
    byWord: raw.byWord && typeof raw.byWord === 'object' ? raw.byWord : {},
    byEn: raw.byEn && typeof raw.byEn === 'object' ? raw.byEn : {},
  };
};

const saveCache = (cache) => {
  writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
};

const translateEnEs = async (text) => {
  const chunk = text.trim().slice(0, 450);
  if (!chunk) return '';
  const headers = { 'User-Agent': 'jiayou-localize/1.0' };

  for (let round = 1; round <= 4; round++) {
    await sleep(200 * round);
    try {
      const mm = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|es`,
        { headers },
      );
      if (mm.status === 429) {
        await sleep(3_000 * round);
        continue;
      }
      if (mm.ok) {
        const data = await mm.json();
        if (data.responseStatus === 200 && data.responseData?.translatedText) {
          const out = String(data.responseData.translatedText).trim();
          if (out && out.toLowerCase() !== chunk.toLowerCase() && !/^MYMEMORY WARNING/i.test(out)) {
            return out;
          }
        }
      }
    } catch {
      /* try gtx */
    }
    try {
      const gtx = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=es&dt=t&q=${encodeURIComponent(chunk)}`;
      const res = await fetch(gtx, { headers });
      if (!res.ok) continue;
      const type = res.headers.get('content-type') ?? '';
      if (!type.includes('json') && !type.includes('javascript')) continue;
      const data = await res.json();
      const out = data[0].map((part) => part[0]).join('').trim();
      if (out) return out;
    } catch {
      /* retry */
    }
  }
  return '';
};

const looksEnglish = (text) => /^[A-Za-z0-9]/.test(text.trim()) && !/[áéíóúüñÁÉÍÓÚÜÑ¿¡]/.test(text);

const resolveSpanish = async (row, curated, glosses, cache) => {
  const curatedMeaning = curated[row.simplified];
  if (curatedMeaning) return curatedMeaning;

  const byWord = cache.byWord[row.simplified];
  if (typeof byWord === 'string' && byWord.trim()) return byWord.trim();

  const meaning = String(row.meaning ?? '').trim();
  const en = String(row.meaningEn ?? '').trim();

  // Already localized in a previous pass (meaningEn stripped or diverged).
  if (meaning && en && meaning !== en) return meaning;
  if (meaning && !en && !looksEnglish(meaning)) return meaning;

  if (row.characters?.length === 1) {
    const gloss = glosses[row.simplified];
    if (gloss) return gloss;
  }

  const sourceEn = en || (looksEnglish(meaning) ? meaning : '');
  if (!sourceEn) return meaning || '';

  if (!row.meaningEn) row.meaningEn = sourceEn;

  const cachedEn = cache.byEn[sourceEn];
  if (typeof cachedEn === 'string' && cachedEn.trim()) return cachedEn.trim();

  const es = await translateEnEs(sourceEn);
  if (!es) return '';
  cache.byEn[sourceEn] = es;
  return es;
};

const dataPath = (level) => join(vocabDir, `hsk${level}.json`);

const localizeLevel = async (level, curated, glosses, cache) => {
  const path = dataPath(level);
  if (!existsSync(path)) throw new Error(`Falta ${path}. Ejecuta build-vocabulary.mjs primero.`);
  const rows = JSON.parse(readFileSync(path, 'utf8'));
  let done = 0;
  let translated = 0;
  const failed = [];

  for (const row of rows) {
    const beforeKeys = Object.keys(cache.byEn).length;
    const es = await resolveSpanish(row, curated, glosses, cache);
    if (!es) {
      failed.push(row.simplified);
      continue;
    }
    row.meaning = es;
    cache.byWord[row.simplified] = es;
    if (Object.keys(cache.byEn).length > beforeKeys) translated += 1;
    done += 1;

    if (translated > 0 && translated % 25 === 0) {
      saveCache(cache);
      writeFileSync(path, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
      console.log(`HSK ${level}: ${done}/${rows.length} (${translated} MT nuevas)`);
    }
  }

  for (const row of rows) delete row.meaningEn;

  saveCache(cache);
  writeFileSync(path, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
  console.log(`HSK ${level}: listo (${done}/${rows.length}, ${translated} MT, ${failed.length} fallos)`);
  if (failed.length) {
    console.warn(
      `HSK ${level}: sin traducción (${failed.length}): ${failed.slice(0, 12).join(' ')}${failed.length > 12 ? '…' : ''}`,
    );
  }
};

const collectPendingEnglish = (levelList, curatedMap, glossMap, translationCache) => {
  const pending = new Set();
  for (const level of levelList) {
    const path = dataPath(level);
    if (!existsSync(path)) continue;
    const rows = JSON.parse(readFileSync(path, 'utf8'));
    for (const row of rows) {
      if (curatedMap[row.simplified] || translationCache.byWord[row.simplified]) continue;
      const meaning = String(row.meaning ?? '').trim();
      const en = String(row.meaningEn ?? '').trim();
      if (meaning && en && meaning !== en) continue;
      if (meaning && !en && !looksEnglish(meaning)) continue;
      if (row.characters?.length === 1 && glossMap[row.simplified]) continue;
      const sourceEn = en || (looksEnglish(meaning) ? meaning : '');
      if (!sourceEn || translationCache.byEn[sourceEn]) continue;
      pending.add(sourceEn);
    }
  }
  return [...pending];
};

const translatePool = async (phrases, translationCache, concurrency = 2) => {
  let index = 0;
  let done = 0;
  let ok = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (index < phrases.length) {
      const current = index;
      index += 1;
      const phrase = phrases[current];
      if (translationCache.byEn[phrase]) {
        done += 1;
        ok += 1;
        continue;
      }
      const es = await translateEnEs(phrase);
      if (es) {
        translationCache.byEn[phrase] = es;
        ok += 1;
      }
      done += 1;
      if (done % 25 === 0 || done === phrases.length) {
        saveCache(translationCache);
        console.log(`MT pool: ${done}/${phrases.length} (ok ${ok})`);
      }
    }
  });
  await Promise.all(workers);
};

mkdirSync(curatedDir, { recursive: true });
const curated = loadCurated();
const glosses = loadCharacterGlosses();
const cache = loadCache();
console.log(
  `Curated: ${Object.keys(curated).length}; glosses: ${Object.keys(glosses).length}; cache words: ${Object.keys(cache.byWord).length}; cache en: ${Object.keys(cache.byEn).length}`,
);

const pendingEnglish = collectPendingEnglish(levels, curated, glosses, cache);
if (pendingEnglish.length > 0) {
  console.log(`Traduciendo ${pendingEnglish.length} sentidos únicos…`);
  await translatePool(pendingEnglish, cache);
}

for (const level of levels) {
  if (!Number.isFinite(level) || level < 1 || level > 6) continue;
  console.log(`Localizando vocabulario HSK ${level}…`);
  await localizeLevel(level, curated, glosses, cache);
}
