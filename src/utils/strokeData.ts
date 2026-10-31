import type { CharacterJson } from 'hanzi-writer';
import { isFiniteNumber, isNonEmpty, isRecord, isString } from './parse';

const cache = new Map<string, Promise<CharacterJson>>();

const isPoint = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length >= 2 && value.every(isFiniteNumber);

const isMedian = (value: unknown): value is number[][] =>
  Array.isArray(value) && isNonEmpty(value) && value.every(isPoint);

const parseCharacterJson = (value: unknown): CharacterJson => {
  if (!isRecord(value) || !Array.isArray(value.strokes) || !isNonEmpty(value.strokes) || !value.strokes.every(isString)) {
    throw new Error('Los trazos no tienen un formato válido.');
  }
  if (!Array.isArray(value.medians) || !value.medians.every(isMedian)) {
    throw new Error('Los trazos no tienen un formato válido.');
  }
  const data: CharacterJson = { strokes: value.strokes, medians: value.medians };
  if (value.radStrokes !== undefined) {
    if (!Array.isArray(value.radStrokes) || !value.radStrokes.every(isFiniteNumber)) {
      throw new Error('Los trazos no tienen un formato válido.');
    }
    data.radStrokes = value.radStrokes;
  }
  return data;
};

/** Stroke data ships in public/strokes so the mode works offline. */
export const loadStrokeData = (char: string): Promise<CharacterJson> => {
  let pending = cache.get(char);
  if (!pending) {
    pending = fetch(`${import.meta.env.BASE_URL}strokes/${encodeURIComponent(char)}.json`).then(
      async (res) => {
        if (!res.ok) throw new Error(`No stroke data for ${char}`);
        const body: unknown = await res.json();
        return parseCharacterJson(body);
      }
    );
    pending.catch(() => cache.delete(char));
    cache.set(char, pending);
  }
  return pending;
};

/** Reads a theme token from :root as an rgb() string for libraries that need literal colours. */
export const themeColor = (token: string, alpha = 1): string => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim();
  const [r, g, b] = raw.split(/\s+/);
  return alpha === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/** Blends one theme token over another, for libraries where alpha would double up on overlaps. */
export const themeMix = (fg: string, bg: string, amount: number): string => {
  const read = (token: string) =>
    getComputedStyle(document.documentElement)
      .getPropertyValue(`--${token}`)
      .trim()
      .split(/\s+/)
      .map(Number);
  const [a, b] = [read(fg), read(bg)];
  const mixed = a.map((v, i) => Math.round(v * amount + b[i] * (1 - amount)));
  return `rgb(${mixed.join(', ')})`;
};
