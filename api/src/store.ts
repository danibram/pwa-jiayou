import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DraftEntry, HSKCharacter, HskLevel, OverrideEntry } from './types';
import {
  draftPath,
  glossSidecarPath,
  listPath,
  overridePath,
} from './paths';
import { parseBaseRow as parseRow } from './merge';

type Sidecar = Record<string, { gloss?: string; example?: HSKCharacter['example'] }>;

const readJson = <T>(path: string, fallback: T): T => {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8')) as T;
};

const writeJson = (path: string, data: unknown) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
};

export const loadLevelRows = (level: HskLevel): HSKCharacter[] => {
  const path = listPath(level);
  if (!path) throw new Error(`HSK ${level}: no list file`);
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>[];
  return raw.map((row) => parseRow(row));
};

export const findRowByChar = (char: string): { level: HskLevel; base: HSKCharacter } | null => {
  for (const level of [1, 2, 3, 4, 5, 6] as const) {
    const path = listPath(level);
    if (!path) continue;
    const rows = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>[];
    const hit = rows.find((r) => r.character === char);
    if (hit) return { level, base: parseRow(hit) };
  }
  return null;
};

export const loadDrafts = (level: HskLevel): Record<string, DraftEntry> =>
  readJson(draftPath(level), {});

export const saveDrafts = (level: HskLevel, data: Record<string, DraftEntry>) =>
  writeJson(draftPath(level), data);

export const loadOverrides = (level: HskLevel): Record<string, OverrideEntry> =>
  readJson(overridePath(level), {});

export const saveOverrides = (level: HskLevel, data: Record<string, OverrideEntry>) =>
  writeJson(overridePath(level), data);

export const loadSidecar = (level: HskLevel): Sidecar => readJson(glossSidecarPath(level), {});

/** Copy HSK 4–5 gloss sidecars into drafts once when draft file is missing. */
export const ensureDraftsFromSidecar = (level: HskLevel) => {
  if (level < 4) return;
  const path = draftPath(level);
  if (existsSync(path)) return;
  const sidecar = loadSidecar(level);
  if (Object.keys(sidecar).length === 0) return;
  const drafts: Record<string, DraftEntry> = {};
  for (const [char, entry] of Object.entries(sidecar)) {
    drafts[char] = {
      gloss: entry.gloss,
      ...(entry.example ? { example: entry.example } : {}),
    };
  }
  saveDrafts(level, drafts);
};

export const parseLevelParam = (value: string): HskLevel | null => {
  const n = Number(value);
  if (n >= 1 && n <= 6 && Number.isInteger(n)) return n as HskLevel;
  return null;
};
