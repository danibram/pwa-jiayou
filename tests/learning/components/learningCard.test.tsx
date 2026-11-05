import { createSignal } from 'solid-js';
import { fireEvent, render, screen, within } from '@solidjs/testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LearningCard from '../../../src/components/learning/LearningCard';
import type { LearningSessionView } from '../../../src/components/learning/types';
import { speakWord } from '../../../src/utils/speech';
import { de, meaningSelection, ni, optionAnswer, practiceSelection, sessionActions, teachSelection, view } from './fixtures';

vi.mock('../../../src/utils/speech', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/utils/speech')>()),
  speakWord: vi.fn(),
}));

const mount = (initial: LearningSessionView, options: { allowEasy?: boolean } = {}) => {
  const [current, setView] = createSignal(initial);
  const actions = sessionActions();
  const result = render(() => <LearningCard view={current()} actions={actions} allowEasy={options.allowEasy} />);
  return { ...result, actions, setView, current };
};

const listenButtons = () => screen.queryAllByRole('button', { name: /Escuchar/ });

beforeEach(() => {
  vi.mocked(speakWord).mockClear();
});

describe('teach card', () => {
  it('shows the word, plays it once and reports Ya la sé and Continuar', () => {
    const selection = teachSelection();
    const { actions } = mount(view({ selection }));
    expect(screen.getByRole('img', { name: '你好' })).toBeTruthy();
    expect(screen.getByText(selection.card.answer.meaning)).toBeTruthy();
    expect(speakWord).toHaveBeenCalledOnce();
    expect(vi.mocked(speakWord).mock.calls[0].slice(0, 2)).toEqual([selection.card.audio!.pinyin, '你好']);
    fireEvent.click(screen.getByRole('button', { name: 'Ya la sé' }));
    expect(actions.knowIt).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(actions.continue).toHaveBeenCalledOnce();
  });

  it('keeps Ya la sé off once the exposure is recorded', () => {
    const { actions } = mount(view({ selection: teachSelection(), state: 'feedback', feedback: { outcome: 'correct', rating: null, recorded: 'exposure' } }));
    expect(screen.getByRole('button', { name: 'Ya la sé' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(actions.continue).toHaveBeenCalledOnce();
  });

  it('has no audio when speech is unavailable', () => {
    mount(view({ selection: teachSelection(true), speechAvailable: false }));
    expect(listenButtons()).toHaveLength(0);
    expect(speakWord).not.toHaveBeenCalled();
  });
});

describe('self-assessed recall', () => {
  it('asks the meaning from the characters, reveals, and rates with each button', () => {
    const selection = meaningSelection();
    const { actions, setView, current } = mount(view({ selection }));
    expect(screen.getByRole('img', { name: '你好' })).toBeTruthy();
    expect(screen.getByText('¿Qué significa esta palabra?')).toBeTruthy();
    expect(screen.queryByText(selection.exercise.answer!.meaning)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar respuesta' }));
    expect(actions.reveal).toHaveBeenCalledOnce();

    setView({ ...current(), revealed: true, actions: [{ type: 'reveal', at: 1 }] });
    expect(screen.getByText(selection.exercise.answer!.meaning)).toBeTruthy();
    const group = screen.getByRole('group', { name: '¿Lo recordabas?' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Otra vezNo la recordé',
      'DifícilLa recordé con esfuerzo',
      'BienLa recordé',
    ]);
    expect(within(group).getByRole('button', { name: /Difícil\. La recordé con esfuerzo/ })).toBeTruthy();
    for (const [index, rating] of (['again', 'hard', 'good'] as const).entries()) {
      fireEvent.click(buttons[index]);
      expect(actions.selfAssess).toHaveBeenLastCalledWith(rating);
    }
  });

  it('offers Fácil only when allowed, and rates from the keyboard', () => {
    const selection = meaningSelection();
    const { actions } = mount(view({ selection, revealed: true }), { allowEasy: true });
    fireEvent.click(screen.getByRole('button', { name: /^Fácil/ }));
    expect(actions.selfAssess).toHaveBeenLastCalledWith('easy');
    fireEvent.keyDown(window, { key: '2' });
    expect(actions.selfAssess).toHaveBeenLastCalledWith('hard');
  });

  it('has no audio on a revealed answer when speech is unavailable', () => {
    mount(view({ selection: meaningSelection(), revealed: true, speechAvailable: false }));
    expect(listenButtons()).toHaveLength(0);
  });

  it('hides Fácil by default', () => {
    mount(view({ selection: meaningSelection(), revealed: true }));
    expect(screen.queryByRole('button', { name: /^Fácil/ })).toBeNull();
  });

  it('asks a particle for its function', () => {
    mount(view({ selection: meaningSelection(de) }));
    expect(screen.getByText('¿Qué función cumple esta palabra?')).toBeTruthy();
  });

  it('offers the reading on a meaning card as a hint that does not give the answer away', () => {
    const selection = meaningSelection();
    const { actions, setView, current } = mount(view({ selection }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver el pinyin' }));
    expect(actions.hint).toHaveBeenCalledWith({ kind: 'pinyin', revealsAnswer: false, value: selection.exercise.answer!.pinyin });
    setView({ ...current(), actions: [{ type: 'hint', at: 1, hint: { kind: 'pinyin', revealsAnswer: false, value: selection.exercise.answer!.pinyin } }] });
    expect(screen.queryByRole('button', { name: 'Ver el pinyin' })).toBeNull();
  });

  it('asks the word from its gloss with no audio, and its pinyin hint reveals the answer', () => {
    const selection = practiceSelection('reverse');
    const { actions } = mount(view({ selection }));
    expect(screen.getByText('Significado → palabra')).toBeTruthy();
    expect(screen.getByText(selection.exercise.prompt)).toBeTruthy();
    expect(screen.queryByRole('img', { name: '你好' })).toBeNull();
    expect(listenButtons()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Ver el pinyin. Da la respuesta' }));
    expect(actions.hint).toHaveBeenCalledWith({ kind: 'pinyin', revealsAnswer: true, value: selection.exercise.answer!.pinyin });
  });

  it('plays a listening card as it opens and reports a failure to play', () => {
    const selection = practiceSelection('listen');
    const { actions } = mount(view({ selection }));
    expect(screen.getByText('¿Qué palabra es?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Escuchar otra vez' })).toBeTruthy();
    expect(speakWord).toHaveBeenCalledOnce();
    const unavailable = vi.mocked(speakWord).mock.calls[0][2]!;
    unavailable();
    expect(actions.audioFailed).toHaveBeenCalledOnce();
  });

  it('says a practice answer does not move the schedule', () => {
    const selection = practiceSelection('reverse');
    const { actions } = mount(view({
      selection,
      state: 'feedback',
      revealed: true,
      feedback: { outcome: 'correct', rating: null, recorded: 'practice' },
    }));
    expect(screen.getByText('Esta práctica no cambia cuándo vuelve.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(actions.continue).toHaveBeenCalledOnce();
  });

  it('names the rating a scheduled review wrote', () => {
    mount(view({
      selection: meaningSelection(),
      state: 'feedback',
      revealed: true,
      feedback: { outcome: 'correct', rating: 'hard', recorded: 'scheduled-review' },
    }));
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Difícil');
    expect(status.textContent).toContain('Cuenta como repaso');
  });

  it('disables the rating while the answer is saved', () => {
    mount(view({ selection: meaningSelection(), state: 'saving', revealed: true }));
    for (const button of within(screen.getByRole('group', { name: '¿Lo recordabas?' })).getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
  });
});

describe('multiple choice', () => {
  it('reports a wrong tile and then the right one as two answers', () => {
    const selection = practiceSelection('pick');
    const { actions, setView, current } = mount(view({ selection }));
    const group = screen.getByRole('group', { name: 'Elige la palabra' });
    const right = selection.exercise.options.find((option) => option.contentId === ni.id)!;
    const wrong = selection.exercise.options.find((option) => option.contentId !== ni.id)!;

    fireEvent.click(within(group).getByRole('button', { name: wrong.text }));
    expect(actions.answer).toHaveBeenNthCalledWith(1, { optionId: wrong.id });
    setView({ ...current(), actions: [optionAnswer(wrong.id, 'incorrect')] });
    expect(within(group).getByRole('button', { name: `${wrong.text}, incorrecta` })).toBeDisabled();
    expect(screen.getByText('Esa no. Prueba otra vez.')).toBeTruthy();

    fireEvent.click(within(group).getByRole('button', { name: right.text }));
    expect(actions.answer).toHaveBeenNthCalledWith(2, { optionId: right.id });
    expect(actions.answer).toHaveBeenCalledTimes(2);

    setView({
      ...current(),
      state: 'feedback',
      revealed: true,
      actions: [optionAnswer(wrong.id, 'incorrect'), optionAnswer(right.id, 'correct', 2_000)],
      feedback: { outcome: 'incorrect', rating: null, recorded: 'practice' },
    });
    const status = screen.getByRole('status');
    expect(status.textContent).toContain(`Tocaste ${wrong.text}. La respuesta es 你好.`);
    expect(status.textContent).toContain('Esta práctica no cambia cuándo vuelve.');
  });

  it('reports No lo sé as an answer without an option', () => {
    const { actions } = mount(view({ selection: practiceSelection('pick') }));
    fireEvent.click(screen.getByRole('button', { name: 'No lo sé' }));
    expect(actions.answer).toHaveBeenCalledWith({ answer: null, optionId: null });
  });

  it('lists meanings under the characters on a recognition card', () => {
    const selection = practiceSelection('recognize');
    const { actions } = mount(view({ selection }));
    expect(screen.getByRole('img', { name: '你好' })).toBeTruthy();
    const group = screen.getByRole('group', { name: 'Elige el significado' });
    expect(within(group).getAllByRole('button')).toHaveLength(selection.exercise.options.length);
    fireEvent.click(within(group).getAllByRole('button')[0]);
    expect(actions.answer).toHaveBeenCalledWith({ optionId: selection.exercise.options[0].id });
  });

  it('plays a hearing card and lists words to pick', () => {
    mount(view({ selection: practiceSelection('hear') }));
    expect(speakWord).toHaveBeenCalledOnce();
    expect(screen.getByRole('group', { name: 'Elige la palabra' })).toBeTruthy();
  });

  it('turns an audio card into a skippable card when speech is unavailable', () => {
    const { actions } = mount(view({ selection: practiceSelection('hear'), speechAvailable: false }));
    expect(listenButtons()).toHaveLength(0);
    expect(speakWord).not.toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: 'Elige la palabra' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Saltar tarjeta' }));
    expect(actions.audioFailed).toHaveBeenCalledOnce();
  });

  it('says an invalid audio attempt does not count', () => {
    mount(view({
      selection: practiceSelection('hear'),
      state: 'feedback',
      revealed: true,
      feedback: { outcome: 'invalid', rating: null, recorded: 'invalid-attempt' },
    }));
    expect(screen.getByRole('status').textContent).toContain('No se pudo reproducir el audio, así que esta tarjeta no cuenta.');
  });
});

describe('accessibility', () => {
  it('names every button on each card kind', () => {
    const selections = [teachSelection(), meaningSelection(), practiceSelection('reverse'), practiceSelection('listen'), practiceSelection('pick'), practiceSelection('hear'), practiceSelection('recognize')];
    for (const selection of selections) {
      const { unmount } = mount(view({ selection }));
      for (const button of screen.getAllByRole('button')) {
        expect(button.getAttribute('aria-label') || button.textContent?.trim(), selection.kind).toBeTruthy();
        expect(button).toHaveAttribute('type', 'button');
      }
      unmount();
    }
  });

  it('marks Chinese text with its language and keeps the answer hidden on a pick card', () => {
    const { container } = mount(view({ selection: practiceSelection('pick') }));
    const tiles = screen.getByRole('group', { name: 'Elige la palabra' }).querySelectorAll('[lang="zh-CN"]');
    expect(tiles.length).toBeGreaterThan(0);
    expect(container.querySelector('[role="img"][lang="zh-CN"]')).toBeNull();
  });
});
