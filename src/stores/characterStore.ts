import { createStore } from 'solid-js/store';
import hsk1Data from '../data/hsk1.json';
import hsk2Data from '../data/hsk2.json';
import hsk3Data from '../data/hsk3.json';
import { ExampleWord, HSKCharacter, HskLevel, TrainingResult } from '../types';
import { isHskLevel, isNonEmpty, isRecord, isString } from '../utils/parse';
import { shuffle } from '../utils/shuffle';

interface CharacterStore {
  characters: HSKCharacter[];
  selectedLevels: HskLevel[];
  currentIndex: number;
  trainingMode: boolean;
  trainingResults: {
    correct: number;
    incorrect: number;
  };
}

const STORAGE_KEY = 'hsk-flashcards-progress';

/** Older saves stored one level as `selectedLevel`. */
export const selectionFromSaved = (raw: unknown): HskLevel[] => {
  if (!isRecord(raw)) return [];
  const list = Array.isArray(raw.selectedLevels) ? raw.selectedLevels.filter(isHskLevel) : [];
  const legacy = isHskLevel(raw.selectedLevel) ? [raw.selectedLevel] : [];
  const levels = list.length > 0 ? list : legacy;
  const available = new Set<HskLevel>(allCharacters.map((character) => character.hsk_level));
  return [...new Set(levels.filter((level) => available.has(level)))].sort((a, b) => a - b);
};

const keptIndex = (index: unknown, count: number) =>
  typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < count ? index : 0;

const loadProgress = (): Pick<CharacterStore, 'selectedLevels' | 'currentIndex'> => {
  const empty = { selectedLevels: [], currentIndex: 0 };
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return empty;
    const parsed: unknown = JSON.parse(saved);
    if (!isRecord(parsed)) return empty;
    const selectedLevels = selectionFromSaved(parsed);
    const index = parsed.currentIndex;
    const count = allCharacters.filter((character) => selectedLevels.includes(character.hsk_level)).length;
    const currentIndex = keptIndex(index, count);
    return { selectedLevels, currentIndex };
  } catch {
    return empty;
  }
};

/** "HSK 1", "HSK 1 y 2", "HSK 1, 2 y 3". */
export const formatHskLevels = (levels: readonly HskLevel[]): string => {
  const sorted = [...new Set(levels)].sort((a, b) => a - b);
  if (sorted.length === 0) return 'HSK';
  if (sorted.length === 1) return `HSK ${sorted[0]}`;
  const last = sorted[sorted.length - 1];
  const head = sorted.slice(0, -1).join(', ');
  return `HSK ${head} y ${last}`;
};

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

const parseExample = (value: unknown): ExampleWord | undefined => {
  if (!isRecord(value) || !isString(value.word) || !isString(value.pinyin) || !isString(value.es)) return undefined;
  return { word: value.word, pinyin: value.pinyin, es: value.es };
};

const parseGlossFile = (value: unknown): Record<string, { gloss: string; example: ExampleWord }> => {
  if (!isRecord(value)) return {};
  const glosses: Record<string, { gloss: string; example: ExampleWord }> = {};
  for (const [char, entry] of Object.entries(value)) {
    if (!isRecord(entry) || !isString(entry.gloss)) continue;
    const example = parseExample(entry.example);
    if (!example) continue;
    glosses[char] = { gloss: entry.gloss, example };
  }
  return glosses;
};

const glossFiles = import.meta.glob<unknown>('../data/glosses/*.json', { eager: true, import: 'default' });
const glosses: Record<string, { gloss: string; example: ExampleWord }> = {};
for (const file of Object.values(glossFiles)) Object.assign(glosses, parseGlossFile(file));

const parseCharacter = (raw: unknown): HSKCharacter => {
  if (!isRecord(raw) || !isString(raw.character) || raw.character.length === 0 || !isHskLevel(raw.hsk_level)) {
    throw new Error('Hay un carácter del catálogo que no se puede leer.');
  }
  const gloss = glosses[raw.character];
  const strokes = raw.stroke_count ?? raw.strokes;
  return {
    character: raw.character,
    traditional: isString(raw.traditional) && raw.traditional ? raw.traditional : raw.character,
    pinyin: text(raw.pinyin),
    definition: text(raw.definition),
    radical: text(raw.radical),
    stroke_count: count(strokes),
    hsk_level: raw.hsk_level,
    general_standard: count(raw.general_standard),
    frequency_rank: count(raw.frequency_rank),
    gloss: gloss?.gloss,
    example: gloss?.example,
  };
};

const parsedCharacters = [...hsk1Data, ...hsk2Data, ...hsk3Data].map(parseCharacter);
if (!isNonEmpty(parsedCharacters)) throw new Error('El catálogo de caracteres está vacío.');
const allCharacters = parsedCharacters;

// Initialize store
const initialState: CharacterStore = {
  characters: allCharacters,
  ...loadProgress(),
  trainingMode: false,
  trainingResults: {
    correct: 0,
    incorrect: 0,
  },
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
  } catch {
    // Storage can be full or blocked. The in-memory deck still works.
  }
};

export const characterStore = {
  get state() {
    return store;
  },

  levelLabel(): string {
    return formatHskLevels(store.selectedLevels);
  },

  selectLevels(levels: HskLevel[]) {
    setStore({
      selectedLevels: [...new Set(levels)].sort((a, b) => a - b),
      currentIndex: 0,
      trainingMode: false,
      trainingResults: { correct: 0, incorrect: 0 },
    });
    saveProgress();
  },

  selectLevel(level: HskLevel) {
    this.selectLevels([level]);
  },

  /** Restores a session's levels and keeps the card place when it still falls in the deck. */
  restoreSelectedLevels(levels: HskLevel[]) {
    const selectedLevels = [...new Set(levels)].sort((a, b) => a - b);
    const count = store.characters.filter((character) => selectedLevels.includes(character.hsk_level)).length;
    setStore({
      selectedLevels,
      currentIndex: keptIndex(store.currentIndex, count),
    });
    saveProgress();
  },

  /** Add or remove a level. The last one stays on, so the deck is never empty. */
  toggleLevel(level: HskLevel) {
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
  getAvailableLevels(): HskLevel[] {
    return [...new Set(store.characters.map((char) => char.hsk_level))].sort();
  },

  // Same character all day, different each day
  getDailyCharacter(): HSKCharacter {
    const selected = store.selectedLevels.length > 0 ? this.getCharactersByLevel() : store.characters;
    const pool = selected.length > 0 ? selected : allCharacters;
    return pool[Math.floor(Date.now() / 86_400_000) % pool.length];
  },

  // Count characters by level
  getCharacterCountByLevel(level: HskLevel): number {
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
