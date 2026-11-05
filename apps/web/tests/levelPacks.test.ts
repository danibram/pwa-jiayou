import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { characterStore } from '../src/stores/characterStore';
import { vocabularyStore } from '../src/stores/vocabularyStore';
import { wordsInLists } from '../src/stores/studyLists';
import { applyListChoice, downloadState, loadInstalledPacks, loadSelectedWords, packsForWords, readInstalledLevels, saveStudyMedia } from '../src/utils/levelPacks';
import { allWords, hasLevelWords, levelWords, removeLevelWords, wordCount } from '../src/data/vocabulary';

/** What the server sends for a level's pack list, or for its word list (packs/hskN/words.json). */
const body = (level: number, url = '') =>
  readFileSync(url.includes('/words.json') ? `src/data/vocabulary/hsk${level}.json` : `public/packs/hsk${level}.json`, 'utf8');
const strokeJson = '{"strokes":["M0 0"],"medians":[[[0,0],[1,1]]]}';

describe('level packs', () => {
  /** Cache Storage by cache name. `stored` is every file in any of them. */
  const caches = new Map<string, Map<string, Response>>();
  const stored = { keys: () => [...caches.values()].flatMap((cache) => [...cache.keys()]) };
  const keyOf = (key: string | Request) => (typeof key === 'string' ? key : new URL(key.url).pathname + new URL(key.url).search);

  beforeEach(() => {
    localStorage.clear();
    characterStore.removeLevel(2);
    characterStore.removeLevel(3);
    characterStore.reset();
    vocabularyStore.reset();
    for (const level of [2, 3, 4, 5, 6] as const) removeLevelWords(level);
    caches.clear();
    vi.stubGlobal('caches', {
      open: async (name: string) => {
        if (!caches.has(name)) caches.set(name, new Map());
        const cache = caches.get(name)!;
        return {
          // A fresh copy each time, as Cache Storage gives.
          match: async (key: string | Request, options?: { ignoreSearch?: boolean }) =>
            (cache.get(keyOf(key)) ?? (options?.ignoreSearch ? [...cache].find(([stored]) => stored.split('?')[0] === keyOf(key).split('?')[0])?.[1] : undefined))?.clone(),
          put: async (key: string, response: Response) => {
            cache.set(keyOf(key), response.clone());
          },
          delete: async (key: string | Request) => cache.delete(keyOf(key)),
          keys: async () => [...cache.keys()].map((key) => new Request(new URL(key, location.href).href)),
        };
      },
      keys: async () => [...caches.keys()],
      delete: async (name: string) => caches.delete(name),
    });
    vi.stubGlobal('fetch', async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes('syllables.json')) return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.includes('/strokes/')) return new Response(strokeJson, { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.endsWith('.mp3')) return new Response('audio', { status: 200, headers: { 'content-type': 'audio/mpeg' } });
      const level = url.includes('hsk3') ? 3 : url.includes('hsk2') ? 2 : 0;
      if (!level || url.includes('fail')) return new Response('', { status: 404 });
      return new Response(body(level, url), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
  });

  it('downloads the packs a level\'s words use, and only the strokes those words need', async () => {
    const progress: number[] = [];
    await applyListChoice(['hsk-1', 'hsk-2'], (done, total) => progress.push(total - done));
    // HSK 2 words borrow nine HSK 3 characters, so that list comes too.
    expect(packsForWords(wordsInLists(['hsk-1', 'hsk-2']))).toEqual([2, 3]);
    expect(characterStore.hasLevel(2)).toBe(true);
    expect(characterStore.hasLevel(3)).toBe(true);
    expect(readInstalledLevels()).toEqual([1, 2, 3]);
    expect(characterStore.state.selectedLevels).toEqual([1, 2]);
    expect(vocabularyStore.state.selectedLists).toEqual(['hsk-1', 'hsk-2']);
    expect(progress.at(-1)).toBe(0);
    const strokes = (level: number) => [...stored.keys()].filter((key) => key.includes(`/hsk${level}/strokes/`)).length;
    expect(strokes(3)).toBeGreaterThan(0);
    expect(strokes(3)).toBeLessThan(20);
    expect([...stored.keys()].some((key) => key.endsWith('/hsk2/syllables.json'))).toBe(true);

    await applyListChoice(['hsk-1']);
    // HSK 1 words still use five HSK 2 characters.
    expect(characterStore.hasLevel(2)).toBe(true);
    expect(characterStore.hasLevel(3)).toBe(false);
    expect(readInstalledLevels()).toEqual([1, 2]);
    expect(characterStore.state.selectedLevels).toEqual([1]);
    expect([...stored.keys()].some((key) => key.includes('hsk3'))).toBe(false);
  });

  it('keeps the selection when a download fails', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes('syllables.json')) return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.includes('hsk3')) return new Response('', { status: 404 });
      if (url.includes('/strokes/')) return new Response(strokeJson, { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response(body(2, url), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const download = applyListChoice(['hsk-1', 'hsk-2', 'hsk-3']);
    expect(vocabularyStore.state.selectedLists).toEqual(['hsk-1', 'hsk-2', 'hsk-3']);
    expect(characterStore.state.selectedLevels).toEqual([1, 2, 3]);
    await expect(download).rejects.toThrow(/HSK 3/);
    expect(characterStore.hasLevel(2)).toBe(true);
    expect(characterStore.hasLevel(3)).toBe(false);
    expect(readInstalledLevels()).toEqual([1]);
  });

  it('reports incomplete media and allows a retry', async () => {
    const originalFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: RequestInfo) => {
      if (String(input).endsWith('.mp3')) return new Response('', { status: 503 });
      return originalFetch(input);
    });
    await expect(applyListChoice(['hsk-1'])).rejects.toThrow();
    expect(downloadState().state).toBe('error');
    vi.stubGlobal('fetch', originalFetch);
    await saveStudyMedia();
    expect(downloadState().state).toBe('ready');
    expect([...stored.keys()].some((key) => key.startsWith('/audio/'))).toBe(true);
  });

  it('updates one pack without touching the others, and studies offline with the old copy until it downloads', async () => {
    await applyListChoice(['hsk-1', 'hsk-2']);
    const names = [...caches.keys()];
    const hsk2 = names.find((name) => name.startsWith('jiayou-pack-hsk2-'))!;
    const hsk3 = names.find((name) => name.startsWith('jiayou-pack-hsk3-'))!;
    const hsk3Files = [...caches.get(hsk3)!.keys()];
    // The build changed HSK 2 only: what the device holds is now an older version of that pack.
    caches.set('jiayou-pack-hsk2-000000000000', caches.get(hsk2)!);
    caches.delete(hsk2);
    characterStore.removeLevel(2);
    const online = globalThis.fetch;
    vi.stubGlobal('fetch', async () => { throw new TypeError('offline'); });

    await loadInstalledPacks([2, 3]);
    expect(characterStore.hasLevel(2)).toBe(true);
    await saveStudyMedia();
    expect(downloadState().state).toBe('ready');
    // Every file HSK 2 words need came over from the old version, marked stale; HSK 3 was not touched.
    const copied = [...caches.get(hsk2)!.values()];
    expect(copied.length).toBeGreaterThan(0);
    expect(copied.every((response) => response.headers.get('x-jiayou-stale') === '1')).toBe(true);
    expect([...caches.get(hsk3)!.keys()]).toEqual(hsk3Files);
    expect(caches.has('jiayou-pack-hsk2-000000000000')).toBe(false);

    // Back online, the stale copies are fetched again.
    vi.stubGlobal('fetch', online);
    await saveStudyMedia();
    expect([...caches.get(hsk2)!.values()].some((response) => response.headers.get('x-jiayou-stale'))).toBe(false);
  });

  it('ships HSK 1 words only; the others are counted but not on the device', () => {
    expect(levelWords(1).length).toBe(wordCount(1));
    for (const level of [2, 3, 4, 5, 6] as const) {
      expect(hasLevelWords(level)).toBe(false);
      expect(levelWords(level)).toEqual([]);
      expect(wordCount(level)).toBeGreaterThan(100);
    }
    expect(allWords().every((word) => !word.level || word.level === 1)).toBe(true);
  });

  it('downloads the words of an activated list into its pack, and drops them when the list goes', async () => {
    const asked: string[] = [];
    const serve = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: RequestInfo) => {
      asked.push(String(input));
      return serve(input);
    });
    await applyListChoice(['hsk-1', 'hsk-2']);
    const wordFiles = asked.filter((url) => url.includes('/words.json'));
    // HSK 2 words borrow HSK 3 characters, but only HSK 2 words come down.
    expect(wordFiles).toHaveLength(1);
    expect(wordFiles[0]).toMatch(/\/packs\/hsk2\/words\.json\?v=\w+/);
    expect(levelWords(2).length).toBe(wordCount(2));
    expect(hasLevelWords(3)).toBe(false);
    const hsk2 = [...caches.keys()].find((name) => name.startsWith('jiayou-pack-hsk2-'))!;
    expect([...caches.get(hsk2)!.keys()].some((key) => key.includes('/hsk2/words.json'))).toBe(true);
    expect(vocabularyStore.getSelectedWords().some((word) => word.level === 2)).toBe(true);

    await applyListChoice(['hsk-1']);
    expect(hasLevelWords(2)).toBe(false);
    expect(vocabularyStore.getSelectedWords().every((word) => word.level === 1)).toBe(true);
  });

  it('reads the studied words from the cache at start-up, without the network', async () => {
    await applyListChoice(['hsk-1', 'hsk-2']);
    // A fresh start: the words are only in the pack cache.
    removeLevelWords(2);
    vi.stubGlobal('fetch', async () => { throw new TypeError('offline'); });
    await loadSelectedWords();
    expect(levelWords(2).length).toBe(wordCount(2));
  });

  it('removes the cached words of a list that is turned off', async () => {
    await applyListChoice(['hsk-1', 'hsk-2']);
    expect(stored.keys().some((key) => key.includes('/hsk2/words.json'))).toBe(true);
    // HSK 1 words still borrow HSK 2 characters, so the pack stays, but its words leave memory.
    await applyListChoice(['hsk-1']);
    expect(hasLevelWords(2)).toBe(false);
    await applyListChoice(['hsk-1', 'hsk-3']).catch(() => {});
    await applyListChoice(['hsk-1']);
    expect(stored.keys().some((key) => key.includes('/hsk3/'))).toBe(false);
    expect(hasLevelWords(3)).toBe(false);
  });
});
