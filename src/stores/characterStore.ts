import { createStore } from 'solid-js/store';
import hsk1Data from '../data/hsk1.json';
import hsk2Data from '../data/hsk2.json';
import hsk3Data from '../data/hsk3.json';
import { ExampleWord, HSKCharacter, TrainingResult } from '../types';
import { shuffle } from '../utils/shuffle';

interface CharacterStore {
  characters: HSKCharacter[];
  selectedLevels: number[];
  currentIndex: number;
  trainingMode: boolean;
  trainingResults: {
    correct: number;
    incorrect: number;
  };
}

const STORAGE_KEY = 'hsk-flashcards-progress';

/** Older saves stored one level as `selectedLevel`. */
export const selectionFromSaved = (raw: unknown): number[] => {
  if (!raw || typeof raw !== 'object') return [];
  const parsed = raw as { selectedLevels?: unknown; selectedLevel?: unknown };
  const list = Array.isArray(parsed.selectedLevels)
    ? parsed.selectedLevels.filter((n): n is number => typeof n === 'number')
    : [];
  const legacy = typeof parsed.selectedLevel === 'number' ? [parsed.selectedLevel] : [];
  const levels = list.length > 0 ? list : legacy;
  return [...new Set(levels)].sort((a, b) => a - b);
};

const loadProgress = (): Pick<CharacterStore, 'selectedLevels' | 'currentIndex'> | Record<string, never> => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return {};
    const parsed = JSON.parse(saved) as { currentIndex?: unknown };
    const selectedLevels = selectionFromSaved(parsed);
    const currentIndex = typeof parsed.currentIndex === 'number' ? parsed.currentIndex : 0;
    return { selectedLevels, currentIndex };
  } catch {
    return {};
  }
};

/** "HSK 1", "HSK 1 y 2", "HSK 1, 2 y 3". */
export const formatHskLevels = (levels: number[]): string => {
  const sorted = [...new Set(levels)].sort((a, b) => a - b);
  if (sorted.length === 0) return 'HSK';
  if (sorted.length === 1) return `HSK ${sorted[0]}`;
  const last = sorted[sorted.length - 1];
  const head = sorted.slice(0, -1).join(', ');
  return `HSK ${head} y ${last}`;
};

// The level files disagree on field names (stroke_count vs strokes) and some
// leave traditional null, so normalise them into one shape.
type RawCharacter = Partial<HSKCharacter> & { strokes?: number; traditional?: string | null };

// Curated glosses and example words, keyed by character, one file per level.
const glossFiles = import.meta.glob<Record<string, { gloss: string; example: ExampleWord }>>(
  '../data/glosses/*.json',
  { eager: true, import: 'default' }
);
const glosses = Object.assign({}, ...Object.values(glossFiles));

const normalize = (raw: RawCharacter): HSKCharacter => ({
  character: raw.character!,
  traditional: raw.traditional || raw.character!,
  pinyin: raw.pinyin ?? '',
  definition: raw.definition ?? '',
  radical: raw.radical ?? '',
  stroke_count: raw.stroke_count ?? raw.strokes ?? 0,
  hsk_level: raw.hsk_level!,
  general_standard: Number(raw.general_standard ?? 0),
  frequency_rank: raw.frequency_rank ?? 0,
  gloss: glosses[raw.character!]?.gloss,
  example: glosses[raw.character!]?.example,
});

const allCharacters: HSKCharacter[] = (
  [...hsk1Data, ...hsk2Data, ...hsk3Data] as RawCharacter[]
).map(normalize);

// Initialize store
const initialState: CharacterStore = {
  characters: allCharacters,
  selectedLevels: [],
  currentIndex: 0,
  trainingMode: false,
  trainingResults: {
    correct: 0,
    incorrect: 0,
  },
  ...loadProgress(),
};

const [store, setStore] = createStore(initialState);

// Save progress to localStorage
const saveProgress = () => {
  try {
    const toSave = {
      selectedLevels: store.selectedLevels,
      currentIndex: store.currentIndex,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (error) {
    console.error('Error saving progress:', error);
  }
};

export const characterStore = {
  get state() {
    return store;
  },

  levelLabel(): string {
    return formatHskLevels(store.selectedLevels);
  },

  selectLevels(levels: number[]) {
    setStore({
      selectedLevels: [...new Set(levels)].sort((a, b) => a - b),
      currentIndex: 0,
      trainingMode: false,
      trainingResults: { correct: 0, incorrect: 0 },
    });
    saveProgress();
  },

  selectLevel(level: number) {
    this.selectLevels([level]);
  },

  /** Add or remove a level. The last one stays on, so the deck is never empty. */
  toggleLevel(level: number) {
    const current = store.selectedLevels;
    const has = current.includes(level);
    if (has && current.length === 1) return;
    this.selectLevels(has ? current.filter((l) => l !== level) : [...current, level]);
  },

  getCharactersByLevel(): HSKCharacter[] {
    if (store.selectedLevels.length === 0) return [];
    const selected = new Set(store.selectedLevels);
    return store.characters.filter((char) => selected.has(char.hsk_level));
  },

  // Get shuffled characters for training
  getShuffledCharacters(): HSKCharacter[] {
    return shuffle(this.getCharactersByLevel());
  },

  // Levels that actually ship character data
  getAvailableLevels(): number[] {
    return [...new Set(store.characters.map((char) => char.hsk_level))].sort();
  },

  // Same character all day, different each day
  getDailyCharacter(): HSKCharacter {
    const pool = store.selectedLevels.length > 0 ? this.getCharactersByLevel() : store.characters;
    const day = Math.floor(Date.now() / 86_400_000);
    return pool[day % pool.length];
  },

  // Count characters by level
  getCharacterCountByLevel(level: number): number {
    return store.characters.filter((char) => char.hsk_level === level).length;
  },

  // Navigation
  nextCharacter() {
    const chars = this.getCharactersByLevel();
    if (chars.length === 0) return;

    setStore('currentIndex', (store.currentIndex + 1) % chars.length);
    saveProgress();
  },

  previousCharacter() {
    const chars = this.getCharactersByLevel();
    if (chars.length === 0) return;

    const newIndex = store.currentIndex - 1;
    setStore('currentIndex', newIndex < 0 ? chars.length - 1 : newIndex);
    saveProgress();
  },

  setCurrentIndex(index: number) {
    setStore('currentIndex', index);
    saveProgress();
  },

  // Training mode
  startTraining() {
    setStore({
      trainingMode: true,
      currentIndex: 0,
      trainingResults: { correct: 0, incorrect: 0 },
    });
  },

  recordAnswer(isCorrect: boolean) {
    if (isCorrect) {
      setStore('trainingResults', 'correct', (c) => c + 1);
    } else {
      setStore('trainingResults', 'incorrect', (c) => c + 1);
    }
  },

  getTrainingResult(): TrainingResult {
    const { correct, incorrect } = store.trainingResults;
    const total = correct + incorrect;
    const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;

    return {
      correct,
      incorrect,
      total,
      percentage,
    };
  },

  resetTraining() {
    setStore({
      trainingMode: false,
      currentIndex: 0,
      trainingResults: { correct: 0, incorrect: 0 },
    });
  },

  // General reset
  reset() {
    setStore({
      selectedLevels: [],
      currentIndex: 0,
      trainingMode: false,
      trainingResults: { correct: 0, incorrect: 0 },
    });
    localStorage.removeItem(STORAGE_KEY);
  },
};
