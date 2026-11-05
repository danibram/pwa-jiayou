import { createRoot } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEditorStore } from '../lib/store';
import { validateSnapshot, type ContentSnapshot } from '../lib/model';

const word = (id: string, simplified: string, pinyin: string, extra: object = {}) => ({
  id, simplified, traditional: simplified, pinyin, senses: [{ text: 'algo' }], level: 1 as const, characters: [...simplified], topicIds: [], sourceId: 'hsk-2-0', ...extra,
});
const base: ContentSnapshot = {
  schemaVersion: 1,
  vocabulary: [
    word('word-597d-hao3', '好', 'hǎo', { relations: [{ kind: 'synonym', id: 'word-4f73-jia' }] }),
    word('word-4f73-jia', '佳', 'jiā', { relations: [{ kind: 'synonym', id: 'word-597d-hao3' }] }),
  ],
  characters: ['好', '佳', '一', '二', '三'].map((character, index) => ({ character, traditional: character, pinyin: 'hǎo', definition: 'bueno', radical: '女', stroke_count: 6, hsk_level: 1 as const, general_standard: index + 1, frequency_rank: index + 1 })),
  topics: [],
};

const loadStore = async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('revision.json')) return { ok: true, json: async () => ({ revision: 'rev-1' }) };
    if (url.endsWith('version.json')) return { ok: true, json: async () => ({ version: 1, date: '2026-11-05', notes: 'Primera.' }) };
    if (url.includes('__content/status')) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => structuredClone(base) };
  }));
  let dispose = () => {};
  const store = createRoot((done) => { dispose = done; return createEditorStore(); });
  await store.load();
  return { store, dispose };
};

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe('word retirement in the editor', () => {
  it('keeps the row and id, drops links to it and lists the change', async () => {
    const { store, dispose } = await loadStore();
    store.setWordRetired('word-4f73-jia', true);
    const snapshot = store.snapshot();
    expect(snapshot.vocabulary.map((row) => row.id)).toEqual(['word-597d-hao3', 'word-4f73-jia']);
    expect(snapshot.vocabulary[1].retired).toBe(true);
    expect(snapshot.vocabulary[0].relations).toBeUndefined();
    expect(() => validateSnapshot(JSON.parse(JSON.stringify(snapshot)), base)).not.toThrow();
    const change = store.changes().find((row) => row.id === 'word-4f73-jia');
    expect(change?.fields).toContainEqual({ name: 'Retirada', before: 'no', after: 'sí' });
    store.setWordRetired('word-4f73-jia', false);
    expect(store.snapshot().vocabulary[1].retired).toBeUndefined();
    dispose();
  });

  it('gives a new word with a retired word\'s reading the next suffix, never the retired id', async () => {
    const { store, dispose } = await loadStore();
    store.setWordRetired('word-4f73-jia', true);
    const id = store.addWord(1);
    store.updateWord('simplified', '佳');
    store.updateWord('pinyin', 'jiā');
    expect(store.snapshot().vocabulary.find((row) => row.id !== 'word-4f73-jia' && row.simplified === '佳')?.id).toBe('word-4f73-jia-2');
    expect(id).not.toBe('word-4f73-jia');
    dispose();
  });

  it('does not retire a word that was never published', async () => {
    const { store, dispose } = await loadStore();
    const id = store.addWord(1);
    store.setWordRetired(id, true);
    expect(store.snapshot().vocabulary.find((row) => row.id === id)?.retired).toBeUndefined();
    dispose();
  });
});
