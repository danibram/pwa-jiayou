import { createSignal } from 'solid-js';
import { fireEvent, render, screen, within } from '@solidjs/testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LearningCard from '../../../src/components/learning/LearningCard';
import { askedGloss as askedGlossOf } from '../../../src/components/learning/present';
import type { LearningSessionView } from '../../../src/components/learning/types';
import { speakWord } from '../../../src/utils/speech';
import { de, meaningSelection, ni, optionAnswer, practiceSelection, sessionActions, teachSelection, typedAnswer, view } from './fixtures';

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
  it('shows only the characters while "Ya la sé" is open, and the lesson after Enséñamela', () => {
    const selection = teachSelection();
    const { actions } = mount(view({ selection, canClaimKnown: true }));
    expect(screen.getByRole('img', { name: '你好' })).toBeTruthy();
    expect(screen.queryByText(selection.card.answer.meaning)).toBeNull();
    expect(screen.queryByText(selection.card.answer.pinyin)).toBeNull();
    expect(speakWord).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Ya la sé' }));
    expect(actions.knowIt).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Enséñamela' }));
    expect(screen.getByText(selection.card.answer.meaning)).toBeTruthy();
    expect(speakWord).toHaveBeenCalledOnce();
    expect(vi.mocked(speakWord).mock.calls[0].slice(0, 2)).toEqual([selection.card.audio!.pinyin, '你好']);
    // The answer is on screen now, so the claim is gone.
    expect(screen.queryByRole('button', { name: 'Ya la sé' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(actions.continue).toHaveBeenCalledOnce();
    expect(actions.knowIt).toHaveBeenCalledOnce();
  });

  it('opens a closed lesson with Space before continuing, and closes the next card again', () => {
    const selection = teachSelection();
    const { actions, setView } = mount(view({ selection, canClaimKnown: true }));
    fireEvent.keyDown(window, { code: 'Space' });
    expect(actions.continue).not.toHaveBeenCalled();
    expect(screen.getByText(selection.card.answer.meaning)).toBeTruthy();
    fireEvent.keyDown(window, { code: 'Space' });
    expect(actions.continue).toHaveBeenCalledOnce();

    vi.mocked(speakWord).mockClear();
    const next = { ...selection, card: { ...selection.card, id: `${selection.card.id}-next` } };
    setView(view({ selection: next, canClaimKnown: true }));
    expect(screen.queryByText(selection.card.answer.meaning)).toBeNull();
    expect(speakWord).not.toHaveBeenCalled();
  });

  it('shows the lesson at once, with Continuar only, when no claim is open', () => {
    const selection = teachSelection();
    const { actions } = mount(view({ selection, canClaimKnown: false }));
    expect(screen.getByText(selection.card.answer.meaning)).toBeTruthy();
    expect(speakWord).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Ya la sé' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enséñamela' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(actions.continue).toHaveBeenCalledOnce();
  });

  it('offers no claim once the exposure is recorded', () => {
    const { actions } = mount(view({ selection: teachSelection(), state: 'feedback', feedback: { outcome: 'correct', rating: null, recorded: 'exposure' } }));
    expect(screen.queryByRole('button', { name: 'Ya la sé' })).toBeNull();
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

describe('typed answers', () => {
  const pinyinCard = () => practiceSelection('pinyin-from-characters');
  const field = () => screen.getByRole('textbox');
  const answeredView = (selection: ReturnType<typeof practiceSelection>, text: string | null, outcome: 'correct' | 'incorrect') =>
    view({
      selection,
      state: 'feedback',
      actions: [typedAnswer(selection.exercise, text)],
      feedback: { outcome, rating: null, recorded: 'practice' },
    });

  it('asks the reading of the characters and submits the typed text', () => {
    const selection = pinyinCard();
    const { actions } = mount(view({ selection }));
    expect(screen.getByRole('img', { name: '你好' })).toBeTruthy();
    expect(screen.getByText('Escribe el pinyin con sus tonos')).toBeTruthy();
    // The reading exercises are silent until answered: hearing the word gives the tones away.
    expect(speakWord).not.toHaveBeenCalled();
    expect(listenButtons()).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Comprobar' })).toBeDisabled();
    fireEvent.input(field(), { target: { value: 'ni3 hao3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Comprobar' }));
    expect(actions.answer).toHaveBeenCalledWith({ answer: 'ni3 hao3' });
  });

  it('adds a tone digit at the caret and previews the marks', () => {
    mount(view({ selection: pinyinCard() }));
    const input = field() as HTMLInputElement;
    fireEvent.input(input, { target: { value: 'ni hao' } });
    input.setSelectionRange(2, 2);
    fireEvent.click(screen.getByRole('button', { name: 'Tono 3' }));
    expect(input.value).toBe('ni3 hao');
    expect(screen.getByText('nǐ hao')).toBeTruthy();
  });

  it('reports No lo sé as an answer without text', () => {
    const { actions } = mount(view({ selection: pinyinCard() }));
    fireEvent.click(screen.getByRole('button', { name: 'No lo sé' }));
    expect(actions.answer).toHaveBeenCalledWith({ answer: null });
  });

  it('keeps the text and shows the format message the controller sends back', () => {
    const selection = pinyinCard();
    const { setView, current } = mount(view({ selection }));
    fireEvent.input(field(), { target: { value: 'ni8 hao3' } });
    setView({ ...current(), inputError: 'No hay tono 8. Usa del 1 al 4, y 5 o 0 para el tono neutro.' });
    expect(screen.getByRole('alert').textContent).toBe('No hay tono 8. Usa del 1 al 4, y 5 o 0 para el tono neutro.');
    expect((field() as HTMLInputElement).value).toBe('ni8 hao3');
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(field()).toBeEnabled();
  });

  it('tells tone errors apart from syllable errors and plays the word once answered', () => {
    const selection = pinyinCard();
    const { unmount } = mount(answeredView(selection, 'ni2 hao4', 'incorrect'));
    const diagnosis = screen.getByLabelText('Qué ha fallado');
    expect(diagnosis.textContent).toContain('Las sílabas están bien. Fallan los tonos.');
    expect(diagnosis.textContent).toContain('En hǎo escribiste tono 4 y lleva tono 3.');
    // 你 before a third tone may be said with the second: that tone is right.
    expect(diagnosis.textContent).not.toContain('En nǐ');
    expect(screen.getByText('«ní hào»')).toBeTruthy();
    expect(speakWord).toHaveBeenCalledOnce();
    expect(vi.mocked(speakWord).mock.calls[0].slice(0, 2)).toEqual(['nǐ hǎo', '你好']);
    expect(screen.getByRole('button', { name: /Escuchar/ })).toBeTruthy();
    unmount();

    mount(answeredView(selection, 'ni3 hoa3', 'incorrect'));
    const syllables = screen.getByLabelText('Qué ha fallado');
    expect(syllables.textContent).toContain('Hay sílabas que no coinciden.');
    expect(syllables.textContent).toContain('En la sílaba 2 escribiste «hoa» y es hǎo.');
  });

  it('says nothing went wrong on a correct reading', () => {
    mount(answeredView(pinyinCard(), 'nǐ hǎo', 'correct'));
    expect(screen.queryByLabelText('Qué ha fallado')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Bien');
    expect(screen.getByRole('status').textContent).toContain('Esta práctica no cambia cuándo vuelve.');
  });

  it('asks the reading from the Spanish without showing the characters', () => {
    const selection = practiceSelection('pinyin-from-gloss');
    mount(view({ selection }));
    expect(screen.getByText('Significado → pinyin')).toBeTruthy();
    expect(screen.queryByRole('img', { name: '你好' })).toBeNull();
    expect(screen.getByText(askedGlossOf(selection.exercise.prompt))).toBeTruthy();
  });

  it('plays the word on an audio card and diagnoses wrong characters', () => {
    const selection = practiceSelection('characters-from-audio');
    const { actions, unmount } = mount(view({ selection }));
    expect(speakWord).toHaveBeenCalledOnce();
    vi.mocked(speakWord).mock.calls[0][2]!();
    expect(actions.audioFailed).toHaveBeenCalledOnce();
    expect(screen.queryByRole('group', { name: 'Añadir el tono' })).toBeNull();
    unmount();

    mount(answeredView(selection, '你们', 'incorrect'));
    expect(screen.getByLabelText('Qué ha fallado').textContent).toContain('Falla el carácter 2.');
  });

  it('lists the meanings that count after a wrong gloss', () => {
    const selection = practiceSelection('gloss-from-audio');
    mount(answeredView(selection, 'adiós', 'incorrect'));
    const diagnosis = screen.getByLabelText('Qué ha fallado');
    expect(diagnosis.textContent).toContain('Ese significado no está entre los de esta palabra.');
    expect(diagnosis.textContent).toContain('«hola»');
  });

  it('turns an audio typed card into a skippable card when speech is unavailable', () => {
    const { actions } = mount(view({ selection: practiceSelection('characters-from-audio'), speechAvailable: false }));
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Saltar tarjeta' }));
    expect(actions.audioFailed).toHaveBeenCalledOnce();
  });
});

describe('accessibility', () => {
  it('names every button on each card kind', () => {
    const selections = [
      teachSelection(),
      meaningSelection(),
      practiceSelection('reverse'),
      practiceSelection('listen'),
      practiceSelection('pick'),
      practiceSelection('hear'),
      practiceSelection('recognize'),
      practiceSelection('pinyin-from-characters'),
      practiceSelection('gloss-from-audio'),
    ];
    for (const selection of selections) {
      const { unmount } = mount(view({ selection }));
      for (const button of screen.getAllByRole('button')) {
        expect(button.getAttribute('aria-label') || button.textContent?.trim(), selection.kind).toBeTruthy();
        // Only Comprobar submits, and only the typed card's own form.
        if (button.textContent === 'Comprobar') expect(button).toHaveAttribute('type', 'submit');
        else expect(button).toHaveAttribute('type', 'button');
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
