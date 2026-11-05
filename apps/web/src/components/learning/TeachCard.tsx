import { Component, createEffect, JSX, on, Show } from 'solid-js';
import { STUDY_RULES, type ExposureCard } from '@jiayou/learning/types';
import { speakWord } from '../../utils/speech';
import { AnswerPanel, CardScroll, HanziBlock } from './parts';
import type { LearningSessionActions, LearningSessionView } from './types';

interface TeachCardProps {
  card: ExposureCard;
  view: LearningSessionView;
  actions: LearningSessionActions;
  details?: JSX.Element;
  onCharacter?: (char: string) => void;
}

/**
 * A word shown to learn it: the characters, the reading, the meaning and its sound. Nothing to answer.
 *
 * Its step comes from the controller (`view.lesson`). A first teaching the learner may claim (`ask`)
 * shows only the characters with "Ya la sé" and "Enséñamela", so a claim never follows an answer on
 * screen. "Ya la sé" goes to the meaning check; "Enséñamela" opens the lesson (`open`), recorded on
 * Continuar. A word taught before (`again`) opens straight on the lesson and says so.
 */
const TeachCard: Component<TeachCardProps> = (props) => {
  const key = props.view.cardKey;
  const busy = () => props.view.state !== 'presenting';
  const gated = () => props.view.lesson?.mode === 'ask';
  const again = () => !!props.view.lesson?.again;
  // A new word is heard as it is first shown. A failure here is not a failed card: the button stays.
  createEffect(on([() => props.card.id, gated], ([, closed]) => {
    const audio = props.card.audio;
    if (!closed && props.view.speechAvailable && audio) speakWord(audio.pinyin, audio.hanzi);
  }));
  return (
    <>
      <CardScroll showDetails={!gated()} details={props.details}>
        <p class="eyebrow mb-3">{props.card.reason !== 'teaching' ? 'Ya la sabías' : again() ? 'Otra vez' : 'Palabra nueva'}</p>
        <Show when={again()}>
          <p class="mb-3 text-xs text-ink-soft" data-testid="teach-again">Ya la has visto. Repásala antes de practicarla.</p>
        </Show>
        <Show when={props.card.reason === 'teaching' && props.view.claimsUsedUp}>
          <p class="mb-3 text-xs text-ink-soft" data-testid="claims-used-up">Hoy ya has usado los {STUDY_RULES.alreadyKnownPerDay} «Ya la sé». Mañana vuelven.</p>
        </Show>
        <HanziBlock characters={props.card.answer.characters} compact={!gated()} onCharacter={gated() ? undefined : props.onCharacter} />
        <Show when={!gated()} fallback={<p class="mt-4 text-sm text-ink-soft">¿Ya sabes qué significa?</p>}>
          <AnswerPanel
            answer={props.card.answer}
            audio={props.card.audio}
            speechAvailable={props.view.speechAvailable}
          />
        </Show>
      </CardScroll>
      <Show when={gated()} fallback={
        <button type="button" class="btn-ink h-14 w-full" disabled={busy()} onClick={() => props.actions.continue(key)}>Continuar</button>
      }>
        <div class="grid grid-cols-2 gap-2">
          <button type="button" class="btn-quiet h-14 px-3" disabled={busy()} onClick={() => props.actions.knowIt(key)}>Ya la sé</button>
          <button type="button" class="btn-ink h-14" disabled={busy()} onClick={() => props.actions.openLesson(key)}>Enséñamela</button>
        </div>
      </Show>
    </>
  );
};

export default TeachCard;
