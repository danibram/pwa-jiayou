import type { OverrideEntry } from './types';
import {
  findRowByChar,
  loadOverrides,
  parseLevelParam,
  saveOverrides,
} from './store';

const deepMergeOverride = (prev: OverrideEntry | undefined, patch: OverrideEntry): OverrideEntry => ({
  ...prev,
  ...patch,
  example: patch.example
    ? { ...prev?.example, ...patch.example }
    : prev?.example,
});

export const putOverride = (char: string, patch: OverrideEntry) => {
  const found = findRowByChar(char);
  if (!found) return null;
  const all = loadOverrides(found.level);
  all[char] = deepMergeOverride(all[char], patch);
  saveOverrides(found.level, all);
  return { level: found.level, character: char, override: all[char] };
};

export const deleteOverride = (char: string) => {
  const found = findRowByChar(char);
  if (!found) return null;
  const all = loadOverrides(found.level);
  if (!(char in all)) return { level: found.level, character: char, removed: false };
  delete all[char];
  saveOverrides(found.level, all);
  return { level: found.level, character: char, removed: true };
};

export { parseLevelParam };
