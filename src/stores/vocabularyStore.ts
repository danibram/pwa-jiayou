import { createStore } from 'solid-js/store';
import { vocabulary, vocabularyByLevel, type VocabularyEntry } from '../data/vocabulary';
import { DEFAULT_LIST, knownLists, listLabel, type ListId } from '../data/lists';
import { studyList, studyLists, wordsInLists } from './studyLists';
import { dayNumber } from './characterStore';
import { vocabularyProgressStore } from './vocabularyProgressStore';
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

  /**
   * From the lists being studied, seeded by the date: a word being learned, so the tile is a nudge
   * to recall it, or one of the next new words when nothing is in progress yet.
   */
  getDailyWord(): VocabularyEntry {
    const words = this.getSelectedWords();
    const learning = words.filter((word) => !vocabularyProgressStore.isNew(word.id) && !vocabularyProgressStore.isMastered(word.id));
    const fresh = words.filter((word) => vocabularyProgressStore.isNew(word.id)).slice(0, 20);
    const list = learning.length > 0 ? learning : fresh.length > 0 ? fresh : words.length > 0 ? words : vocabularyByLevel[1].length > 0 ? vocabularyByLevel[1] : vocabulary;
    return list[dayNumber() % list.length];
  },

  reset() {
    setStore('selectedLists', [DEFAULT_LIST]);
    storage.remove(KEYS.studyLists);
  },
};
