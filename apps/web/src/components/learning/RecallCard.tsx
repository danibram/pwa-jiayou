import { Component, createEffect, JSX, on, Show } from 'solid-js';
import type { Exercise } from '@jiayou/learning/types';
import { speakWord } from '../../utils/speech';
import Pinyin from '../Pinyin';
import { AnswerPanel, AudioButton, CardScroll, ContinueButton, createHold, FeedbackNote, HanziBlock, HintButton, RatingButtons, TakenHints } from './parts';
import { askedGloss, offeredHint, takenHints } from './present';
import type { LearningSessionActions, LearningSessionView } from './types';

interface RecallCardProps {
  exercise: Exercise;
  view: LearningSessionView;
  actions: LearningSessionActions;
  allowEasy: boolean;
  details?: JSX.Element;
  onCharacter?: (char: string) => void;
  /** The check right after "Ya la sé": the answer is shown at once and Bien is chosen unless held. */
  claimedCheck?: boolean;
}

const EYEBROW = { characters: null, gloss: 'Significado → palabra', audio: 'Escucha' } as const;

/**
 * Free recall rated by the learner: meaning from the characters, the word from its gloss, or the
 * word from its sound. The learner reveals the answer and says how well they remembered it.
 */
const RecallCard: Component<RecallCardProps> = (props) => {
  const open = () => props.view.state === 'presenting';
  const answered = () => props.view.state === 'feedback' || (props.view.state !== 'presenting' && !!props.view.feedback);
  const showAnswer = () => props.view.revealed || answered();
  const hint = () => offeredHint(props.exercise);
  const taken = () => takenHints(props.view.actions);
  const hintTaken = () => taken().some((hint) => hint.kind === 'pinyin');
  const cue = () => props.exercise.cue;
  /** Rated Bien or Fácil: the learner knew it, so the answer goes by on its own unless held. */
  const knew = () => props.view.actions.some((action) => action.type === 'self-assessment' && (action.rating === 'good' || action.rating === 'easy'));
  // A touch or scroll holds the countdown once the answer is on screen, rated or not.
  const { held, hold } = createHold(showAnswer);

  // "Ya la sé" already claimed it: the check opens on the answer, not on a question to reveal.
  createEffect(on(() => props.exercise.id, () => {
    if (props.claimedCheck && props.view.state === 'presenting' && !props.view.revealed) props.actions.reveal();
  }));

  // Knowing it needs no results screen: Bien or Fácil goes straight to the next card. Otra vez and
  // Difícil stop on the answer and the word's sheet. The header's undo still takes it back.
  createEffect(on(() => props.view.state, (state) => {
    if (state === 'feedback' && knew()) props.actions.continue();
  }));

  // The sound is the question on a listening card, so it plays as the card opens. If it cannot
  // play, the card cannot be answered and the controller closes it as invalid.
  createEffect(on(() => props.exercise.id, () => {
    const audio = props.exercise.audio;
    if (cue() !== 'audio' || !audio || !props.view.speechAvailable || props.view.revealed) return;
    speakWord(audio.pinyin, audio.hanzi, () => props.actions.audioFailed());
  }));

  return (
    <>
      <CardScroll answered={showAnswer()} showDetails={showAnswer()} details={props.details} onHold={hold}>
        <Show when={answered() && props.view.feedback} fallback={
          <Show when={EYEBROW[cue()]}>{(label) => <p class="eyebrow mb-3">{label()}</p>}</Show>
        }>{(feedback) => <FeedbackNote feedback={feedback()} audioCue={cue() === 'audio'} />}</Show>

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
          <HanziBlock characters={answer().characters} compact={showAnswer()} onCharacter={showAnswer() ? props.onCharacter : undefined} />
        )}</Show>
        {/* The reading of a word written like another (还 hái, 还 huán) is part of the question. */}
        <Show when={cue() === 'characters' && !showAnswer() && props.exercise.context}>{(context) => (
          <Pinyin word text={context()} class="mt-2 text-lg font-medium" />
        )}</Show>

        <Show when={showAnswer() && props.exercise.answer} fallback={
          <>
            <TakenHints hints={taken()} />
            <p class="mt-6 text-sm text-ink-soft">{props.exercise.prompt}</p>
            <Show when={hint() && !hintTaken()}>
              <HintButton hint={hint()!} disabled={!open()} onHint={(value) => props.actions.hint(value)} />
            </Show>
          </>
        }>{(answer) => (
          <AnswerPanel answer={answer()} audio={props.exercise.audio} speechAvailable={props.view.speechAvailable} />
        )}</Show>

        {/* A word recalled with effort or missed opens its detail; one recalled easily folds it. */}
      </CardScroll>

      <Show when={!answered()} fallback={
        <ContinueButton auto={knew()} held={held()} disabled={props.view.state !== 'feedback'} onContinue={() => props.actions.continue()} />
      }>
        <Show when={props.view.revealed} fallback={
          <button type="button" class="btn-ink h-14 w-full" disabled={!open()} onClick={() => props.actions.reveal()}>Mostrar respuesta</button>
        }>
          <RatingButtons allowEasy={props.allowEasy} disabled={!open()} autoGood={props.claimedCheck} held={held()} onRate={(rating) => props.actions.selfAssess(rating)} />
        </Show>
      </Show>
    </>
  );
};

export default RecallCard;
