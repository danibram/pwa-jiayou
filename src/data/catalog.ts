import type { HskLevel } from '../types';
import { isHskLevel } from '../utils/parse';
import rawLevels from './characterLevels.json';

const characterLevels = rawLevels as Record<string, number>;

/** HanziDB counts for levels that have no character list in the app yet. */
const ANNOUNCED: Partial<Record<HskLevel, number>> = {
  4: 447,
  5: 621,
  6: 978,
};

export interface CatalogLevel {
  level: HskLevel;
  count: number;
  /** The character list ships with the app or can be downloaded. */
  available: boolean;
}

const listedCounts = () => {
  const counts = new Map<HskLevel, number>();
  for (const value of Object.values(characterLevels)) {
    if (!isHskLevel(value)) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
};

const counts = listedCounts();

export const BUNDLED_LEVEL: HskLevel = 1;

export const catalogLevels: CatalogLevel[] = ([1, 2, 3, 4, 5, 6] as const).map((level) => {
  const listed = counts.get(level) ?? 0;
  if (listed > 0) return { level, count: listed, available: true };
  return { level, count: ANNOUNCED[level] ?? 0, available: false };
});

export const catalogLevel = (level: HskLevel): CatalogLevel => {
  const found = catalogLevels.find((row) => row.level === level);
  if (!found) throw new Error(`HSK ${level} no está en el catálogo.`);
  return found;
};

export const characterLevel = (char: string): HskLevel | undefined => {
  const level = characterLevels[char];
  return isHskLevel(level) ? level : undefined;
};
