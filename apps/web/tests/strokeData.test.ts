import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadStrokeData } from '../src/utils/strokeData';
import { remoteStrokeUrl } from '../src/utils/levelPacks';

const strokeJson = '{"strokes":["M0 0"],"medians":[[[0,0],[1,1]]]}';

describe('stroke data outside HSK', () => {
  const stored = new Map<string, Response>();
  const fetched: string[] = [];

  beforeEach(() => {
    stored.clear();
    fetched.length = 0;
    vi.stubGlobal('caches', {
      open: async () => ({
        match: async (key: string) => stored.get(key)?.clone(),
        put: async (key: string, response: Response) => { stored.set(key, response.clone()); },
      }),
    });
    vi.stubGlobal('fetch', async (input: RequestInfo) => {
      const url = String(input);
      fetched.push(url);
      if (url.startsWith('https://cdn.jsdelivr.net/')) return new Response(strokeJson, { status: 200, headers: { 'Content-Type': 'application/json' } });
      return new Response('', { status: 404 });
    });
  });

  it('falls back to the CDN and keeps the copy for offline use', async () => {
    const data = await loadStrokeData('鑫');
    expect(data.strokes).toEqual(['M0 0']);
    expect(fetched.at(-1)).toBe(remoteStrokeUrl('鑫'));
    expect(stored.has(remoteStrokeUrl('鑫'))).toBe(true);
  });

  it('reads a kept copy without the network', async () => {
    stored.set(remoteStrokeUrl('淼'), new Response(strokeJson, { status: 200 }));
    vi.stubGlobal('fetch', async () => { throw new TypeError('offline'); });
    await expect(loadStrokeData('淼')).resolves.toMatchObject({ strokes: ['M0 0'] });
  });

  it('does not cache bundled files on read', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo) => {
      fetched.push(String(input));
      return new Response(strokeJson, { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    await loadStrokeData('一');
    expect(fetched).toHaveLength(1);
    expect(stored.size).toBe(0);
  });
});
