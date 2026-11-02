import '@testing-library/jest-dom';
import { beforeEach } from 'vitest';

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

beforeEach(() => localStorage.clear());

// jsdom's fetch has no base URL, so stroke data under /strokes/ is read from public/ instead.
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith('/')) return realFetch(input, init);
  const { readFile } = await import('node:fs/promises');
  try {
    const body = await readFile(`${process.cwd()}/public${decodeURIComponent(url.split('?')[0])}`);
    return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
  } catch {
    return new Response(null, { status: 404 });
  }
}) as typeof fetch;
