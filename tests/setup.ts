import '@testing-library/jest-dom';
import { readFileSync } from 'node:fs';
import { beforeEach } from 'vitest';

// Vite writes the content manifest into the build; tests read the committed copy, which
// tests/contentManifest.test.ts keeps equal to the files.
Object.defineProperty(globalThis, '__CONTENT__', {
  configurable: true,
  value: JSON.parse(readFileSync(`${process.cwd()}/public/packs/content.json`, 'utf8')),
});

// Vite also counts each level's words at build time, so pickers know a list's size before it downloads.
Object.defineProperty(globalThis, '__WORD_COUNTS__', {
  configurable: true,
  value: Object.fromEntries([1, 2, 3, 4, 5, 6].map((level) => [
    level,
    JSON.parse(readFileSync(`${process.cwd()}/src/data/vocabulary/hsk${level}.json`, 'utf8')).length,
  ])),
});

class MemoryStorage implements Storage {
  private items = new Map<string, string>();

  get length() { return this.items.size; }
  clear() { this.items.clear(); }
  getItem(key: string) { return this.items.get(String(key)) ?? null; }
  key(index: number) { return [...this.items.keys()][index] ?? null; }
  removeItem(key: string) { this.items.delete(String(key)); }
  setItem(key: string, value: string) { this.items.set(String(key), String(value)); }
}

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: new MemoryStorage(),
});

// jsdom has no matchMedia. The stroke canvas listens for theme changes through it.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// Nor ResizeObserver, which the stroke canvas uses to fit its frame.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// Nor media playback. A new word plays its sound as it is shown, so every session reaches audio.
if (typeof HTMLMediaElement !== 'undefined') {
  HTMLMediaElement.prototype.play = function play() { return Promise.resolve(); };
  HTMLMediaElement.prototype.pause = function pause() {};
}

// The app reads its first screen from the URL, so every test starts at Home.
beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, '', '/');
});

// jsdom's fetch has no base URL, so stroke data under /strokes/ is read from public/ instead.
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith('/')) return realFetch(input, init);
  const { readFile } = await import('node:fs/promises');
  try {
    const path = decodeURIComponent(url.split('?')[0]);
    // A level's words are served from the editor's source list, as vite.config.ts does.
    const words = /^\/packs\/hsk(\d)\/words\.json$/.exec(path);
    const body = await readFile(words ? `${process.cwd()}/src/data/vocabulary/hsk${words[1]}.json` : `${process.cwd()}/public${path}`);
    return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
  } catch {
    return new Response(null, { status: 404 });
  }
}) as typeof fetch;
