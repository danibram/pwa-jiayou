import { createStore } from 'solid-js/store';
import { allWords, catalogWords, levelWords, type VocabularyEntry } from '../data/vocabulary';
import { DEFAULT_LIST, hskLevelsOf, knownLists, listLabel, type ListId } from '../data/lists';
import type { HskLevel } from '../types';
import { studyList, studyLists, wordsInLists } from './studyLists';
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

/** The selected words and their ids, rebuilt when the selection or the words on the device change. */
let selection: { key: string; every: VocabularyEntry[]; words: VocabularyEntry[]; byId: Map<string, VocabularyEntry> } | null = null;
const selectedWords = () => {
  const every = allWords();
  const key = store.selectedLists.join('|');
  if (!selection || selection.key !== key || selection.every !== every) {
    const words = wordsInLists(store.selectedLists);
    selection = { key, every, words, byId: new Map(words.map((word) => [word.id, word])) };
  }
  return selection;
};

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

  /**
   * The words of the checked lists, each once. Everything the learner sees draws from these:
   * Hoy, Buscar, Temas, the word page and the character drawer.
   */
  getSelectedWords(): VocabularyEntry[] {
    return selectedWords().words;
  },

  /** The HSK levels among the checked lists. Characters shown beside words come from these. */
  studiedLevels(): HskLevel[] {
    return hskLevelsOf(store.selectedLists);
  },

  /** A word of the checked lists by id. A word of a list that is off is not found. */
  findSelectedWord(id: string): VocabularyEntry | undefined {
    return selectedWords().byId.get(id);
  },

  /**
   * From the lists being studied, seeded by the date: a word being learned, so the tile is a nudge
   * to recall it, or one of the next new words when nothing is in progress yet. `status` comes from
   * the learning store; without it every word counts as new.
   */
  getDailyWord(status: (wordId: string) => 'new' | 'learning' | 'mastered' = () => 'new'): VocabularyEntry {
    const words = this.getSelectedWords();
    const learning = words.filter((word) => status(word.id) === 'learning');
    const fresh = words.filter((word) => status(word.id) === 'new').slice(0, 20);
    const list = learning.length > 0 ? learning : fresh.length > 0 ? fresh : words.length > 0 ? words : levelWords(1).length > 0 ? levelWords(1) : catalogWords();
    return list[dayNumber() % list.length];
  },

  reset() {
    setStore('selectedLists', [DEFAULT_LIST]);
    storage.remove(KEYS.studyLists);
  },
};
