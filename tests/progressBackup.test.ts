import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const key = 'hsk-flashcards-stats';
const freshStore = async () => {
  vi.resetModules();
  return (await import('../src/stores/progressStore')).progressStore;
};

describe('progress backup', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('migrates legacy data and exports a versioned round trip', async () => {
    localStorage.setItem(key, JSON.stringify({ 好: { right: 2, wrong: 1 } }));
    const store = await freshStore();
    const backup = store.exportBackup();
    expect(JSON.parse(backup)).toMatchObject({ version: 2, chars: { 好: { right: 2, wrong: 1 } } });
    store.clear();
    store.importBackup(backup);
    expect(store.get('好')).toMatchObject({ right: 2, wrong: 1, ease: 2.5 });
  });

  it.each(['{', JSON.stringify({ version: 99, chars: {}, daily: {} }), JSON.stringify({ chars: { 好: { right: 'bad' } } })])(
    'preserves unreadable stored data and blocks automatic writes', async (raw) => {
      localStorage.setItem(key, raw);
      const store = await freshStore();
      store.grade('新', 'good');
      expect(localStorage.getItem(key)).toBe(raw);
      expect(store.storageError()).toBeTruthy();
      expect(store.retrySave()).toBe(false);
      expect(JSON.parse(store.exportBackup()).chars.新.right).toBe(1);
    },
  );

  it('keeps in-memory progress when storage is full and saves it on retry', async () => {
    const store = await freshStore();
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    store.grade('好', 'good');
    expect(store.storageError()).toBeTruthy();
    expect(JSON.parse(store.exportBackup()).chars.好.right).toBe(1);
    write.mockRestore();
    expect(store.retrySave()).toBe(true);
    expect(JSON.parse(localStorage.getItem(key)!).chars.好.right).toBe(1);
    expect(store.storageError()).toBeNull();
  });

  it('leaves current progress intact when import is invalid or storage is blocked', async () => {
    const store = await freshStore();
    store.grade('好', 'good');
    const before = localStorage.getItem(key);
    expect(() => store.importBackup('{')).toThrow();
    const backup = store.exportBackup();
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => store.importBackup(backup)).toThrow();
    write.mockRestore();
    expect(localStorage.getItem(key)).toBe(before);
    expect(store.get('好')?.right).toBe(1);
    store.importBackup(backup);
    expect(store.get('好')?.right).toBe(1);
  });
});
