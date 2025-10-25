import { createStore } from 'solid-js/store';
import hsk1Data from '../data/hsk1.json';
import hsk2Data from '../data/hsk2.json';
import hsk3Data from '../data/hsk3.json';
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

// Combine all characters from different HSK levels
const allCharacters: HSKCharacter[] = [
    ...(hsk1Data as HSKCharacter[]),
    ...(hsk2Data as HSKCharacter[]),
    ...(hsk3Data as HSKCharacter[]),
];

// Initialize store
const initialState: CharacterStore = {
    characters: allCharacters,
    selectedLevel: null,
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

    // Select HSK level
    selectLevel(level: number) {
        setStore({
            selectedLevel: level,
            currentIndex: 0,
            trainingMode: false,
            trainingResults: { correct: 0, incorrect: 0 },
        });
        saveProgress();
    },

    // Get characters from selected level
    getCharactersByLevel(): HSKCharacter[] {
        if (!store.selectedLevel) return [];
        return store.characters.filter(char => char.hsk_level === store.selectedLevel);
    },

    // Get shuffled characters for training
    getShuffledCharacters(): HSKCharacter[] {
        const chars = this.getCharactersByLevel();
        return [...chars].sort(() => Math.random() - 0.5);
    },

    // Count characters by level
    getCharacterCountByLevel(level: number): number {
        return store.characters.filter(char => char.hsk_level === level).length;
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

