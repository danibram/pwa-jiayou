import { Component, createEffect, createSignal, JSX, on, onCleanup, Show } from 'solid-js';
import { STUDY_RULES, type ExposureCard } from '@jiayou/learning/types';
import { speakWord } from '../../utils/speech';
import { AnswerPanel, CardScroll, createArmed, HanziBlock } from './parts';
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
 * When the learner may claim to know the word (`view.canClaimKnown`), the card first shows only the
 * characters with "Ya la sé" and "Enséñamela", so a claim never follows an answer on screen. "Ya la
 * sé" goes to the meaning check; "Enséñamela" opens the lesson, recorded on Continuar.
 */
const TeachCard: Component<TeachCardProps> = (props) => {
  const busy = () => props.view.state !== 'presenting' && props.view.state !== 'feedback';
  const [opened, setOpened] = createSignal(false);
  const armed = createArmed();
  // Each card starts closed again.
  createEffect(on(() => props.card.id, () => setOpened(false)));
  const gated = () => props.card.reason === 'teaching' && props.view.canClaimKnown && !opened();
  // Space opens a closed lesson, then continues, as the buttons do. The card owns this key while a
  // claim is open; LearningCard handles it otherwise.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.code !== 'Space' || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if ('drawerOpen' in document.documentElement.dataset) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLButtonElement) return;
    if (props.card.reason !== 'teaching' || !props.view.canClaimKnown || props.view.state !== 'presenting') return;
    event.preventDefault();
    if (opened()) props.actions.continue();
    else setOpened(true);
  };
  window.addEventListener('keydown', onKeyDown);
  onCleanup(() => window.removeEventListener('keydown', onKeyDown));
  // A new word is heard as it is first shown. A failure here is not a failed card: the button stays.
  createEffect(on([() => props.card.id, gated], ([, closed]) => {
    const audio = props.card.audio;
    if (!closed && props.view.speechAvailable && audio) speakWord(audio.pinyin, audio.hanzi);
  }));
  return (
    <>
      <CardScroll answered={!gated()} showDetails={!gated()} details={props.details} onHold={() => {}}>
        <p class="eyebrow mb-3">{props.card.reason === 'teaching' ? 'Palabra nueva' : 'Ya la sabías'}</p>
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
        <button type="button" class="btn-ink h-14 w-full" disabled={busy()} onClick={() => props.actions.continue()}>Continuar</button>
      }>
        <div class="grid grid-cols-2 gap-2">
          <button type="button" class="btn-quiet h-14 px-3" disabled={props.view.state !== 'presenting'} onClick={() => { if (armed()) props.actions.knowIt(); }}>Ya la sé</button>
          <button type="button" class="btn-ink h-14" disabled={busy()} onClick={() => setOpened(true)}>Enséñamela</button>
        </div>
      </Show>
    </>
  );
};

export default TeachCard;
