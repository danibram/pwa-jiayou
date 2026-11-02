import { render } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import GradeButtons from '../src/components/GradeButtons';
import { vocabulary, type VocabularyEntry } from '../src/data/vocabulary';
import { askGloss, askOrder, interleave, pickChoices } from '../src/pages/VocabularyReview';

const word = (simplified: string) => vocabulary.find((entry) => entry.simplified === simplified)!;

describe('round 7 word review', () => {
  it('fills Olvidé, not Bien, once a miss is graded', () => {
    const view = render(() => <GradeButtons onGrade={vi.fn()} disabled suggested="again" />);
    const good = view.getByRole('button', { name: /Bien/ });
    const again = view.getByRole('button', { name: /Olvidé/ });
    expect(good.className).toContain('btn-quiet');
    expect(again.className).toContain('btn-ink');
  });

  it('adds the second sense when another word answers to the same first one', () => {
    expect(askGloss(word('菜')).text).toBe('plato, verdura');
    expect(askGloss(word('白')).text).toBe('blanco');
    expect(askGloss(word('多么')).text).not.toBe('qué');
  });

  it('picks distractors from the same topic and length first', () => {
    const target = word('白');
    const colours = vocabulary.filter((entry) => entry.topicIds?.includes('colores') && entry.characters.length === 1 && entry.id !== target.id);
    const pool: VocabularyEntry[] = vocabulary.filter((entry) => entry.level <= 3);
    const choices = pickChoices(target, pool);
    expect(choices).toHaveLength(4);
    expect(choices).toContain(target);
    const others = choices.filter((entry) => entry.id !== target.id);
    const expected = Math.min(3, colours.length);
    expect(others.filter((entry) => entry.topicIds?.includes('colores')).length).toBe(expected);
  });
});

describe('learning order', () => {
  const ten = vocabulary.filter((entry) => entry.level === 1).slice(0, 10);

  it('splits ten new words into even groups, never a lone word at the end', () => {
    const deck = interleave([], ten);
    const runs: number[] = [];
    deck.forEach((card, index) => {
      if (card.kind !== 'learn') return;
      if (deck[index - 1]?.kind === 'learn') runs[runs.length - 1] += 1;
      else runs.push(1);
    });
    expect(runs).toEqual([3, 4, 3]);
    expect(deck.filter((card) => card.prompt === 'pick')).toHaveLength(10);
    expect(deck.filter((card) => card.kind === 'recall' && !card.prompt)).toHaveLength(10);
  });

  it('never asks a group back in the order it was taught', () => {
    for (let run = 0; run < 50; run++) {
      const deck = interleave([], ten);
      deck.forEach((card, index) => {
        if (card.kind !== 'learn' || deck[index + 1]?.kind === 'learn') return;
        const taught = [];
        for (let back = index; deck[back]?.kind === 'learn'; back--) taught.unshift(deck[back].entry);
        const asked = deck.slice(index + 1, index + 1 + taught.length).map((next) => next.entry);
        expect(asked[0]).not.toBe(card.entry);
        expect(asked).not.toEqual(taught);
      });
    }
  });

  it('keeps two words in the only order that does not open on the last one shown', () => {
    const [a, b] = ten;
    expect(askOrder([a, b])).toEqual([a, b]);
  });

  it('prefers words already met as distractors', () => {
    const target = word('白');
    const pool: VocabularyEntry[] = vocabulary.filter((entry) => entry.level <= 3);
    const met = new Set(ten.filter((entry) => entry.id !== target.id).slice(0, 5).map((entry) => entry.id));
    const others = pickChoices(target, pool, (entry) => met.has(entry.id)).filter((entry) => entry.id !== target.id);
    expect(others.every((entry) => met.has(entry.id))).toBe(true);
  });
});
