import { BUNDLED_LEVEL, catalogLevels, characterLevel } from '../data/catalog';
import { hskLevelsOf, wordsInLists, type ListId } from '../data/lists';
import type { VocabularyEntry } from '../data/vocabulary';
import { characterStore, parseCharacterList } from '../stores/characterStore';
import { vocabularyStore } from '../stores/vocabularyStore';
import type { HskLevel } from '../types';
import { isHskLevel } from './parse';
import { pinyinParts, syllableKey } from './pinyin';

const INSTALL_KEY = 'hsk-installed-levels';
/** Bump when cached pack URLs may hold bad bodies (e.g. HTML for missing mp3). The service worker reads this cache too. */
export const CACHE_NAME = 'hsk-packs-v2';
const USED_KEYS = ['hsk-flashcards-progress', 'hsk-flashcards-stats', 'jiayou-session-v1'];
const VOICES = ['f', 'm', 'c'] as const;
/** Parallel media requests. Thousands at once stall a phone on a slow connection. */
const PARALLEL = 6;

/** Files saved so far and files to save, for a progress bar. */
export type PackProgress = (done: number, total: number) => void;

const packSyllables = new Map<HskLevel, Set<string>>();

export const packHasClip = (level: HskLevel, key: string) => packSyllables.get(level)?.has(key) ?? false;

const base = () => import.meta.env.BASE_URL;

const downloadable = (level: HskLevel) =>
  level !== BUNDLED_LEVEL && catalogLevels.some((row) => row.level === level && row.available);

export const packPath = (level: HskLevel) => `${base()}packs/hsk${level}.json`;

export const packMediaRoot = (level: HskLevel) => `${base()}packs/hsk${level}/`;

/** The same stroke data the packs copy, for characters no pack holds. Must match the hanzi-writer-data in package.json. */
export const remoteStrokeUrl = (char: string) => `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${encodeURIComponent(char)}.json`;

/**
 * Character packs that `words` draw on. Packs follow character levels, words do not:
 * HSK 3 words use characters from HSK 2 and 4, and HSK 1 words use five from HSK 2.
 */
export const packsForWords = (words: readonly VocabularyEntry[]): HskLevel[] => {
  const packs = new Set<HskLevel>();
  for (const word of words) {
    for (const char of word.characters) {
      const level = characterLevel(char);
      if (level && downloadable(level)) packs.add(level);
    }
  }
  return [...packs].sort((a, b) => a - b);
};

export const readInstalledLevels = (): HskLevel[] | null => {
  try {
    const raw = localStorage.getItem(INSTALL_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const levels = [...new Set(parsed.filter(isHskLevel))]
      .filter((level) => level === BUNDLED_LEVEL || downloadable(level))
      .sort((a, b) => a - b);
    if (!levels.includes(BUNDLED_LEVEL)) levels.unshift(BUNDLED_LEVEL);
    return levels;
  } catch {
    return null;
  }
};

export const writeInstalledLevels = (levels: readonly HskLevel[]) => {
  const next = [...new Set(levels)]
    .filter((level) => level === BUNDLED_LEVEL || downloadable(level))
    .sort((a, b) => a - b);
  if (!next.includes(BUNDLED_LEVEL)) next.unshift(BUNDLED_LEVEL);
  localStorage.setItem(INSTALL_KEY, JSON.stringify(next));
};

/** Someone already studied here, before lists were optional. */
export const hasUsedApp = (): boolean => {
  try {
    return USED_KEYS.some((key) => localStorage.getItem(key) !== null);
  } catch {
    return false;
  }
};

const openCache = async (): Promise<Cache | null> => {
  try {
    if (!('caches' in globalThis)) return null;
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
};

const isCacheableMedia = (url: string, response: Response) => {
  if (!response.ok) return false;
  const type = response.headers.get('content-type') ?? '';
  if (url.includes('/audio/') || url.endsWith('.mp3')) {
    return type.includes('audio') || type.includes('octet-stream') || type.includes('mpeg');
  }
  if (url.includes('/strokes/') || url.endsWith('.json')) {
    return type.includes('json') || type.includes('text/plain') || type.includes('javascript');
  }
  return !type.includes('text/html');
};

/** Save `urls` that are not cached yet, a few at a time. A missing stroke or clip does not stop the rest. */
const cacheUrls = async (urls: string[], onProgress?: PackProgress) => {
  const cache = await openCache();
  if (!cache) return;
  let next = 0;
  let done = 0;
  onProgress?.(0, urls.length);
  const worker = async () => {
    while (next < urls.length) {
      const url = urls[next++];
      try {
        if (!(await cache.match(url))) {
          const response = await fetch(url);
          if (isCacheableMedia(url, response)) await cache.put(url, response.clone());
        }
      } catch {
        // Offline or missing: the word still works with the browser voice.
      }
      onProgress?.(++done, urls.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, urls.length) }, worker));
};

/** The clip list of a pack, from the cache first so audio still resolves offline. */
const registerSyllables = async (level: HskLevel) => {
  if (packSyllables.has(level)) return;
  const url = `${packMediaRoot(level)}syllables.json`;
  try {
    const cache = await openCache();
    let response = cache ? await cache.match(url) : undefined;
    if (!response) {
      const fetched = await fetch(url);
      if (!fetched.ok) return;
      if (cache && isCacheableMedia(url, fetched)) await cache.put(url, fetched.clone());
      response = fetched;
    }
    const keys: unknown = await response.json();
    if (Array.isArray(keys)) packSyllables.set(level, new Set(keys.filter((key): key is string => typeof key === 'string')));
  } catch {
    // Offline before the list was ever saved: those words use the browser voice.
  }
};

let citationKeys = new Map<string, string | null>();
let citedRevision = -1;
/** A character's own reading, used when a word's neutral tone has no clip (谢谢 → xie4). */
const citationKey = (char: string) => {
  if (citedRevision !== characterStore.listRevision) {
    citedRevision = characterStore.listRevision;
    citationKeys = new Map();
  }
  if (!citationKeys.has(char)) {
    const row = characterStore.state.characters.find((item) => item.character === char);
    const first = row?.pinyin.split(/[\s,;/]+/).find(Boolean);
    citationKeys.set(char, first ? syllableKey(first) : null);
  }
  return citationKeys.get(char) ?? null;
};

/**
 * Strokes and clips for the characters inside `words`, from whichever pack holds each one.
 * Only what these words use, not every file of every pack they touch.
 */
const wordMediaUrls = (words: readonly VocabularyEntry[]): string[] => {
  const urls = new Set<string>();
  for (const word of words) {
    const parts = pinyinParts(word.pinyin);
    const aligned = parts.length === word.characters.length;
    word.characters.forEach((char, index) => {
      const level = characterLevel(char);
      // Outside HSK: no pack and no clip, but the strokes can still be saved for offline use.
      if (!level) urls.add(remoteStrokeUrl(char));
      if (!level || !downloadable(level)) return;
      const root = packMediaRoot(level);
      urls.add(`${root}strokes/${encodeURIComponent(char)}.json`);
      const keys = [aligned ? syllableKey(parts[index].syllable) : null, citationKey(char)];
      for (const key of new Set(keys)) {
        if (!key || !packHasClip(level, key)) continue;
        for (const voice of VOICES) urls.add(`${root}audio/${voice}/${key}.mp3`);
      }
    });
  }
  return [...urls];
};

const readPack = async (level: HskLevel) => {
  const path = packPath(level);
  const cache = await openCache();
  const hit = cache ? await cache.match(path) : undefined;
  if (hit) return parseCharacterList(await hit.json(), level);
  const response = await fetch(path);
  if (!response.ok) throw new Error(`No se pudo guardar HSK ${level}.`);
  if (cache) await cache.put(path, response.clone());
  return parseCharacterList(await response.json(), level);
};

/** Drop a pack's list and every stroke or clip saved from it. */
export const forgetPack = async (level: HskLevel) => {
  packSyllables.delete(level);
  const cache = await openCache();
  if (!cache) return;
  try {
    const root = new URL(packMediaRoot(level), location.href).href;
    const keys = await cache.keys();
    await Promise.all(keys.filter((request) => request.url.startsWith(root)).map((request) => cache.delete(request)));
    await cache.delete(packPath(level));
  } catch {
    // The list is already gone from the deck.
  }
};

/** Put pack lists back in memory at start-up, from the cache. Media is topped up later by `saveStudyMedia`. */
export const loadInstalledPacks = async (levels: readonly HskLevel[]) => {
  for (const level of levels) {
    if (!downloadable(level)) continue;
    if (!characterStore.hasLevel(level)) characterStore.installCharacters(await readPack(level));
    await registerSyllables(level);
  }
};

/**
 * Download what the words of `lists` need to work offline: the character packs, then their strokes and clips.
 * The packs of HSK lists themselves must arrive; a pack only borrowed from (HSK 2 for HSK 1 words) may wait.
 * Returns the packs now on the device.
 */
export const prepareListMedia = async (lists: readonly ListId[], onProgress?: PackProgress): Promise<HskLevel[]> => {
  const words = wordsInLists(lists);
  const levels = hskLevelsOf(lists);
  const needed = packsForWords(words);
  const added: HskLevel[] = [];
  try {
    for (const level of needed) {
      if (characterStore.hasLevel(level)) continue;
      try {
        characterStore.installCharacters(await readPack(level));
        added.push(level);
      } catch (error) {
        if (levels.includes(level)) throw error;
      }
    }
  } catch (error) {
    for (const level of added) characterStore.removeLevel(level);
    throw error;
  }
  const installed = needed.filter((level) => characterStore.hasLevel(level));
  writeInstalledLevels([...(readInstalledLevels() ?? []), ...installed]);
  for (const level of installed) await registerSyllables(level);
  await cacheUrls(wordMediaUrls(words), onProgress);
  return installed;
};

/** Top up media for the lists being studied, in the background. Missing files fetch live until then. */
export const saveStudyMedia = () => prepareListMedia(vocabularyStore.state.selectedLists).catch(() => []);

/**
 * Study exactly `wanted`, and keep only the packs their words use. Characters follow the HSK lists among them.
 * A failed download leaves the previous packs in place.
 */
export const applyListChoice = async (wanted: readonly ListId[], onProgress?: PackProgress) => {
  const previous = readInstalledLevels() ?? [BUNDLED_LEVEL];
  const installed = await prepareListMedia(wanted, onProgress);
  for (const level of previous) {
    if (!downloadable(level) || installed.includes(level)) continue;
    characterStore.removeLevel(level);
    await forgetPack(level);
  }
  writeInstalledLevels(installed);
  if (wanted.length === 0) return;
  vocabularyStore.selectLists(wanted);
  const levels = hskLevelsOf(wanted);
  if (levels.length > 0) characterStore.selectLevels(levels);
};
