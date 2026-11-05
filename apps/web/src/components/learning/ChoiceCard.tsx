import { Component, createEffect, For, JSX, on, Show } from 'solid-js';
import type { Exercise } from '@jiayou/learning/types';
import { speakWord } from '../../utils/speech';
import Pinyin from '../Pinyin';
import { AnswerPanel, AudioButton, FeedbackNote, HanziBlock, HintButton, TakenHints } from './parts';
import { askedGloss, correctOptionId, offeredHint, takenHints, wrongOptionIds } from './present';
import type { LearningSessionActions, LearningSessionView } from './types';

interface ChoiceCardProps {
  exercise: Exercise;
  view: LearningSessionView;
  actions: LearningSessionActions;
  details?: JSX.Element;
}

const EYEBROW = { characters: 'Palabra → significado', gloss: 'Significado → palabra', audio: 'Escucha' } as const;

/**
 * Options graded by the controller: the word for a gloss, the word heard, or the meaning of the
 * characters. Every tap is reported as an answer, wrong ones included; which tiles are wrong comes
 * back in the view's actions.
 */
const ChoiceCard: Component<ChoiceCardProps> = (props) => {
  const open = () => props.view.state === 'presenting';
  const answered = () => props.view.state === 'feedback' || (props.view.state !== 'presenting' && !!props.view.feedback);
  const showAnswer = () => props.view.revealed || answered();
  const wrong = () => wrongOptionIds(props.view.actions);
  const found = () => correctOptionId(props.view.actions);
  const cue = () => props.exercise.cue;
  /** Recognition lists meanings; the other two list words. */
  const meaningTiles = () => cue() === 'characters';
  const hint = () => offeredHint(props.exercise);
  const taken = () => takenHints(props.view.actions);
  const optionText = (id: string) => props.exercise.options.find((option) => option.id === id)?.text ?? '';

  createEffect(on(() => props.exercise.id, () => {
    const audio = props.exercise.audio;
    if (cue() !== 'audio' || !audio || !props.view.speechAvailable || showAnswer()) return;
    speakWord(audio.pinyin, audio.hanzi, () => props.actions.audioFailed());
  }));

  /** After a wrong tile the mix-up is the lesson: what was tapped, and what the answer is. */
  const mixUp = () => {
    const [first] = wrong();
    const answer = props.exercise.answer;
    if (!first || !answer) return undefined;
    const right = meaningTiles() ? answer.meaning : answer.characters;
    return (
      <>
        Tocaste{' '}
        <Show when={meaningTiles()} fallback={<span class="font-hanzi text-base" lang="zh-CN">{optionText(first)}</span>}>
          «{optionText(first).toLowerCase()}»
        </Show>
        . La respuesta es{' '}
        <Show when={meaningTiles()} fallback={<span class="font-hanzi text-base" lang="zh-CN">{right}</span>}>
          «{right.toLowerCase()}»
        </Show>
        .
      </>
    );
  };

  const tileState = (id: string) => ({
    wrong: wrong().includes(id),
    right: found() === id,
  });

  return (
    <>
      <div class="sheet my-3 flex min-h-0 flex-1 flex-col items-center justify-start overflow-y-auto p-4 text-center [@media(min-height:600px)]:[justify-content:safe_center]">
        <p class="eyebrow mb-3">{EYEBROW[cue()]}</p>

        <Show when={cue() === 'gloss' && !showAnswer()}>
          <p class="text-[1.75rem] font-semibold leading-snug text-balance first-letter:uppercase">{askedGloss(props.exercise.prompt)}</p>
          <Show when={props.exercise.context}>{(context) => <p class="mt-1 text-sm text-ink-soft">{context()}</p>}</Show>
        </Show>
        <Show when={cue() === 'audio' && !showAnswer()}>
          <AudioButton
            audio={props.exercise.audio}
            speechAvailable={props.view.speechAvailable}
            size="lg"
            label="Escuchar otra vez"
            onUnavailable={() => props.actions.audioFailed()}
          />
        </Show>
        <Show when={(cue() === 'characters' || showAnswer()) && props.exercise.answer}>{(answer) => (
          <HanziBlock characters={answer().characters} />
        )}</Show>
        <Show when={cue() === 'characters' && !showAnswer() && props.exercise.context}>{(context) => (
          <Pinyin word text={context()} class="mt-2 text-lg font-medium" />
        )}</Show>

        <Show when={!showAnswer()} fallback={
          <Show when={props.exercise.answer}>{(answer) => (
            <AnswerPanel answer={answer()} audio={props.exercise.audio} speechAvailable={props.view.speechAvailable} details={props.details} />
          )}</Show>
        }>
          <TakenHints hints={taken()} />
          <p class="mt-3 text-sm text-ink-soft">{props.exercise.prompt}</p>
          <div
            class="mt-4 grid w-full max-w-[20rem]"
            classList={{ 'grid-cols-1 gap-2': meaningTiles(), 'grid-cols-2 gap-2.5': !meaningTiles() }}
            role="group"
            aria-label={meaningTiles() ? 'Elige el significado' : 'Elige la palabra'}
          >
            <For each={props.exercise.options}>{(option) => (
              <button
                type="button"
                class="tile flex items-center px-2 transition active:scale-[0.97]"
                classList={{
                  'min-h-12 justify-between gap-3 px-4 text-left': meaningTiles(),
                  'min-h-[4.5rem] flex-col justify-center': !meaningTiles(),
                  'border-seal/60 bg-seal-soft': tileState(option.id).wrong,
                  'border-jade/60 bg-jade/10': tileState(option.id).right,
                }}
                disabled={!open() || tileState(option.id).wrong}
                aria-label={tileState(option.id).wrong ? `${option.text}, incorrecta` : option.text}
                onClick={() => props.actions.answer({ optionId: option.id })}
              >
                <Show when={meaningTiles()} fallback={
                  <span class="font-hanzi text-[1.75rem] leading-none" classList={{ 'text-ink-faint': tileState(option.id).wrong }} lang="zh-CN">{option.text}</span>
                }>
                  <span class="text-base font-medium first-letter:uppercase" classList={{ 'text-ink-faint': tileState(option.id).wrong }}>{option.text}</span>
                </Show>
              </button>
            )}</For>
          </div>
          <Show when={open() && wrong().length > 0}>
            <p role="status" class="mt-3 text-sm text-seal">{meaningTiles() ? 'Ese no.' : 'Esa no.'} Prueba otra vez.</p>
          </Show>
          <Show when={hint() && !taken().some((taken) => taken.kind === 'pinyin')}>
            <HintButton hint={hint()!} disabled={!open()} onHint={(value) => props.actions.hint(value)} />
          </Show>
        </Show>

        <Show when={answered() && props.view.feedback}>{(feedback) => (
          <FeedbackNote feedback={feedback()} audioCue={cue() === 'audio'} mixUp={mixUp()} />
        )}</Show>
      </div>

      <Show when={!answered()} fallback={
        <button type="button" class="btn-ink h-14 w-full" disabled={props.view.state !== 'feedback'} onClick={() => props.actions.continue()}>Continuar</button>
      }>
        <button
          type="button"
          class="btn-quiet h-14 w-full"
          disabled={!open()}
          onClick={() => props.actions.answer({ answer: null, optionId: null })}
        >No lo sé</button>
      </Show>
    </>
  );
};

export default ChoiceCard;
