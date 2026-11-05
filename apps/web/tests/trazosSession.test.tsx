import { fireEvent, screen, waitFor, within } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Home from '../src/pages/Home';
import Trazos from '../src/pages/Trazos';
import Vocabulario from '../src/pages/Vocabulario';
import { characterStore } from '../src/stores/characterStore';
import { type LearningStore } from '../src/stores/learningStore';
import { characterItemId } from '@jiayou/learning/items';
import { renderWithStore, testLearningStore } from './fixtures/learningStore';

// The canvas is replaced by buttons that report what hanzi-writer would: a finished drawing with its
// mistakes, and the stroke it shows by itself after repeated misses.
vi.mock('../src/components/StrokeCanvas', () => ({
  default: (props: { char: string; mode: string; onComplete?: (mistakes: number) => void; onAutoHint?: (stroke: number) => void; api?: (api: object) => void }) => (
    <div ref={() => props.api?.({ play: () => {}, hint: () => {}, showAnswer: () => {}, restartQuiz: () => {} })} data-testid="canvas" data-mode={props.mode}>
      {props.char}
      <button type="button" onClick={() => props.onAutoHint?.(1)}>auto-hint</button>
      <button type="button" onClick={() => props.onComplete?.(1)}>draw-1</button>
      <button type="button" onClick={() => props.onComplete?.(0)}>draw-0</button>
    </div>
  ),
}));

const DAY = 86_400_000;
let now = new Date(2026, 10, 5, 9).getTime();
let stores: LearningStore[] = [];
const store = () => {
  const created = testLearningStore({ clock: () => now });
  stores.push(created);
  return created;
};

beforeEach(() => {
  now = new Date(2026, 10, 5, 9).getTime();
  localStorage.setItem('hsk-installed-levels', '[1]');
  characterStore.selectLevels([1]);
});
afterEach(() => {
  for (const created of stores) created.close();
  stores = [];
  characterStore.reset();
  localStorage.clear();
});

/** What can be done on screen now: finish, draw a trace, or continue. Null while saving. */
const nextStep = (): 'done' | 'trace' | HTMLElement | null => {
  if (screen.queryByText('Trazos hechos')) return 'done';
  if (screen.queryByText('Guardando…') || screen.queryByText('Preparando la sesión…')) return null;
  const tracing = screen.queryByText('Calca el carácter') && !screen.queryByText(/^(Calcado|Con errores)$/);
  if (tracing) return 'trace';
  const next = screen.queryByRole('button', { name: /^Continuar/ });
  return next && !(next as HTMLButtonElement).disabled ? next : null;
};

/** Moves through the session on screen: watches continue, traces draw cleanly, results continue. */
const runSession = async (onTrace?: () => Promise<void>) => {
  for (let guard = 0; guard < 120; guard++) {
    const step = await waitFor(() => {
      const found = nextStep();
      expect(found).not.toBeNull();
      return found!;
    });
    if (step === 'done') return;
    if (step === 'trace') {
      if (onTrace) {
        const trace = onTrace;
        onTrace = undefined;
        await trace();
      } else fireEvent.click(screen.getByRole('button', { name: 'draw-0' }));
    } else fireEvent.click(step);
    // Let the write start before looking again.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('The session did not finish');
};

describe('Trazos on the learning log', { timeout: 20_000 }, () => {
  it('watches a new character, then traces it with an automatic hint recorded', async () => {
    const mine = store();
    renderWithStore(() => <Trazos focus={{ kind: 'level' }} onBack={() => {}} />, mine);
    expect(await screen.findByText('Carácter nuevo · mira el orden')).toBeTruthy();
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-mode', 'watch');
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(mine.events()).toHaveLength(1));
    expect(mine.events()[0]).toMatchObject({ type: 'exposure', sessionMode: 'strokes', card: { reason: 'teaching' } });

    await runSession(async () => {
      expect(screen.getByTestId('canvas')).toHaveAttribute('data-mode', 'write');
      fireEvent.click(screen.getByRole('button', { name: 'auto-hint' }));
      fireEvent.click(screen.getByRole('button', { name: 'draw-1' }));
      expect(await screen.findByText('Calcado')).toBeTruthy();
      expect(screen.getByText('1 error · con pista')).toBeTruthy();
      expect(screen.getByText('Esta práctica no cambia cuándo vuelve.')).toBeTruthy();
    });
    const traced = mine.events().find((event) => event.type === 'practice');
    expect(traced).toMatchObject({ exercise: { stage: 'trace' }, evaluation: { outcome: 'correct' } });
    expect(traced && 'actions' in traced && traced.actions).toMatchObject([
      { type: 'hint', hint: { revealsAnswer: true, value: 'auto-stroke:2' } },
      { type: 'drawing', mistakes: 1 },
    ]);
    expect(mine.events().some((event) => event.type === 'scheduled-review')).toBe(false);
  });

  it('writes from memory the next day: a hint makes it Otra vez', async () => {
    const mine = store();
    const first = renderWithStore(() => <Trazos focus={{ kind: 'level' }} onBack={() => {}} />, mine);
    await runSession();
    first.unmount();

    now += DAY;
    renderWithStore(() => <Trazos focus={{ kind: 'level' }} onBack={() => {}} />, mine);
    expect(await screen.findByText('De memoria')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pista' }));
    fireEvent.click(screen.getByRole('button', { name: 'draw-0' }));
    expect(await screen.findByText('Otra vez')).toBeTruthy();
    expect(screen.getByText('Sin errores · con pista')).toBeTruthy();
    const review = mine.events().find((event) => event.type === 'scheduled-review');
    expect(review).toMatchObject({ rating: 'again', exercise: { stage: 'memory' } });
  });

  it('undoing a trace restarts the drawing and voids the first attempt', async () => {
    const mine = store();
    renderWithStore(() => <Trazos focus={{ kind: 'level' }} onBack={() => {}} />, mine);
    await runSession(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'draw-1' }));
      expect(await screen.findByText('Calcado')).toBeTruthy();
      const first = screen.getByTestId('canvas');
      fireEvent.click(screen.getByRole('button', { name: 'Deshacer la última respuesta' }));
      await waitFor(() => expect(screen.queryByText('Calcado')).toBeNull());
      // Saving the void comes first; the card then comes back with a fresh canvas.
      await waitFor(() => expect(screen.getByTestId('canvas')).not.toBe(first));
      fireEvent.click(screen.getByRole('button', { name: 'draw-0' }));
      expect(await screen.findByText('Sin errores')).toBeTruthy();
    });
    const practices = mine.events().filter((event) => event.type === 'practice');
    const voided = mine.events().filter((event) => event.type === 'attempt-voided');
    expect(voided).toHaveLength(1);
    expect(practices.some((event) => event.id === (voided[0] as { targetEventId: string }).targetEventId && 'actions' in event && event.actions.some((action) => action.type === 'drawing' && action.mistakes === 1))).toBe(true);
  });

  it('shows the strokes of a character outside the selected levels without saving anything', async () => {
    characterStore.selectLevels([]);
    const mine = store();
    renderWithStore(() => <Trazos focus={{ kind: 'character', char: '爱' }} onBack={() => {}} />, mine);
    expect(screen.getByText(/no está en tus niveles/)).toBeTruthy();
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-mode', 'watch');
    expect(mine.events()).toHaveLength(0);
  });
});

describe('character status from the learning log', { timeout: 20_000 }, () => {
  it('Home shows the characters due in Trazos, and the word list their status', async () => {
    const mine = store();
    const session = renderWithStore(() => <Trazos focus={{ kind: 'level' }} onBack={() => {}} />, mine);
    await runSession();
    session.unmount();
    const taught = mine.events().filter((event) => event.type === 'exposure').length;
    expect(taught).toBeGreaterThan(0);
    const traced = mine.events().find((event) => event.type === 'practice')!;

    const home = renderWithStore(() => <Home onNavigate={() => {}} />, mine);
    // Today's eight new characters are spent, so Trazos has nothing more to offer today.
    expect(await screen.findByText('Al día')).toBeTruthy();
    expect(screen.getByText('Esta semana has practicado 1 día')).toBeTruthy();
    home.unmount();

    now += DAY;
    renderWithStore(() => <Home onNavigate={() => {}} />, mine);
    expect(await screen.findByText(`${taught} por repasar`)).toBeTruthy();
    expect(mine.status(traced.itemId)).toBe('learning');
  });

  it('the character sheet tags a taught character as learning', async () => {
    const mine = store();
    const session = renderWithStore(() => <Trazos focus={{ kind: 'level' }} onBack={() => {}} />, mine);
    await runSession();
    session.unmount();
    expect(mine.status(characterItemId('不'))).toBe('learning');
    expect(mine.status(characterItemId('客'))).toBe('new');
    renderWithStore(() => (
      <Vocabulario
        wordId="word-4e0d-5ba2-6c14-bu4-ke4-qi5"
        browse={{ query: '', topic: '', scroll: 0, choosingTopic: false }}
        onBrowse={() => {}}
        onBack={() => {}}
        onSelect={() => {}}
        onPractice={() => {}}
        onStrokes={() => {}}
      />
    ), mine);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver el carácter 不, 1 de 3' }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('aprendiendo')).toBeTruthy();
  });
});
