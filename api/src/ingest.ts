import { existsSync, readFileSync } from 'node:fs';
import type { DraftEntry, HskLevel } from './types';
import { lockedFromOverride } from './merge';
import { fetchCharacterPage, parseExampleFromPage, parseTraditional } from './hanzidb';
import { strokeFilePath } from './paths';
import { shortGloss, translateDefinition } from './translate';
import {
  ensureDraftsFromSidecar,
  loadDrafts,
  loadLevelRows,
  loadOverrides,
  saveDrafts,
} from './store';

const strokeCountFor = (level: HskLevel, character: string): number | undefined => {
  const path = strokeFilePath(level, character);
  if (!existsSync(path)) return undefined;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { strokes?: unknown[] };
    return Array.isArray(raw.strokes) ? raw.strokes.length : undefined;
  } catch {
    return undefined;
  }
};

export interface IngestOptions {
  fetch?: boolean;
  translate?: boolean;
}

export const ingestLevel = async (level: HskLevel, options: IngestOptions) => {
  if (options.translate && level <= 3) {
    throw new Error('translate is only allowed for HSK 4–6');
  }

  ensureDraftsFromSidecar(level);
  const rows = loadLevelRows(level);
  const drafts = loadDrafts(level);
  const overrides = loadOverrides(level);
  let updated = 0;

  for (const row of rows) {
    const locked = lockedFromOverride(overrides[row.character]);
    const draft: DraftEntry = { ...drafts[row.character] };

    const strokes = strokeCountFor(level, row.character);
    if (strokes && row.stroke_count === 0) {
      draft.stroke_count = strokes;
    }

    if (options.fetch) {
      await new Promise((r) => setTimeout(r, 120));
      const html = await fetchCharacterPage(row.character);
      if (html) {
        const trad = parseTraditional(html);
        if (trad) draft.traditional = trad;
        if (!locked['example.word'] || !locked['example.pinyin']) {
          const ex = parseExampleFromPage(html, row.character);
          if (ex) {
            draft.example = {
              ...draft.example,
              word: locked['example.word'] ? draft.example?.word : ex.word,
              pinyin: locked['example.pinyin'] ? draft.example?.pinyin : ex.pinyin,
            };
          }
        }
      }
    }

    if (options.translate) {
      const english = row.definition || row.gloss || '';
      if (!locked.gloss) {
        const definitionEs = await translateDefinition(english);
        draft.definition = definitionEs;
        draft.gloss = shortGloss(definitionEs);
      }
      if (!locked['example.es'] && draft.example?.word) {
        const es = shortGloss(await translateDefinition(firstSenseEnglish(english)));
        draft.example = { ...draft.example, es };
      }
    }

    const prev = JSON.stringify(drafts[row.character] ?? {});
    drafts[row.character] = draft;
    if (JSON.stringify(draft) !== prev) updated += 1;
  }

  saveDrafts(level, drafts);
  return { level, characters: rows.length, updated };
};

const firstSenseEnglish = (text: string) => text.split(/[;；]/)[0]?.trim() ?? '';
