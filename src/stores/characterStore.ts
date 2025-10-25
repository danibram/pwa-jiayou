import { createStore } from 'solid-js/store';
import { HSKCharacter, TrainingResult } from '../types';

interface CharacterStore {
    characters: HSKCharacter[];
    selectedLevel: number | null;
    currentIndex: number;
    trainingMode: boolean;
    trainingResults: {
        correct: number;
        incorrect: number;
    };
    loading: boolean;
}

const STORAGE_KEY = 'hsk-flashcards-progress';

// Load saved progress
const loadProgress = (): Partial<CharacterStore> => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? JSON.parse(saved) : {};
    } catch {
        return {};
    }
};

// Character count by level (cached for quick access without loading files)
const CHARACTER_COUNTS: Record<number, number> = {
    1: 174,
    2: 173,
    3: 270,
    4: 0, // Not yet available
    5: 0, // Not yet available
    6: 0, // Not yet available
};

// Dynamic import function for HSK level data
const loadLevelData = async (level: number): Promise<HSKCharacter[]> => {
    try {
        switch (level) {
            case 1:
                const hsk1 = await import('../data/hsk1.json');
                return hsk1.default as HSKCharacter[];
            case 2:
                const hsk2 = await import('../data/hsk2.json');
                return hsk2.default as HSKCharacter[];
            case 3:
                const hsk3 = await import('../data/hsk3.json');
                return hsk3.default as HSKCharacter[];
            // Add more levels as they become available
            default:
                console.warn(`HSK level ${level} not available yet`);
                return [];
        }
    } catch (error) {
        console.error(`Error loading HSK level ${level}:`, error);
        return [];
    }
};

// Initialize store with empty characters (will be loaded dynamically)
const initialState: CharacterStore = {
    characters: [],
    selectedLevel: null,
    currentIndex: 0,
    trainingMode: false,
    trainingResults: {
        correct: 0,
        incorrect: 0,
    },
    loading: false,
    ...loadProgress(),
};

const [store, setStore] = createStore(initialState);

// Save progress to localStorage
const saveProgress = () => {
    try {
        const toSave = {
            selectedLevel: store.selectedLevel,
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

    // Select HSK level (async - loads data dynamically)
    async selectLevel(level: number) {
        setStore({ loading: true });

        try {
            // Load characters for selected level
            const characters = await loadLevelData(level);

            setStore({
                characters,
                selectedLevel: level,
                currentIndex: 0,
                trainingMode: false,
                trainingResults: { correct: 0, incorrect: 0 },
                loading: false,
            });

            saveProgress();
        } catch (error) {
            console.error('Error selecting level:', error);
            setStore({ loading: false });
        }
    },

    // Get characters from selected level (already loaded)
    getCharactersByLevel(): HSKCharacter[] {
        return store.characters;
    },

    // Get shuffled characters for training
    getShuffledCharacters(): HSKCharacter[] {
        return [...store.characters].sort(() => Math.random() - 0.5);
    },

    // Count characters by level (uses cached counts - no need to load)
    getCharacterCountByLevel(level: number): number {
        return CHARACTER_COUNTS[level] || 0;
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
            setStore('trainingResults', 'correct', c => c + 1);
        } else {
            setStore('trainingResults', 'incorrect', c => c + 1);
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
            selectedLevel: null,
            currentIndex: 0,
            trainingMode: false,
            trainingResults: { correct: 0, incorrect: 0 },
        });
        localStorage.removeItem(STORAGE_KEY);
    },
};

