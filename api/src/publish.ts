import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import type { ExampleWord, HSKCharacter, HskLevel } from './types';
import { mergeForPublish } from './merge';
import {
  dataListPath,
  glossSidecarPath,
  packListPath,
} from './paths';
import {
  ensureDraftsFromSidecar,
  loadDrafts,
  loadLevelRows,
  loadOverrides,
  loadSidecar,
} from './store';

export const publishLevel = (level: HskLevel) => {
  if (level === 1) throw new Error('publish for HSK 1 is not supported');

  ensureDraftsFromSidecar(level);
  const rows = loadLevelRows(level);
  const drafts = loadDrafts(level);
  const overrides = loadOverrides(level);
  const sidecar = loadSidecar(level);

  const merged = rows.map((base) => {
    const o = overrides[base.character];
    const d = drafts[base.character];
    const sc = sidecar[base.character];

    if (level >= 4) {
      return mergeForPublish(base, d, o, sc);
    }

    // HSK 2–3: only override fields + mechanical stroke_count
    const next: HSKCharacter = { ...base };
    if (d?.stroke_count && base.stroke_count === 0) next.stroke_count = d.stroke_count;
    if (o?.gloss !== undefined) next.gloss = o.gloss;
    if (o?.definition !== undefined) next.definition = o.definition;
    if (o?.example) {
      next.example = {
        word: o.example.word ?? base.example?.word ?? '',
        pinyin: o.example.pinyin ?? base.example?.pinyin ?? '',
        es: o.example.es ?? base.example?.es ?? '',
      };
    }
    return next;
  });

  const packPath = packListPath(level);
  mkdirSync(packPath.replace(/\/[^/]+$/, ''), { recursive: true });
  writeFileSync(packPath, `${JSON.stringify(merged, null, 4)}\n`, 'utf8');

  if (level >= 4) {
    writeFileSync(dataListPath(level), `${JSON.stringify(merged, null, 4)}\n`, 'utf8');

    const glossOut: Record<string, { gloss: string; example?: ExampleWord }> = {};
    for (const row of merged) {
      if (!row.gloss) continue;
      glossOut[row.character] = {
        gloss: row.gloss,
        ...(row.example ? { example: row.example } : {}),
      };
    }
    if (existsSync(glossSidecarPath(level)) || Object.keys(glossOut).length > 0) {
      mkdirSync(glossSidecarPath(level).replace(/\/[^/]+$/, ''), { recursive: true });
      writeFileSync(glossSidecarPath(level), `${JSON.stringify(glossOut, null, 2)}\n`, 'utf8');
    }
  }

  return { level, characters: merged.length, paths: [packPath] };
};
