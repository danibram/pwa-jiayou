import { createStore } from 'solid-js/store';
import { vocabulary, vocabularyByLevel, type VocabularyEntry } from '../data/vocabulary';
import { DEFAULT_LIST, knownLists, listLabel, studyList, studyLists, wordsInLists, type ListId } from '../data/lists';
import { dayNumber } from './characterStore';
import { isRecord } from '../utils/parse';
import { KEYS } from '../persistence/keys';
import { storage } from '../persistence/keyValue';

interface VocabularyStoreState {
  selectedLists: ListId[];
}

const loadSelection = (): ListId[] => {
  try {
    const saved: unknown = JSON.parse(storage.read(KEYS.studyLists) ?? 'null');
    const ids = isRecord(saved) && Array.isArray(saved.selectedLists) ? knownLists(saved.selectedLists.filter((id): id is string => typeof id === 'string')) : [];
    return ids.length > 0 ? ids : [DEFAULT_LIST];
  } catch {
    return [DEFAULT_LIST];
  }
};

const [store, setStore] = createStore<VocabularyStoreState>({
  selectedLists: loadSelection(),
});

const save = () => {
  try {
    storage.write(KEYS.studyLists, JSON.stringify({ selectedLists: store.selectedLists }));
  } catch {
    // Selection still works in memory if storage is blocked.
  }
};

export const vocabularyStore = {
  get state() {
    return store;
  },

  listLabel(): string {
    return listLabel(store.selectedLists);
  },

  isSelected(id: ListId): boolean {
    return store.selectedLists.includes(id);
  },

  selectLists(ids: readonly ListId[]) {
    const next = knownLists(ids);
    setStore('selectedLists', next.length > 0 ? next : [DEFAULT_LIST]);
    save();
  },

  /** Add or remove a list. The last one stays on. */
  toggleList(id: ListId) {
    if (!studyList(id)) return;
    const current = store.selectedLists;
    const has = current.includes(id);
    if (has && current.length === 1) return;
    this.selectLists(has ? current.filter((item) => item !== id) : [...current, id]);
  },

  getLists() {
    return studyLists();
  },

  /** The words of the checked lists, each once. */
  getSelectedWords(): VocabularyEntry[] {
    return wordsInLists(store.selectedLists);
  },

  /** Seeded by the date only, from HSK 1, so ticking lists never swaps it mid-day. */
  getDailyWord(): VocabularyEntry {
    const list = vocabularyByLevel[1].length > 0 ? vocabularyByLevel[1] : vocabulary;
    return list[dayNumber() % list.length];
  },

  reset() {
    setStore('selectedLists', [DEFAULT_LIST]);
    storage.remove(KEYS.studyLists);
  },
};
