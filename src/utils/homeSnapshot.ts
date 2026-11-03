import { homeLastKey } from '../persistence/keys';
import { storage } from '../persistence/keyValue';

export type HomeMode = 'vocabulary' | 'characters';

/** The counts Home showed, so the next visit can say what changed. */
export interface HomeSnapshot {
  mastered: number;
  learning: number;
}

/** What Home showed last time, per mode and level set. Read once per visit, then replaced, so each gain is named once. */
export const readHomeSnapshot = (mode: HomeMode, scope: string): HomeSnapshot | null => {
  try {
    const value: unknown = JSON.parse(storage.read(homeLastKey(mode)) ?? 'null');
    if (!value || typeof value !== 'object') return null;
    const { mastered, learning, scope: saved } = value as Record<string, unknown>;
    // Different levels mean different totals; comparing them would invent gains.
    if (saved !== scope || !Number.isInteger(mastered) || !Number.isInteger(learning)) return null;
    return { mastered: mastered as number, learning: learning as number };
  } catch {
    return null;
  }
};

export const rememberHomeSnapshot = (mode: HomeMode, scope: string, summary: HomeSnapshot) => {
  try {
    storage.write(homeLastKey(mode), JSON.stringify({ scope, mastered: summary.mastered, learning: summary.learning }));
  } catch { /* The gain line is a nicety; storage may be full or blocked. */ }
};
