import { describe, expect, it } from 'vitest';
import { KEYS } from '../src/persistence/keys';
import { createMemoryKeyValue, type KeyValueStore } from '../src/persistence/keyValue';
import { removeObsoleteKeys } from '../src/persistence/obsoleteKeys';

const LIVE = {
  [KEYS.characterDeck]: '{"selectedLevels":[1]}',
  [KEYS.studyLists]: '["hsk-1"]',
  [KEYS.deviceId]: 'device-a',
  [KEYS.theme]: 'dark',
  [KEYS.voiceMode]: 'auto',
  'jiayou-home-last-vocabulary': '{}',
};

describe('removeObsoleteKeys', () => {
  it('removes what the old progress and session system left and keeps every live key', () => {
    const store = createMemoryKeyValue({
      ...LIVE,
      'hsk-flashcards-stats': '{"version":4}',
      'jiayou-vocabulary-session-v1': '{}',
      'jiayou-vocabulary-session-v1:practice:__weak__': '{}',
      'jiayou-vocabulary-session-v1:practice:topic:comida': '{}',
      'jiayou-session-v1': '{}',
      'hsk-gesture-hint-views': '3',
      'hsk-hint-swipe': '1',
    });
    removeObsoleteKeys(store);
    expect(Object.fromEntries(store.keys('').map((key) => [key, store.read(key)]))).toEqual(LIVE);
    removeObsoleteKeys(store);
    expect(store.keys('')).toHaveLength(Object.keys(LIVE).length);
  });

  it('ignores a storage that throws', () => {
    const broken: KeyValueStore = {
      read: () => null,
      write: () => {},
      remove: () => { throw new Error('denied'); },
      keys: () => { throw new Error('denied'); },
    };
    expect(() => removeObsoleteKeys(broken)).not.toThrow();
  });
});
