import { beforeEach, describe, expect, it, vi } from 'vitest';
import { characterStore, formatHskLevels, selectionFromSaved } from '../src/stores/characterStore';

describe('Character Store', () => {
  beforeEach(() => {
    localStorage.clear();
    characterStore.reset();
  });

  describe('Level Selection', () => {
    it('selects a level correctly', () => {
      characterStore.selectLevel(1);
      expect(characterStore.state.selectedLevels).toEqual([1]);
      expect(characterStore.state.currentIndex).toBe(0);
    });

    it('keeps several levels and mixes their characters', () => {
      characterStore.selectLevel(1);
      characterStore.toggleLevel(2);
      expect(characterStore.state.selectedLevels).toEqual([1, 2]);
      expect(characterStore.levelLabel()).toBe('HSK 1 y 2');

      const chars = characterStore.getCharactersByLevel();
      const levels = new Set(chars.map((char) => char.hsk_level));
      expect(levels).toEqual(new Set([1, 2]));
    });

    it('does not turn off the last selected level', () => {
      characterStore.selectLevel(2);
      characterStore.toggleLevel(2);
      expect(characterStore.state.selectedLevels).toEqual([2]);
    });

    it('reads a legacy single-level save', () => {
      expect(selectionFromSaved({ selectedLevel: 2, currentIndex: 4 })).toEqual([2]);
      expect(selectionFromSaved({ selectedLevels: [3, 1] })).toEqual([1, 3]);
      expect(formatHskLevels([1, 2, 3])).toBe('HSK 1, 2 y 3');
    });

    it('gets characters by selected level', () => {
      characterStore.selectLevel(1);
      const chars = characterStore.getCharactersByLevel();
      expect(chars.length).toBeGreaterThan(0);
      expect(chars.every((char) => char.hsk_level === 1)).toBe(true);
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
        expect(parsed.selectedLevels).toEqual([2]);
        expect(parsed.currentIndex).toBe(5);
      }
    });

    it('resets and clears localStorage', () => {
      characterStore.selectLevel(3);
      characterStore.reset();

      expect(characterStore.state.selectedLevels).toEqual([]);
      expect(localStorage.getItem('hsk-flashcards-progress')).toBeNull();
    });
  });
});

describe('Character data', () => {
  it('normalises stroke counts across level files', () => {
    for (const level of [1, 2, 3]) {
      characterStore.selectLevel(level);
      const chars = characterStore.getCharactersByLevel();
      expect(chars.every((c) => c.stroke_count > 0)).toBe(true);
    }
  });

  it('fills a missing traditional form with the simplified one', () => {
    expect(characterStore.state.characters.every((c) => !!c.traditional)).toBe(true);
  });

  it('only offers levels that have characters', () => {
    expect(characterStore.getAvailableLevels()).toEqual([1, 2, 3]);
  });

  it('shuffles without losing or duplicating characters', () => {
    characterStore.selectLevel(1);
    const original = characterStore
      .getCharactersByLevel()
      .map((c) => c.character)
      .sort();
    const shuffled = characterStore
      .getShuffledCharacters()
      .map((c) => c.character)
      .sort();
    expect(shuffled).toEqual(original);
  });
});

describe('Glosses', () => {
  it('gives every character a short gloss and an example word that contains it', () => {
    for (const c of characterStore.state.characters) {
      expect(c.gloss, c.character).toBeTruthy();
      expect(c.gloss!.length, c.character).toBeLessThanOrEqual(30);
      expect(c.example?.word, c.character).toContain(c.character);
    }
  });
});


describe('Saved character progress', () => {
  it.each([
    [{ selectedLevels: [99, 1, -1, 1], currentIndex: 3 }, [1], 3],
    [{ selectedLevel: 2, currentIndex: -1 }, [2], 0],
    [{ selectedLevels: [1], currentIndex: 99999 }, [1], 0],
    [{ selectedLevels: [1], currentIndex: 1.5 }, [1], 0],
    [{ selectedLevels: [99], currentIndex: 2 }, [], 0],
    [null, [], 0],
  ])('validates saved progress %j', async (saved, levels, index) => {
    localStorage.setItem('hsk-flashcards-progress', JSON.stringify(saved));
    vi.resetModules();
    const { characterStore: restored } = await import('../src/stores/characterStore');
    expect(restored.state.selectedLevels).toEqual(levels);
    expect(restored.state.currentIndex).toBe(index);
  });
});
