import { Component, createEffect, JSX, on, Show } from 'solid-js';
import type { ExposureCard } from '../../domain/learning/types';
import { speakWord } from '../../utils/speech';
import { AnswerPanel, HanziBlock } from './parts';
import type { LearningSessionActions, LearningSessionView } from './types';

interface TeachCardProps {
  card: ExposureCard;
  view: LearningSessionView;
  actions: LearningSessionActions;
  details?: JSX.Element;
}

/** A word shown to learn it: the characters, the reading, the meaning and its sound. Nothing to answer. */
const TeachCard: Component<TeachCardProps> = (props) => {
  const busy = () => props.view.state !== 'presenting' && props.view.state !== 'feedback';
  // A new word is heard as it is first shown. A failure here is not a failed card: the button stays.
  createEffect(on(() => props.card.id, () => {
    const audio = props.card.audio;
    if (props.view.speechAvailable && audio) speakWord(audio.pinyin, audio.hanzi);
  }));
  return (
    <>
      <div class="sheet my-3 flex min-h-0 flex-1 flex-col items-center justify-start overflow-y-auto p-4 text-center [@media(min-height:600px)]:justify-center">
        <p class="eyebrow mb-3">{props.card.reason === 'teaching' ? 'Palabra nueva' : 'Ya la sabías'}</p>
        <HanziBlock characters={props.card.answer.characters} />
        <AnswerPanel
          answer={props.card.answer}
          audio={props.card.audio}
          speechAvailable={props.view.speechAvailable}
          details={props.details}
        />
      </div>
      <Show when={props.card.reason === 'teaching'} fallback={
        <button type="button" class="btn-ink h-14 w-full" disabled={busy()} onClick={() => props.actions.continue()}>Continuar</button>
      }>
        <div class="grid grid-cols-[1fr_2fr] gap-2">
          <button type="button" class="btn-quiet h-14 px-3" disabled={props.view.state !== 'presenting'} onClick={() => props.actions.knowIt()}>Ya la sé</button>
          <button type="button" class="btn-ink h-14" disabled={busy()} onClick={() => props.actions.continue()}>Continuar</button>
        </div>
      </Show>
    </>
  );
};

export default TeachCard;
