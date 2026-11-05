import { Component, createMemo, JSX, Match, onCleanup, Show, Switch } from 'solid-js';
import type { ExerciseSelection } from '@jiayou/learning/exercises';
import type { Exercise, Rating } from '@jiayou/learning/types';
import { isTypedAnswerExercise } from '@jiayou/learning/production';
import ChoiceCard from './ChoiceCard';
import RecallCard from './RecallCard';
import TeachCard from './TeachCard';
import TypedAnswerCard from './TypedAnswerCard';
import { createArmed, FeedbackNote } from './parts';
import { RATING_KEY } from './present';
import type { LearningSessionActions, LearningSessionView } from './types';

interface LearningCardProps {
  view: LearningSessionView;
  actions: LearningSessionActions;
  /** Offer Fácil next to Otra vez, Difícil and Bien. Off by default. */
  allowEasy?: boolean;
  /**
   * Extra content under a revealed answer, filled by the page from the catalog: traditional form,
   * a word that shares a character, stroke tiles. The card itself only reads what the exercise stored.
   */
  details?: JSX.Element;
  /** Opens a character of the answered word over the card. */
  onCharacter?: (char: string) => void;
}

type ExerciseKind = Extract<ExerciseSelection, { kind: 'exercise' }>;

/** An audio question on a device that cannot play it. The builder skips these; a resumed card may not. */
const unplayable = (exercise: Exercise, view: LearningSessionView) =>
  exercise.cue === 'audio' && (!view.speechAvailable || !exercise.audio);

/** A card that cannot be answered as it stands. Skipping an audio card reports the audio failure. */
const InvalidCard: Component<{ view: LearningSessionView; actions: LearningSessionActions; message: string; audioCue: boolean }> = (props) => (
  <>
    <div class="sheet my-3 flex min-h-0 flex-1 flex-col items-center justify-center p-4 text-center">
      <p class="font-display text-xl">{props.message}</p>
      <Show when={props.view.state === 'feedback' && props.view.feedback} fallback={
        <p class="mt-2 text-sm text-ink-soft">Esta tarjeta no cuenta para tu progreso.</p>
      }>{(feedback) => <FeedbackNote feedback={feedback()} audioCue={props.audioCue} />}</Show>
    </div>
    <Show when={props.view.state === 'feedback'} fallback={
      <Show when={props.audioCue}>
        <button type="button" class="btn-ink h-14 w-full" disabled={props.view.state !== 'presenting'} onClick={() => props.actions.audioFailed()}>Saltar tarjeta</button>
      </Show>
    }>
      <button type="button" class="btn-ink h-14 w-full" onClick={() => props.actions.continue(props.view.cardKey)}>Continuar</button>
    </Show>
  </>
);

/**
 * A card's taps count only after it has been on screen a moment, so a quick second tap on the card
 * before (Continuar, an option) does not land on whatever this card has in the same spot.
 */
const Armed: Component<{ children: JSX.Element }> = (props) => {
  const armed = createArmed();
  return <div class="flex min-h-0 flex-1 flex-col" classList={{ 'pointer-events-none': !armed() }}>{props.children}</div>;
};

/**
 * Renders whatever card the session presents and reports what the learner does. It never decides
 * a result: correctness, ratings and what gets saved come back from the controller in `view`.
 *
 * Keys, as on the current review screen: Space reveals or continues, 1 to 4 rate a revealed card.
 */
const LearningCard: Component<LearningCardProps> = (props) => {
  const exercise = (): ExerciseKind | null => (props.view.selection?.kind === 'exercise' ? props.view.selection : null);
  /**
   * Each card mounts afresh on its key, so local state (an audio error, autoplay, a hold) never
   * leaks into the next one, and what a card reports carries the key it was shown with.
   */
  const cardKey = createMemo(() => (props.view.selection ? props.view.cardKey : null));

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    // A sheet opened over the card (a character, a related word) owns the keys meanwhile.
    if ('drawerOpen' in document.documentElement.dataset) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement) return;
    const view = props.view;
    const selection = view.selection;
    if (!selection) return;
    if (event.code === 'Space') {
      if (view.state === 'feedback') {
        event.preventDefault();
        props.actions.continue(view.cardKey);
      } else if (view.state === 'presenting' && selection.kind === 'exposure') {
        // A lesson that asks first opens before it continues, as the buttons do.
        event.preventDefault();
        if (view.lesson?.mode === 'ask') props.actions.openLesson(view.cardKey);
        else props.actions.continue(view.cardKey);
      } else if (view.state === 'presenting' && selection.kind === 'exercise' && selection.exercise.grading === 'self-assessment' && !view.revealed) {
        event.preventDefault();
        props.actions.reveal();
      }
      return;
    }
    if (view.state !== 'presenting' || !view.revealed || selection.kind !== 'exercise') return;
    if (selection.exercise.grading !== 'self-assessment') return;
    const rating = (Object.keys(RATING_KEY) as Rating[]).find((value) => RATING_KEY[value] === event.key);
    if (rating && (rating !== 'easy' || props.allowEasy)) props.actions.selfAssess(rating);
  };
  window.addEventListener('keydown', onKeyDown);
  onCleanup(() => window.removeEventListener('keydown', onKeyDown));

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <Show when={cardKey()} keyed>
      <Armed>
      <Switch>
        <Match when={props.view.selection?.kind === 'exposure' && props.view.selection}>{(selection) => (
          <TeachCard card={(selection() as Extract<ExerciseSelection, { kind: 'exposure' }>).card} view={props.view} actions={props.actions} details={props.details} onCharacter={props.onCharacter} />
        )}</Match>
        <Match when={exercise() && unplayable(exercise()!.exercise, props.view)}>
          <InvalidCard view={props.view} actions={props.actions} message="Este dispositivo no puede reproducir el audio de esta tarjeta." audioCue />
        </Match>
        <Match when={exercise() && isTypedAnswerExercise(exercise()!.exercise)}>
          <TypedAnswerCard exercise={exercise()!.exercise} view={props.view} actions={props.actions} details={props.details} onCharacter={props.onCharacter} />
        </Match>
        <Match when={exercise()?.exercise.format === 'free-recall' && exercise()!.exercise.grading === 'self-assessment'}>
          <RecallCard exercise={exercise()!.exercise} view={props.view} actions={props.actions} allowEasy={props.allowEasy ?? false} details={props.details} onCharacter={props.onCharacter} />
        </Match>
        <Match when={exercise()?.exercise.format === 'multiple-choice'}>
          <ChoiceCard exercise={exercise()!.exercise} view={props.view} actions={props.actions} details={props.details} onCharacter={props.onCharacter} />
        </Match>
        <Match when={exercise()}>
          <InvalidCard view={props.view} actions={props.actions} message="Esta tarjeta todavía no se puede mostrar." audioCue={false} />
        </Match>
      </Switch>
      </Armed>
      </Show>
    </div>
  );
};

export default LearningCard;
