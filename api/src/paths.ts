import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { HskLevel } from './types';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

export const listPath = (level: HskLevel): string | null => {
  if (level === 1) return join(repoRoot, 'src/data/hsk1.json');
  const pack = join(repoRoot, `public/packs/hsk${level}.json`);
  if (existsSync(pack)) return pack;
  const data = join(repoRoot, `src/data/hsk${level}.json`);
  if (existsSync(data)) return data;
  return null;
};

export const dataListPath = (level: HskLevel) => join(repoRoot, `src/data/hsk${level}.json`);

export const packListPath = (level: HskLevel) => join(repoRoot, `public/packs/hsk${level}.json`);

export const glossSidecarPath = (level: HskLevel) => join(repoRoot, `src/data/glosses/hsk${level}.json`);

export const draftPath = (level: HskLevel) => join(repoRoot, `src/data/drafts/hsk${level}.json`);

export const overridePath = (level: HskLevel) => join(repoRoot, `src/data/overrides/hsk${level}.json`);

export const strokeFilePath = (level: HskLevel, character: string) => {
  if (level === 1) return join(repoRoot, `public/strokes/${character}.json`);
  return join(repoRoot, `public/packs/hsk${level}/strokes/${character}.json`);
};

export const globalAudioPath = (voice: 'f' | 'm' | 'c', key: string) =>
  join(repoRoot, `public/audio/${voice}/${key}.mp3`);

export const hanziWriterStrokeSource = (character: string) =>
  join(repoRoot, 'node_modules/hanzi-writer-data', `${character}.json`);
