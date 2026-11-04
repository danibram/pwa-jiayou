#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const han = /^[\p{Script=Han}]+$/u;
const entryLine = /^([\p{Script=Han}]+)\s+([a-zA-ZüÜāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+(?:\s+[a-zA-ZüÜāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+)*)\s+(.+)$/u;

/** Read the four columns retained by pdftotext -layout. */
export function extractColumns(text) {
  const rows = [];
  const unresolved = [];
  let current;
  const append = (left, right) => [left, right].filter(Boolean).join(' ');
  for (const page of text.split('\f')) {
    const lines = page.split(/\r?\n/);
    const positions = [[], [], []];
    const pattern = /^(\p{Script=Han}+)\s{2,}(\S.*?)\s{2,}(\S.*?)\s{2,}(\S.*)$/du;
    for (const line of lines) {
      const match = line.match(pattern);
      if (match) for (let i = 0; i < 3; i++) positions[i].push(match.indices[i + 2][0]);
    }
    const mode = (values) => [...new Set(values)].sort((a, b) => values.filter((v) => v === b).length - values.filter((v) => v === a).length)[0];
    const columns = [0, ...positions.map(mode)];
    if (columns.some((value) => value === undefined)) continue;
    for (const line of lines) {
    if (!line.trim() || /^(?:Page \d+ of \d+|Vocabulario HSK Level 3|Hanzi\s+Pinyin)/i.test(line.trim())) continue;
    const [word, pinyin, english, spanish] = columns.map((start, index) => line.slice(start, columns[index + 1]).trim());
    if (word && !han.test(word)) {
      if (/\p{Script=Han}/u.test(word)) unresolved.push(line.trim());
      continue;
    }
    if (word && !pinyin && !english && !spanish) {
      if (current) current.word += word;
      else unresolved.push(word);
      continue;
    }
    if (word) {
      current = { word, sourcePinyin: pinyin, sourceEnglish: english, sourceSpanish: spanish };
      rows.push(current);
    } else if (current) {
      current.sourcePinyin = append(current.sourcePinyin, pinyin);
      current.sourceEnglish = append(current.sourceEnglish, english);
      current.sourceSpanish = append(current.sourceSpanish, spanish);
    } else if (pinyin || english || spanish) {
      unresolved.push(line.trim());
    }
    }
  }
  return { rows: rows.map((row) => ({ ...row, source: [row.word, row.sourcePinyin, row.sourceEnglish, row.sourceSpanish].filter(Boolean).join(' | ') })), unresolved };
}

/** Extract candidate rows. Keep the raw text because PDF column boundaries may be lost. */
export function extractRows(text) {
  if (/Hanzi\s{2,}Pinyin\s{2,}English\s{2,}Spanish/i.test(text)) return extractColumns(text);
  const rows = [];
  const unresolved = [];
  let pending = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^(?:Page \d+ of \d+|Hanzi\s+Pinyin|Vocabulario HSK Level 3)/i.test(line)) continue;
    if (han.test(line)) { pending += line; continue; }
    const match = line.match(entryLine);
    if (match) {
      const word = pending + match[1];
      pending = '';
      rows.push({ word, source: line.replace(/^\S+/, word) });
      continue;
    }
    if (pending && /^[a-zA-ZüÜāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/u.test(line)) {
      rows.push({ word: pending, source: `${pending} ${line}` });
      pending = '';
      continue;
    }
    if (pending) { unresolved.push(pending); pending = ''; }
    if (rows.length) rows.at(-1).source += ` ${line}`;
  }
  if (pending) unresolved.push(pending);
  return { rows, unresolved };
}

export function compare(rows, catalog, characterLevels) {
  const byWord = new Map();
  for (const word of catalog) {
    const list = byWord.get(word.simplified) ?? [];
    list.push(word);
    byWord.set(word.simplified, list);
  }
  return rows.map(({ word, source, sourcePinyin, sourceEnglish, sourceSpanish }) => {
    const matches = byWord.get(word) ?? [];
    return {
      word,
      source,
      sourcePinyin: sourcePinyin ?? null,
      sourceEnglish: sourceEnglish ?? null,
      sourceSpanish: sourceSpanish ?? null,
      entries: matches.map(({ id, level, pinyin, meaning }) => ({ id, level: level ?? null, pinyin, meaning })),
      missingCharacters: [...new Set([...word].filter((char) => characterLevels[char] === undefined))],
      status: !matches.length ? 'missing' : matches.some((entry) => entry.level && entry.level <= 3) ? 'found' : 'outside-hsk1-3',
    };
  });
}

function main(args) {
  if ((args.length !== 2 && !(args.length === 3 && args[2] === '--tsv')) || !['--pdf', '--text'].includes(args[0])) {
    throw new Error('Uso: node scripts/compare-hsk3-pdf.mjs --pdf archivo.pdf [--tsv] | --text archivo.txt [--tsv]');
  }
  const content = args[0] === '--pdf'
    ? execFileSync('pdftotext', ['-layout', args[1], '-'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
    : readFileSync(args[1], 'utf8');
  const { rows, unresolved } = extractRows(content);
  if (!rows.length) throw new Error('No se encontraron filas. Comprueba el PDF o el texto extraído.');
  const catalog = [1, 2, 3, 4, 5, 6].flatMap((level) => JSON.parse(readFileSync(resolve(root, `src/data/vocabulary/hsk${level}.json`), 'utf8')));
  catalog.push(...JSON.parse(readFileSync(resolve(root, 'src/data/vocabulary/extra.json'), 'utf8')));
  const levels = JSON.parse(readFileSync(resolve(root, 'src/data/characterLevels.json'), 'utf8'));
  const results = compare(rows, catalog, levels);
  const counts = Object.fromEntries(['found', 'missing', 'outside-hsk1-3'].map((status) => [status, results.filter((row) => row.status === status).length]));
  const seen = new Set();
  const duplicates = [...new Set(rows.map((row) => row.word).filter((word) => seen.has(word) || !seen.add(word)))];
  const translationsExtracted = results.filter((row) => row.sourceSpanish).length;
  if (args[2] === '--tsv') {
    const clean = (value) => String(value ?? '').replace(/[\t\r\n]+/g, ' ');
    const lines = [['Palabra', 'Pinyin PDF', 'Traducción PDF', 'Pinyin base', 'Traducción base', 'Estado']];
    for (const row of results) lines.push([
      row.word, row.sourcePinyin, row.sourceSpanish,
      row.entries.map((entry) => entry.pinyin).join(' / '),
      row.entries.map((entry) => entry.meaning).join(' / '), row.status,
    ]);
    process.stdout.write(`${lines.map((line) => line.map(clean).join('\t')).join('\n')}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify({ extractedRows: rows.length, translationsExtracted, counts, duplicates, unresolved, results }, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
