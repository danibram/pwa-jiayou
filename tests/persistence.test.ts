import { describe, expect, it, vi } from 'vitest';
import { homeLastKey, KEYS, practiceSessionKey } from '../src/persistence/keys';
import { storage } from '../src/persistence/keyValue';

describe('storage keys', () => {
  it('keep the names already saved on devices', () => {
    expect(KEYS).toEqual({
      progress: 'hsk-flashcards-stats',
      myWords: 'jiayou-my-words',
      studyLists: 'jiayou-study-lists',
      characterDeck: 'hsk-flashcards-progress',
      installedLevels: 'hsk-installed-levels',
      wordSession: 'jiayou-vocabulary-session-v1',
      deviceId: 'jiayou-device-id',
      theme: 'jiayou-theme',
      voiceMode: 'hsk-voice-mode',
      legacyVoice: 'hsk-voice',
    });
    expect(practiceSessionKey('__weak__')).toBe('jiayou-vocabulary-session-v1:practice:__weak__');
    expect(homeLastKey('vocabulary')).toBe('jiayou-home-last-vocabulary');
  });
});

describe('key-value adapter', () => {
  it('reads and writes the same localStorage entries', () => {
    storage.write(KEYS.theme, 'dark');
    expect(localStorage.getItem('jiayou-theme')).toBe('dark');
    localStorage.setItem('hsk-voice-mode', 'taiwan');
    expect(storage.read(KEYS.voiceMode)).toBe('taiwan');
    storage.remove(KEYS.theme);
    expect(localStorage.getItem('jiayou-theme')).toBeNull();
    expect(storage.read('missing')).toBeNull();
  });

  it('lists keys by prefix', () => {
    localStorage.setItem('jiayou-vocabulary-session-v1', '{}');
    localStorage.setItem(practiceSessionKey('a'), '{}');
    localStorage.setItem('jiayou-theme', 'dark');
    expect(storage.keys('jiayou-vocabulary-session-v1').sort()).toEqual([
      'jiayou-vocabulary-session-v1',
      'jiayou-vocabulary-session-v1:practice:a',
    ]);
  });

  it('passes storage failures to the caller', () => {
    const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('full'); });
    const read = vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => storage.write(KEYS.theme, 'dark')).toThrow('full');
    expect(() => storage.read(KEYS.theme)).toThrow('blocked');
    write.mockRestore();
    read.mockRestore();
  });
});
