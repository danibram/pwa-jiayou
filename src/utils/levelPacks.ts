import { BUNDLED_LEVEL, catalogLevels, characterLevel } from '../data/catalog';
import { hskLevelsOf, type ListId } from '../data/lists';
import { wordsInLists } from '../stores/studyLists';
import type { VocabularyEntry } from '../data/vocabulary';
import { characterStore, parseCharacterList } from '../stores/characterStore';
import { vocabularyStore } from '../stores/vocabularyStore';
import type { HskLevel } from '../types';
import { isHskLevel } from './parse';
import { KEYS } from '../persistence/keys';
import { storage } from '../persistence/keyValue';
import { pinyinParts, syllableKey } from './pinyin';
import { createSignal } from 'solid-js';
import clips from '../data/syllable-clips.json';
import cmnClips from '../data/syllable-clips-cmn.json';

export const CACHE_NAME = typeof __MEDIA_CACHE__ === 'string' ? __MEDIA_CACHE__ : 'hsk-packs-test';
const bundledClips = new Set(clips);
const mainlandClips = new Set(cmnClips);
type DownloadState = { state: 'idle' | 'downloading' | 'ready' | 'error'; done: number; total: number };
const [downloadState, setDownloadState] = createSignal<DownloadState>({ state: 'idle', done: 0, total: 0 });
export { downloadState };
const USED_KEYS = [KEYS.characterDeck, KEYS.progress];
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
    const raw = storage.read(KEYS.installedLevels);
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
  storage.write(KEYS.installedLevels, JSON.stringify(next));
};

/** Someone already studied here, before lists were optional. */
export const hasUsedApp = (): boolean => {
  try {
    return USED_KEYS.some((key) => storage.read(key) !== null);
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

const previousCopy = async (url: string, cache: Cache | null): Promise<Response | undefined> => {
  if (!cache || typeof caches.keys !== 'function') return undefined;
  for (const name of (await caches.keys()).filter((item) => item.startsWith('hsk-packs-') && item !== CACHE_NAME).reverse()) {
    const hit = await (await caches.open(name)).match(url);
    if (hit) {
      const headers = new Headers(hit.headers);
      headers.set('x-jiayou-stale', '1');
      const stale = new Response(await hit.arrayBuffer(), { status: hit.status, statusText: hit.statusText, headers });
      await cache.put(url, stale.clone());
      return stale;
    }
  }
  return undefined;
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
  if (!cache) throw new Error('El navegador no permite guardar archivos sin conexión.');
  let next = 0;
  let done = 0;
  let failed = 0;
  onProgress?.(0, urls.length);
  const worker = async () => {
    while (next < urls.length) {
      const url = urls[next++];
      try {
        const hit = await cache.match(url);
        if (!hit || hit.headers.get('x-jiayou-stale')) {
          const response = await fetch(url);
          if (!isCacheableMedia(url, response)) throw new Error('Archivo no disponible');
          await cache.put(url, response.clone());
        }
      } catch {
        try { if (!(await previousCopy(url, cache))) failed++; } catch { failed++; }
      }
      onProgress?.(++done, urls.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, urls.length) }, worker));
  if (failed) throw new Error(`No se pudieron guardar ${failed} archivos.`);
};

/** The clip list of a pack, from the cache first so audio still resolves offline. */
const registerSyllables = async (level: HskLevel) => {
  if (packSyllables.has(level)) return;
  const url = `${packMediaRoot(level)}syllables.json`;
  try {
    const cache = await openCache();
    let response = cache ? await cache.match(url) : undefined;
    if (!response || response.headers.get('x-jiayou-stale')) {
      const stale = response;
      let fetched: Response;
      try { fetched = await fetch(url); } catch {
        const old = await previousCopy(url, cache);
        if (!old && !stale) throw new Error('Índice de audio no disponible');
        fetched = (old ?? stale)!;
      }
      if (!fetched.ok) throw new Error('Índice de audio no disponible');
      if (cache && isCacheableMedia(url, fetched)) await cache.put(url, fetched.clone());
      response = fetched;
    }
    const keys: unknown = await response.json();
    if (Array.isArray(keys)) packSyllables.set(level, new Set(keys.filter((key): key is string => typeof key === 'string')));
  } catch {
    throw new Error(`No se pudo preparar el audio de HSK ${level}.`);
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
      const keys = [aligned ? syllableKey(parts[index].syllable) : null, citationKey(char)];
      for (const key of new Set(keys)) {
        if (!key || !bundledClips.has(key)) continue;
        for (const voice of VOICES) {
          const actualVoice = voice === 'c' && !mainlandClips.has(key) ? 'f' : voice;
          urls.add(`${base()}audio/${actualVoice}/${key}.mp3`);
        }
      }
      // Outside HSK: no pack and no clip, but the strokes can still be saved for offline use.
      if (!level) urls.add(remoteStrokeUrl(char));
      if (!level || !downloadable(level)) return;
      const root = packMediaRoot(level);
      urls.add(`${root}strokes/${encodeURIComponent(char)}.json`);
      for (const key of new Set(keys)) {
        if (!key || bundledClips.has(key) || !packHasClip(level, key)) continue;
        for (const voice of VOICES) {
          const actualVoice = voice === 'c' && !mainlandClips.has(key) ? 'f' : voice;
          urls.add(`${root}audio/${actualVoice}/${key}.mp3`);
        }
      }
    });
  }
  return [...urls];
};

const readPack = async (level: HskLevel) => {
  const path = packPath(level);
  const cache = await openCache();
  const hit = cache ? await cache.match(path) : undefined;
  if (hit && !hit.headers.get('x-jiayou-stale')) return parseCharacterList(await hit.json(), level);
  let response: Response;
  try {
    response = await fetch(path);
    if (!response.ok) throw new Error('Paquete no disponible');
  } catch {
    const old = await previousCopy(path, cache);
    if (!old && !hit) throw new Error(`No se pudo guardar HSK ${level}.`);
    response = (old ?? hit)!;
  }
  if (!response.ok) throw new Error(`No se pudo guardar HSK ${level}.`);
  const rows = parseCharacterList(await response.clone().json(), level);
  if (cache) await cache.put(path, response);
  return rows;
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
  const needed = packsForWords(words);
  packSyllables.clear();
  for (const level of needed) {
    characterStore.installCharacters(await readPack(level));
  }
  const installed = needed.filter((level) => characterStore.hasLevel(level));
  writeInstalledLevels([...(readInstalledLevels() ?? []), ...installed]);
  for (const level of installed) await registerSyllables(level);
  await cacheUrls(wordMediaUrls(words), onProgress);
  return installed;
};

/** Top up media for the lists being studied, in the background. Missing files fetch live until then. */
let pendingMedia: Promise<unknown> = Promise.resolve();

export const saveStudyMedia = () => {
  const run = pendingMedia.catch(() => {}).then(() => downloadLists(vocabularyStore.state.selectedLists)).catch(() => []);
  pendingMedia = run;
  return run;
};

const downloadLists = async (lists: readonly ListId[], onProgress?: PackProgress) => {
  setDownloadState({ state: 'downloading', done: 0, total: 0 });
  try {
    const installed = await prepareListMedia(lists, (done, total) => {
      setDownloadState({ state: 'downloading', done, total });
      onProgress?.(done, total);
    });
    setDownloadState((state) => ({ ...state, state: 'ready' }));
    return installed;
  } catch (error) {
    setDownloadState((state) => ({ ...state, state: 'error' }));
    throw error;
  }
};

/**
 * Study exactly `wanted`, and keep only the packs their words use. Characters follow the HSK lists among them.
 * The selection takes effect immediately while its media downloads.
 */
export const applyListChoice = async (wanted: readonly ListId[], onProgress?: PackProgress) => {
  if (wanted.length === 0) return;
  vocabularyStore.selectLists(wanted);
  if (readInstalledLevels() === null) writeInstalledLevels([BUNDLED_LEVEL]);
  const levels = hskLevelsOf(wanted);
  if (levels.length > 0) characterStore.selectLevels(levels);
  const selection = [...wanted];
  const run = pendingMedia.catch(() => {}).then(async () => {
    const previous = readInstalledLevels() ?? [BUNDLED_LEVEL];
    const installed = await downloadLists(selection, onProgress);
    if (vocabularyStore.state.selectedLists.join('|') !== selection.join('|')) return;
    for (const level of previous) {
      if (!downloadable(level) || installed.includes(level)) continue;
      characterStore.removeLevel(level);
      await forgetPack(level);
    }
    writeInstalledLevels(installed);
  });
  pendingMedia = run;
  return run;
};
