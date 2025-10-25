import { beforeEach, describe, expect, it } from 'vitest';
import { characterStore } from '../src/stores/characterStore';

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {};

    return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
            store[key] = value.toString();
        },
        removeItem: (key: string) => {
            delete store[key];
        },
        clear: () => {
            store = {};
        },
    };
})();

Object.defineProperty(global, 'localStorage', {
    value: localStorageMock,
});

describe('Character Store', () => {
    beforeEach(() => {
        localStorage.clear();
        characterStore.reset();
    });

    describe('Level Selection', () => {
        it('selects a level correctly', () => {
            characterStore.selectLevel(1);
            expect(characterStore.state.selectedLevel).toBe(1);
            expect(characterStore.state.currentIndex).toBe(0);
        });

        it('gets characters by selected level', () => {
            characterStore.selectLevel(1);
            const chars = characterStore.getCharactersByLevel();
            expect(chars.length).toBeGreaterThan(0);
            expect(chars.every(char => char.level === 1)).toBe(true);
        });

        it('returns empty array when no level selected', () => {
            const chars = characterStore.getCharactersByLevel();
            expect(chars).toEqual([]);
        });

        it('counts characters by level', () => {
            const count = characterStore.getCharacterCountByLevel(1);
            expect(count).toBeGreaterThan(0);
        });
    });

    describe('Navigation', () => {
        beforeEach(() => {
            characterStore.selectLevel(1);
        });

        it('navigates to next character', () => {
            const initialIndex = characterStore.state.currentIndex;
            characterStore.nextCharacter();
            expect(characterStore.state.currentIndex).toBe(initialIndex + 1);
        });

        it('wraps to first character when reaching end', () => {
            const chars = characterStore.getCharactersByLevel();
            characterStore.setCurrentIndex(chars.length - 1);
            characterStore.nextCharacter();
            expect(characterStore.state.currentIndex).toBe(0);
        });

        it('navigates to previous character', () => {
            characterStore.setCurrentIndex(5);
            characterStore.previousCharacter();
            expect(characterStore.state.currentIndex).toBe(4);
        });

        it('wraps to last character when at beginning', () => {
            const chars = characterStore.getCharactersByLevel();
            characterStore.setCurrentIndex(0);
            characterStore.previousCharacter();
            expect(characterStore.state.currentIndex).toBe(chars.length - 1);
        });
    });

    describe('Training Mode', () => {
        beforeEach(() => {
            characterStore.selectLevel(1);
        });

        it('starts training mode', () => {
            characterStore.startTraining();
            expect(characterStore.state.trainingMode).toBe(true);
            expect(characterStore.state.trainingResults.correct).toBe(0);
            expect(characterStore.state.trainingResults.incorrect).toBe(0);
        });

        it('records correct answers', () => {
            characterStore.startTraining();
            characterStore.recordAnswer(true);
            characterStore.recordAnswer(true);
            expect(characterStore.state.trainingResults.correct).toBe(2);
            expect(characterStore.state.trainingResults.incorrect).toBe(0);
        });

        it('records incorrect answers', () => {
            characterStore.startTraining();
            characterStore.recordAnswer(false);
            characterStore.recordAnswer(false);
            characterStore.recordAnswer(false);
            expect(characterStore.state.trainingResults.correct).toBe(0);
            expect(characterStore.state.trainingResults.incorrect).toBe(3);
        });

        it('calculates training result correctly', () => {
            characterStore.startTraining();
            characterStore.recordAnswer(true);
            characterStore.recordAnswer(true);
            characterStore.recordAnswer(false);

            const result = characterStore.getTrainingResult();
            expect(result.correct).toBe(2);
            expect(result.incorrect).toBe(1);
            expect(result.total).toBe(3);
            expect(result.percentage).toBe(67); // 2/3 = 66.67 rounded
        });

        it('shuffles characters for training', () => {
            const shuffled1 = characterStore.getShuffledCharacters();
            const shuffled2 = characterStore.getShuffledCharacters();

            expect(shuffled1.length).toBe(shuffled2.length);
            // Los arrays deberían tener los mismos caracteres pero potencialmente en diferente orden
            expect(shuffled1.length).toBeGreaterThan(0);
        });

        it('resets training', () => {
            characterStore.startTraining();
            characterStore.recordAnswer(true);
            characterStore.recordAnswer(false);

            characterStore.resetTraining();

            expect(characterStore.state.trainingMode).toBe(false);
            expect(characterStore.state.currentIndex).toBe(0);
            expect(characterStore.state.trainingResults.correct).toBe(0);
            expect(characterStore.state.trainingResults.incorrect).toBe(0);
        });
    });

    describe('Persistence', () => {
        it('saves progress to localStorage', () => {
            characterStore.selectLevel(2);
            characterStore.setCurrentIndex(5);

            const saved = localStorage.getItem('hsk-flashcards-progress');
            expect(saved).toBeTruthy();

            if (saved) {
                const parsed = JSON.parse(saved);
                expect(parsed.selectedLevel).toBe(2);
                expect(parsed.currentIndex).toBe(5);
            }
        });

        it('resets and clears localStorage', () => {
            characterStore.selectLevel(3);
            characterStore.reset();

            expect(characterStore.state.selectedLevel).toBeNull();
            expect(localStorage.getItem('hsk-flashcards-progress')).toBeNull();
        });
    });
});

