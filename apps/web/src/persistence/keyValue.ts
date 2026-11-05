/**
 * The only module that touches localStorage. Every method throws when the browser does, so each
 * caller keeps its own policy: a store that must not overwrite unreadable data needs to know a
 * read failed, while a theme preference can ignore it.
 */
export interface KeyValueStore {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
  /** Keys that start with `prefix`, in storage order. */
  keys(prefix: string): string[];
}

// Reads `localStorage` on each call, so a test that swaps or spies on it sees every access.
export const storage: KeyValueStore = {
  read: (key) => localStorage.getItem(key),
  write: (key, value) => localStorage.setItem(key, value),
  remove: (key) => localStorage.removeItem(key),
  keys: (prefix) =>
    Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter((key): key is string => key !== null && key.startsWith(prefix)),
};

/** A store that lives only in memory, for tests and for code that must not touch the device. */
export const createMemoryKeyValue = (entries: Record<string, string> = {}): KeyValueStore => {
  const items = new Map(Object.entries(entries));
  return {
    read: (key) => items.get(key) ?? null,
    write: (key, value) => { items.set(key, value); },
    remove: (key) => { items.delete(key); },
    keys: (prefix) => [...items.keys()].filter((key) => key.startsWith(prefix)),
  };
};
