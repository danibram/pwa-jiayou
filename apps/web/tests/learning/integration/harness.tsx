import { fireEvent, screen, waitFor, within } from '@solidjs/testing-library';
import type { JSX } from 'solid-js';
import { LearningStoreContext } from '../../../src/components/LearningStoreContext';
import type { LearningStore } from '../../../src/stores/learningStore';
import { rightText } from '../stores/fixtures';

/** Renders `children` over the given store, as the app does over its own. */
export const withStore = (store: LearningStore, children: () => JSX.Element) => () => (
  <LearningStoreContext.Provider value={store}>{children()}</LearningStoreContext.Provider>
);

const enabled = (name: string | RegExp) =>
  screen.queryAllByRole('button', { name }).find((button) => !(button as HTMLButtonElement).disabled);

/** The text of the right option on the multiple-choice card the stored session is at. */
const rightOptionText = async (store: LearningStore): Promise<string> => {
  const [session] = await store.activeSessions();
  const entry = session?.queue[session.position];
  const option = entry?.exercise?.options.find((candidate) => candidate.contentId === entry.content.contentId);
  if (!option) throw new Error('No multiple-choice card stored at the current position');
  return option.text;
};

/**
 * Answers whatever card is on screen through the UI, the way a learner would: continues a lesson
 * or a feedback, picks the right option, types the right answer, or reveals and rates Bien. Waits
 * for the save.
 */
export const answerOnScreen = async (store: LearningStore, outcome: 'right' | 'wrong' = 'right'): Promise<void> => {
  const before = document.body.textContent;
  // Decide and click in the same tick, so a save or an auto-advance cannot move the card in between.
  let next: 'choice' | 'recall' | null = null;
  let typed = false;
  await waitFor(() => {
    // A first lesson opens with "Enséñamela" before its Continuar.
    const teach = enabled('Enséñamela');
    if (teach) fireEvent.click(teach);
    const go = enabled('Continuar');
    if (go) return void fireEvent.click(go);
    if (screen.queryByRole('textbox') && enabled('No lo sé')) {
      if (outcome === 'wrong') return void fireEvent.click(enabled('No lo sé')!);
      typed = true;
      return;
    }
    if (screen.queryByRole('group', { name: /^Elige/ }) && enabled('No lo sé')) {
      if (outcome === 'wrong') return void fireEvent.click(enabled('No lo sé')!);
      next = 'choice';
      return;
    }
    const show = enabled('Mostrar respuesta');
    if (show) {
      fireEvent.click(show);
      next = 'recall';
      return;
    }
    throw new Error('No card ready');
  });
  if (typed) {
    const [session] = await store.activeSessions();
    const exercise = session?.queue[session.position]?.exercise;
    if (!exercise) throw new Error('No typed card stored at the current position');
    fireEvent.input(screen.getByRole('textbox'), { target: { value: rightText(exercise) } });
    fireEvent.click(screen.getByRole('button', { name: 'Comprobar' }));
  } else if (next === 'choice') {
    const text = await rightOptionText(store);
    await waitFor(() => {
      const option = within(screen.getByRole('group', { name: /^Elige/ })).getByRole('button', { name: text });
      expect(option).toBeEnabled();
      fireEvent.click(option);
    });
  } else if (next === 'recall') {
    await waitFor(() => {
      const group = screen.getByRole('group', { name: '¿Lo recordabas?' });
      fireEvent.click(within(group).getByRole('button', { name: outcome === 'right' ? /^Bien\./ : /^Otra vez\./ }));
    });
  }
  await waitFor(() => {
    if (document.body.textContent === before) throw new Error('Nothing changed yet');
    if (screen.queryByText('Guardando…')) throw new Error('Still saving');
  });
};
