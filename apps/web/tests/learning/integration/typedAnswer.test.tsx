import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateAttemptEvent } from '../../../src/domain/learning/evaluation';
import VocabularyReview from '../../../src/pages/VocabularyReview';
import type { LearningStore } from '../../../src/stores/learningStore';
import { DAY, environment, finish, itemOf, POOL_WORDS, type Env } from '../stores/fixtures';
import { answerOnScreen, withStore } from './harness';

let env: Env;
afterEach(() => {
  cleanup();
  env?.closeAll();
});

const word = POOL_WORDS[0];
const item = itemOf(word);
const TYPED_PINYIN = ['pinyin-from-characters', 'pinyin-from-gloss'];

/**
 * Real sessions take the word up the ladder: taught and practised, rated the next day, practised
 * on its own. The single-word session that opens on a typed reading is left stored, unanswered.
 */
const climbToTypedReading = async (store: LearningStore) => {
  await finish(await env.session(store, { mode: 'today' }));
  env.clock.advance(DAY);
  await finish(await env.session(store, { mode: 'today' }));
  for (let round = 0; round < 4; round++) {
    const session = await env.session(store, { mode: 'word', scope: { kind: 'item', itemId: item }, resume: false });
    const selection = session.view.selection;
    if (selection?.kind === 'exercise' && TYPED_PINYIN.includes(selection.prompt)) {
      await session.idle();
      return;
    }
    await finish(session);
  }
  throw new Error('The word never reached a typed reading');
};

describe('typing pinyin in a word session', () => {
  it('rejects unreadable text without saving, grades the reading, explains it and saves practice', async () => {
    env = environment();
    const store = env.store({ speechAvailable: () => false });
    await climbToTypedReading(store);
    const before = store.events().length;

    render(withStore(store, () => (
      <VocabularyReview onBack={vi.fn()} onStrokes={vi.fn()} onPractice={vi.fn()} practiceId={word.id} resume />
    )));
    const field = await screen.findByRole('textbox', { name: 'Pinyin con tonos' });

    // A tone that does not exist is a format error: the field keeps the text and nothing is saved.
    fireEvent.input(field, { target: { value: 'ba8 ba' } });
    fireEvent.click(screen.getByRole('button', { name: 'Comprobar' }));
    expect((await screen.findByRole('alert')).textContent).toContain('No hay tono 8');
    expect((field as HTMLInputElement).value).toBe('ba8 ba');
    expect(store.events()).toHaveLength(before);

    // The tone keys write digits at the caret; the preview shows the marks.
    fireEvent.input(field, { target: { value: 'ba ba' } });
    (field as HTMLInputElement).setSelectionRange(2, 2);
    fireEvent.click(screen.getByRole('button', { name: 'Tono 2' }));
    expect((field as HTMLInputElement).value).toBe('ba2 ba');
    expect(screen.getByText('bá ba')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Comprobar' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('«bá ba»')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Esta práctica no cambia cuándo vuelve.');

    const event = store.events().filter((candidate) => candidate.itemId === item).at(-1)!;
    expect(event.type).toBe('practice');
    if (event.type !== 'practice') return;
    expect(event.actions).toHaveLength(1);
    expect(event.actions[0]).toMatchObject({ type: 'answer', answer: 'ba2 ba' });
    expect(event.exercise.accepted?.map((entry) => entry.id)).toEqual([word.id]);
    expect(validateAttemptEvent(event)).toEqual([]);

    if (event.exercise.skill === 'tones') {
      // From the characters the tone counts: 爸 is bà.
      expect(event.evaluation).toEqual({ outcome: 'incorrect' });
      expect(screen.getByLabelText('Qué ha fallado').textContent).toContain('En bà escribiste tono 2 y lleva tono 4.');
    } else {
      // From the Spanish only the syllables decide; the tone is still pointed out.
      expect(event.evaluation).toEqual({ outcome: 'correct' });
      expect(screen.getByLabelText('Qué ha fallado').textContent).toContain('Aquí los tonos no cuentan');
    }

    // A miss brings the word back later in the session; the rest is answered right through the UI.
    for (let guard = 0; guard < 10 && !screen.queryByRole('dialog'); guard++) await answerOnScreen(store);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
