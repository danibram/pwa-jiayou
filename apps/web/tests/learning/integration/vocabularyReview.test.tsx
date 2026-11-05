import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import VocabularyReview from '../../../src/pages/VocabularyReview';
import type { ItemContent } from '@jiayou/learning/exercises';
import type { PoolItem } from '@jiayou/learning/sessions';
import type { ItemId } from '@jiayou/learning/types';
import { characterStore } from '../../../src/stores/characterStore';
import { vocabularyStore } from '../../../src/stores/vocabularyStore';
import { type LearningStore } from '../../../src/stores/learningStore';
import { characterItemId, characterOf } from '@jiayou/learning/items';
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
  it('counts only words in the summary line for tomorrow, not the characters traced today', async () => {
    env = environment();
    const rows = ['爱', '八'].map((char) => characterStore.state.characters.find((row) => row.character === char)!);
    const words = env.words;
    const resolveContent = (itemId: ItemId): ItemContent | null => {
      const char = characterOf(itemId);
      if (char !== null) {
        const row = rows.find((candidate) => candidate.character === char);
        return row ? { kind: 'character', character: row } : null;
      }
      const word = words.get(itemId.slice('word-meaning:'.length));
      return word ? { kind: 'word', word } : null;
    };
    const pool = (): PoolItem[] => [
      ...POOL_WORDS.slice(0, 2).map((word) => ({ itemId: itemOf(word), available: true })),
      ...rows.map((row) => ({ itemId: characterItemId(row.character), available: true })),
    ];
    const store = env.store({ speechAvailable: () => false, resolveContent, pool });

    // Trazos first: both characters are watched and traced, so their first rating is due tomorrow too.
    const strokes = await env.session(store, { mode: 'strokes' });
    for (let guard = 0; guard < 40 && strokes.view.state !== 'finished'; guard++) {
      const selection = strokes.view.selection;
      if (strokes.view.state === 'feedback' || selection?.kind === 'exposure') strokes.actions.continue();
      else strokes.actions.drawing({ mistakes: 0 });
      await strokes.idle();
    }
    for (const row of rows) {
      expect(store.state(characterItemId(row.character))).toMatchObject({ state: 'new', eligibleFrom: expect.any(String) });
    }

    open(store);
    const summary = await finishOnScreen(store);
    expect(summary).toHaveTextContent('Mañana2 repasos');
  }, 15_000);

  it('teaches a word, practises it, resumes the same card after a reload and ends on the summary', async () => {
    env = environment();
    const first = env.store({ speechAvailable: () => false });
    const { onStrokes } = open(first);

    // Hoy opens on a new word with only its characters: "Ya la sé" must not follow the answer.
    expect(await screen.findByText('Palabra nueva', { selector: '.eyebrow' })).toBeTruthy();
    expect(screen.getByRole('img', { name: POOL_WORDS[0].simplified })).toBeTruthy();
    expect(screen.queryByText('Cómo se escribe · toca un carácter')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ya la sé' })).toBeTruthy();
    // Enséñamela opens the lesson: the reading, the meaning and the page's own details.
    fireEvent.click(screen.getByRole('button', { name: 'Enséñamela' }));
    expect(screen.getByText('Cómo se escribe · toca un carácter')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ya la sé' })).toBeNull();
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

  it('says a checked level is not downloaded when a topic has nothing else to study', async () => {
    env = environment();
    // The session's pool is empty, as when a topic's words all belong to a level still to download.
    const store = env.store({ speechAvailable: () => false, pool: () => [] });
    vocabularyStore.selectLists(['hsk-1', 'hsk-2']);
    try {
      open(store, { practiceId: 'topic:colores', resume: false });
      expect(await screen.findByText('Nada que estudiar en este tema')).toBeTruthy();
      expect(screen.getByText('Las palabras de HSK 2 no están descargadas en este dispositivo. Se descargarán cuando haya conexión.')).toBeTruthy();
    } finally {
      vocabularyStore.reset();
    }
  });

  it('says a single word outside the checked lists cannot be studied here', async () => {
    env = environment();
    const store = env.store({ speechAvailable: () => false });
    open(store, { practiceId: 'word-not-in-pool', resume: false });
    expect(await screen.findByText('Esta palabra no está en tus niveles')).toBeTruthy();
  });
});
