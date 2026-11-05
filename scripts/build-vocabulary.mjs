// Fetch HSK 2.0 exclusive wordlists and write per-level VocabularyEntry JSON.
// Meanings stay English until localize-vocabulary.mjs runs.
// Usage: node scripts/build-vocabulary.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wordId } from './syllable-keys.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'apps/web/src/data/vocabulary');
const SOURCE_BASE =
  'https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/wordlists/exclusive/old';
const SOURCE_ID = 'hsk-2-0';
const LEVELS = [1, 2, 3, 4, 5, 6];

// Pilot topic tags (sense-level). New words get [].
const topicsByWord = {
  爱: ['verbos', 'sentimientos'],
  八: ['numeros'],
  爸爸: ['familia'],
  杯子: ['comida'],
  北京: ['lugares'],
  本: ['gramatica'],
  不: ['gramatica'],
  不客气: ['sentimientos'],
  菜: ['comida'],
  茶: ['comida'],
  吃: ['verbos', 'comida'],
  出租车: ['transporte'],
  打电话: ['verbos'],
  的: ['gramatica'],
  点: ['tiempo'],
  都: ['gramatica'],
  读: ['verbos', 'escuela'],
  对不起: ['sentimientos'],
  多少: ['preguntas'],
  儿子: ['familia', 'personas'],
  二: ['numeros'],
  飞机: ['transporte'],
  分钟: ['tiempo'],
  喝: ['verbos', 'comida'],
  很: ['gramatica'],
  家: ['familia', 'casa'],
  今天: ['tiempo'],
  老师: ['escuela', 'trabajos', 'personas'],
  妈妈: ['familia', 'personas'],
  明天: ['tiempo'],
  朋友: ['familia', 'personas'],
  谢谢: ['sentimientos'],
  学生: ['escuela', 'personas'],
};

// Word-specific readings (often neutral) that must not follow citation tones.
const pinyinByWord = {
  东西: 'dōng xi',
  多少: 'duō shao',
  对不起: 'duì bu qǐ',
  爸爸: 'bà ba',
  妈妈: 'mā ma',
  谢谢: 'xiè xie',
  学生: 'xué sheng',
  朋友: 'péng you',
};

const firstSense = (meanings) => {
  if (!Array.isArray(meanings) || meanings.length === 0) return '';
  const raw = String(meanings[0] ?? '').trim();
  return raw.split(/[;；]/)[0]?.trim() ?? raw;
};

const toEntry = (row, level) => {
  const simplified = String(row.simplified ?? '').trim();
  if (!simplified) throw new Error(`Entrada sin simplified en HSK ${level}`);
  const form = Array.isArray(row.forms) ? row.forms[0] : null;
  if (!form) throw new Error(`Sin forms para ${simplified} (HSK ${level})`);
  const traditional = String(form.traditional ?? simplified).trim() || simplified;
  const pinyin = pinyinByWord[simplified] ?? String(form.transcriptions?.pinyin ?? '').trim();
  if (!pinyin) throw new Error(`Sin pinyin para ${simplified} (HSK ${level})`);
  const meaning = firstSense(form.meanings);
  if (!meaning) throw new Error(`Sin meaning para ${simplified} (HSK ${level})`);

  return {
    id: wordId(simplified, pinyin),
    simplified,
    traditional,
    pinyin,
    meaning,
    meaningEn: meaning,
    level,
    characters: [...simplified],
    topicIds: topicsByWord[simplified] ?? [],
    sourceId: SOURCE_ID,
  };
};

const fetchLevel = async (level) => {
  const url = `${SOURCE_BASE}/${level}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar HSK ${level}: HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`Lista vacía para HSK ${level}`);
  }
  return data.map((row) => toEntry(row, level));
};

mkdirSync(outDir, { recursive: true });

const summary = [];
for (const level of LEVELS) {
  console.log(`Descargando HSK ${level}…`);
  const entries = await fetchLevel(level);
  const path = join(outDir, `hsk${level}.json`);
  writeFileSync(path, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
  summary.push({ level, count: entries.length, path: `apps/web/src/data/vocabulary/hsk${level}.json` });
  console.log(`HSK ${level}: ${entries.length} palabras → ${path}`);
}

writeFileSync(join(outDir, 'build-manifest.json'), `${JSON.stringify({
  source: SOURCE_BASE,
  sourceId: SOURCE_ID,
  retrieved: new Date().toISOString().slice(0, 10),
  levels: summary,
}, null, 2)}\n`, 'utf8');

console.log('Listo.');
