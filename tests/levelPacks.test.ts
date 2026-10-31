import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { characterStore } from '../src/stores/characterStore';
import { applyLevelChoice, readInstalledLevels } from '../src/utils/levelPacks';

const body = (level: number) => readFileSync(`public/packs/hsk${level}.json`, 'utf8');

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
        delete: async (key: string) => stored.delete(key),
      }),
    });
    vi.stubGlobal('fetch', async (input: RequestInfo) => {
      const url = String(input);
      const level = url.includes('hsk3') ? 3 : url.includes('hsk2') ? 2 : 0;
      if (!level || url.includes('fail')) return new Response('', { status: 404 });
      return new Response(body(level), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
  });

  it('downloads a list, remembers it, and removes it again', async () => {
    await applyLevelChoice([1, 2]);
    expect(characterStore.hasLevel(2)).toBe(true);
    expect(characterStore.hasLevel(3)).toBe(false);
    expect(readInstalledLevels()).toEqual([1, 2]);
    expect(characterStore.state.selectedLevels).toEqual([1, 2]);
    expect(stored.size).toBe(1);

    await applyLevelChoice([1]);
    expect(characterStore.hasLevel(2)).toBe(false);
    expect(readInstalledLevels()).toEqual([1]);
    expect(characterStore.state.selectedLevels).toEqual([1]);
    expect(stored.size).toBe(0);
  });

  it('leaves the previous lists in place when a download fails', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes('hsk3')) return new Response('', { status: 404 });
      return new Response(body(2), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    await expect(applyLevelChoice([1, 2, 3])).rejects.toThrow(/HSK 3/);
    expect(characterStore.hasLevel(2)).toBe(false);
    expect(characterStore.hasLevel(3)).toBe(false);
    expect(readInstalledLevels()).toBeNull();
  });
});
