import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import VocabularyReview from '../../../src/pages/VocabularyReview';
import type { LearningStore } from '../../../src/stores/learningStore';
import { DAY, environment, itemOf, POOL_WORDS, type Env } from '../stores/fixtures';
import { answerOnScreen, withStore } from './harness';

let env: Env;
afterEach(() => {
  cleanup();
  env?.closeAll();
});

const open = (store: LearningStore, props: { practiceId?: string; resume?: boolean } = {}) => {
  const onBack = vi.fn();
  const onStrokes = vi.fn();
  const onPractice = vi.fn();
  render(withStore(store, () => (
    <VocabularyReview onBack={onBack} onStrokes={onStrokes} onPractice={onPractice} resume={props.resume ?? true} practiceId={props.practiceId} />
  )));
  return { onBack, onStrokes, onPractice };
};

const left = () => screen.getByText(/^Quedan \d+$|^Queda 1$/).textContent;

const finishOnScreen = async (store: LearningStore) => {
  for (let guard = 0; guard < 80 && !screen.queryByRole('dialog'); guard++) await answerOnScreen(store);
  return screen.getByRole('dialog');
};

describe('the word review page over the learning store', () => {
  it('teaches a word, practises it, resumes the same card after a reload and ends on the summary', async () => {
    env = environment();
    const first = env.store({ speechAvailable: () => false });
    const { onStrokes } = open(first);

    // Hoy opens on a lesson: the word, its reading and meaning, and the page's own details.
    expect(await screen.findByText('Palabra nueva', { selector: '.eyebrow' })).toBeTruthy();
    expect(screen.getByRole('img', { name: POOL_WORDS[0].simplified })).toBeTruthy();
    expect(screen.getByText('Cómo se escribe · toca un carácter')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /^Practicar trazos de/ })[0]);
    expect(onStrokes).toHaveBeenCalledWith([...POOL_WORDS[0].simplified][0]);
    // Leaving never discards: there is no such choice.
    expect(screen.queryByText('Descartar y salir')).toBeNull();

    await answerOnScreen(first);
    expect(first.status(itemOf(POOL_WORDS[0]))).toBe('learning');
    for (let i = 0; i < 4; i++) await answerOnScreen(first);
    const before = left();
    const card = document.body.textContent;
    cleanup();
    first.close();

    // A reload: a new store over the same database continues at the same card.
    const second = env.store({ speechAvailable: () => false });
    open(second);
    await waitFor(() => expect(left()).toBe(before));
    expect(document.body.textContent).toBe(card);

    const summary = await finishOnScreen(second);
    expect(summary).toHaveTextContent('Ninguna respuesta cambió tu calendario y 10 fueron práctica.');
    expect(summary).toHaveTextContent('Práctica, sin cambiar fechas');
    // The ten words taught today get their first rating tomorrow.
    expect(summary).toHaveTextContent('Mañana10 repasos');
    expect(second.newLeftToday()).toBe(0);
    const events = second.events();
    expect(events.filter((event) => event.type === 'exposure')).toHaveLength(10);
    expect(events.filter((event) => event.type === 'practice')).toHaveLength(10);
    expect(events.some((event) => event.type === 'scheduled-review')).toBe(false);
  });

  it('rates the words the next day with meaning cards and reports the reviews in the summary', async () => {
    env = environment();
    const store = env.store({ speechAvailable: () => false });
    const day0 = await env.session(store, { mode: 'today' });
    for (let guard = 0; guard < 80 && day0.view.state !== 'finished'; guard++) {
      if (day0.view.state === 'feedback') day0.actions.continue();
      else {
        const selection = day0.view.selection!;
        if (selection.kind === 'exposure') day0.actions.continue();
        else if (selection.exercise.grading === 'automatic') {
          day0.actions.answer({ optionId: selection.exercise.options.find((option) => option.contentId === selection.content.contentId)!.id });
        } else {
          day0.actions.reveal();
          day0.actions.selfAssess('good');
        }
      }
      await day0.idle();
    }
    env.clock.advance(DAY);
    expect(store.pendingToday()).toBe(10);

    open(store, { resume: false });
    expect(await screen.findByText('¿Qué significa esta palabra?')).toBeTruthy();
    const summary = await finishOnScreen(store);
    expect(summary).toHaveTextContent('10 repasos cambiaron tu calendario');
    expect(store.pendingToday()).toBe(0);
    expect(store.status(itemOf(POOL_WORDS[0]))).toBe('review');
  });

  it('explains an empty session instead of showing a blank summary', async () => {
    env = environment();
    const store = env.store({ speechAvailable: () => false });
    const { onPractice } = open(store, { practiceId: '__all__', resume: false });
    expect(await screen.findByText('Aún no hay palabras que repasar')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Aprender palabras nuevas' }));
    expect(onPractice).toHaveBeenCalledWith('__more__');
  });

  it('says a single word outside the checked lists cannot be studied here', async () => {
    env = environment();
    const store = env.store({ speechAvailable: () => false });
    open(store, { practiceId: 'word-not-in-pool', resume: false });
    expect(await screen.findByText('Esta palabra no está en tus niveles')).toBeTruthy();
  });
});
