import type { CharacterJson } from 'hanzi-writer';
import { characterLevel } from '../data/catalog';
import { openCacheFor, packMediaRoot, remoteStrokeUrl } from './levelPacks';
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

const strokeUrls = (char: string) => {
  const base = import.meta.env.BASE_URL;
  const encoded = encodeURIComponent(char);
  const urls = [`${base}strokes/${encoded}.json`];
  const level = characterLevel(char);
  if (level && level > 1) urls.push(`${packMediaRoot(level)}strokes/${encoded}.json`);
  return urls;
};

/** `keep`: save a fetched copy. Bundled and pack files are cached when their list is saved; the CDN's are kept on first use. */
const loadFrom = async (url: string, keep: boolean) => {
  const cacheStorage = await openCacheFor(url);
  const hit = cacheStorage ? await cacheStorage.match(url) : undefined;
  if (hit) return parseCharacterJson(await hit.json());
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No stroke data at ${url}`);
  const data = parseCharacterJson(await response.clone().json());
  if (keep && cacheStorage) await cacheStorage.put(url, response);
  return data;
};

/** Stroke data: HSK 1 in public/strokes, other levels in their downloadable pack, anything else from the CDN. */
export const loadStrokeData = (char: string): Promise<CharacterJson> => {
  let pending = cache.get(char);
  if (!pending) {
    pending = (async () => {
      let lastError: unknown;
      const remote = remoteStrokeUrl(char);
      for (const url of [...strokeUrls(char), remote]) {
        try {
          return await loadFrom(url, url === remote);
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError ?? new Error(`No stroke data for ${char}`);
    })();
    pending.catch(() => cache.delete(char));
    cache.set(char, pending);
  }
  return pending;
};

/** Reads a theme token from :root as an rgb() string for libraries that need literal colours. */
export const themeColor = (token: string, alpha = 1): string => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim();
  // Without the stylesheet (tests, a page still loading) fall back to a neutral grey.
  const [r, g, b] = raw ? raw.split(/\s+/) : ['128', '128', '128'];
  return alpha === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/** Blends one theme token over another, for libraries where alpha would double up on overlaps. */
export const themeMix = (fg: string, bg: string, amount: number): string => {
  const read = (token: string) => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim();
    return raw ? raw.split(/\s+/).map(Number) : [128, 128, 128];
  };
  const [a, b] = [read(fg), read(bg)];
  const mixed = a.map((v, i) => Math.round(v * amount + b[i] * (1 - amount)));
  return `rgb(${mixed.join(', ')})`;
};
