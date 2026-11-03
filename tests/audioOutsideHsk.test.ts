import { readdirSync, readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import clips from '../src/data/syllable-clips.json';
import { characterLevel } from '../src/data/catalog';
import { characterStore } from '../src/stores/characterStore';
import { myWordsStore } from '../src/stores/myWordsStore';

class FakeAudio {
  static srcs: string[] = [];
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public src: string) {
    FakeAudio.srcs.push(src);
  }
  play = () => Promise.resolve();
  pause() {}
}

describe('clips for characters outside HSK', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
    FakeAudio.srcs = [];
    vi.stubGlobal('Audio', FakeAudio);
  });

  it('plays the bundled clip of the syllable, whatever the character\'s level', async () => {
    expect(characterLevel('喱')).toBeUndefined();
    const { setVoiceMode, speak } = await import('../src/utils/speech');
    speak('lí', '喱');
    expect(FakeAudio.srcs).toEqual(['/audio/c/li2.mp3']);
    // Taiwan alternates woman then man; a first tone's key has no digit: kā is `ka`.
    setVoiceMode('taiwan');
    speak('kā', '咖');
    expect(FakeAudio.srcs.at(-1)).toBe('/audio/f/ka.mp3');
  });

  it('falls back to the browser voice when no clip has the syllable', async () => {
    const spoken: string[] = [];
    vi.stubGlobal('SpeechSynthesisUtterance', class { lang = ''; rate = 1; constructor(public text: string) {} });
    vi.stubGlobal('speechSynthesis', { cancel() {}, getVoices: () => [], speak: (utterance: { text: string }) => spoken.push(utterance.text) });
    const { speakWord } = await import('../src/utils/speech');
    speakWord('kēi lí', '咖喱');
    expect(clips).not.toContain('kei');
    expect(spoken).toEqual(['咖喱']);
    expect(FakeAudio.srcs).toEqual([]);
  });

  it('has no clip in any pack that the app does not already ship, so a pack lookup adds nothing', () => {
    const bundled = new Set<string>(clips);
    for (const dir of readdirSync('public/packs', { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
      const keys: string[] = JSON.parse(readFileSync(`public/packs/${dir.name}/syllables.json`, 'utf8'));
      expect(keys.filter((key) => !bundled.has(key)), dir.name).toEqual([]);
    }
  });
});

describe('offline media for own words', () => {
  it('saves strokes and audio needed by an own word', async () => {
    const stored = new Map<string, Response>();
    vi.stubGlobal('caches', {
      open: async () => ({
        match: async (key: string) => stored.get(key),
        put: async (key: string, response: Response) => { stored.set(key, response.clone()); },
      }),
    });
    const fetched: string[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo) => {
      fetched.push(String(input));
      const url = String(input);
      if (/\/packs\/hsk\d\.json\?v=\w+$/.test(url)) return new Response(readFileSync(`public${url.split('?')[0]}`, 'utf8'), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.endsWith('syllables.json')) return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.endsWith('.mp3')) return new Response('audio', { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
      return new Response('{"strokes":[],"medians":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    myWordsStore.add({ simplified: '咖喱', pinyin: 'ka1 li2', meaning: 'curry' });
    const { prepareListMedia, remoteStrokeUrl } = await import('../src/utils/levelPacks');
    characterStore.reset();
    await prepareListMedia(['mine']);
    expect(fetched).toContain(remoteStrokeUrl('喱'));
    expect(fetched.some((url) => url.includes('/audio/'))).toBe(true);
    myWordsStore.reset();
  });
});
