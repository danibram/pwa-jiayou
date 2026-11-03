import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { characterStore } from '../src/stores/characterStore';
import { vocabularyStore } from '../src/stores/vocabularyStore';
import { wordsInLists } from '../src/data/lists';
import { applyListChoice, downloadState, packsForWords, readInstalledLevels, saveStudyMedia } from '../src/utils/levelPacks';

const body = (level: number) => readFileSync(`public/packs/hsk${level}.json`, 'utf8');
const strokeJson = '{"strokes":["M0 0"],"medians":[[[0,0],[1,1]]]}';

describe('level packs', () => {
  const stored = new Map<string, Response>();

  beforeEach(() => {
    localStorage.clear();
    characterStore.removeLevel(2);
    characterStore.removeLevel(3);
    characterStore.reset();
    stored.clear();
    vi.stubGlobal('caches', {
      open: async () => ({
        match: async (key: string) => stored.get(key),
        put: async (key: string, response: Response) => {
          stored.set(key, response.clone());
        },
        delete: async (key: string | Request) => stored.delete(typeof key === 'string' ? key : new URL(key.url).pathname),
        keys: async () => [...stored.keys()].map((key) => new Request(new URL(key, location.href).href)),
      }),
    });
    vi.stubGlobal('fetch', async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes('syllables.json')) return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.includes('/strokes/')) return new Response(strokeJson, { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.endsWith('.mp3')) return new Response('audio', { status: 200, headers: { 'content-type': 'audio/mpeg' } });
      const level = url.includes('hsk3') ? 3 : url.includes('hsk2') ? 2 : 0;
      if (!level || url.includes('fail')) return new Response('', { status: 404 });
      return new Response(body(level), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
      return new Response(body(2), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
});
