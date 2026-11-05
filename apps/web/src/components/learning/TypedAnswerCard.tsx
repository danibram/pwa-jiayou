import { Component, createEffect, createSignal, For, JSX, on, Show } from 'solid-js';
import type { Exercise, SpeechAudio } from '@jiayou/learning/types';
import { speakWord } from '../../utils/speech';
import { AnswerPanel, AudioButton, CardScroll, ContinueButton, FeedbackNote, HanziBlock } from './parts';
import { askedGloss, pinyinPreview, typedField, typedReport, type TypedField } from './present';
import type { LearningSessionActions, LearningSessionView } from './types';

interface TypedAnswerCardProps {
  exercise: Exercise;
  view: LearningSessionView;
  actions: LearningSessionActions;
  details?: JSX.Element;
  onCharacter?: (char: string) => void;
}

const EYEBROW: Record<Exercise['cue'], string> = {
  characters: 'Palabra → pinyin',
  gloss: 'Significado → pinyin',
  audio: 'Escucha y escribe',
};

const FIELD_LABEL: Record<TypedField, string> = {
  pinyin: 'Pinyin con tonos',
  characters: 'Caracteres',
  gloss: 'Significado en español',
};

const PLACEHOLDER: Record<TypedField, string> = { pinyin: 'ni3 hao3', characters: '你好', gloss: 'hola' };
const LANG: Record<TypedField, string> = { pinyin: 'zh-Latn-pinyin', characters: 'zh-CN', gloss: 'es' };

/** Digits the policy reads as tones, with the mark each one puts on a vowel. */
const TONE_KEYS = [
  { digit: '1', mark: 'ā', label: 'Tono 1' },
  { digit: '2', mark: 'á', label: 'Tono 2' },
  { digit: '3', mark: 'ǎ', label: 'Tono 3' },
  { digit: '4', mark: 'à', label: 'Tono 4' },
  { digit: '5', mark: 'a', label: 'Tono neutro' },
] as const;

/**
 * An answer the learner types: the reading from the characters or from the Spanish, or the word
 * heard, in characters or in Spanish. The controller grades the text; text it cannot read comes
 * back as `inputError` and the field keeps it. After the answer the card explains the diagnosis
 * and, for the reading, plays the word so the tones are heard.
 */
const TypedAnswerCard: Component<TypedAnswerCardProps> = (props) => {
  const [text, setText] = createSignal('');
  let field: HTMLInputElement | undefined;
  const open = () => props.view.state === 'presenting';
  const answered = () => props.view.state === 'feedback' || (props.view.state !== 'presenting' && !!props.view.feedback);
  const cue = () => props.exercise.cue;
  const kind = () => typedField(props.exercise);
  const report = () => typedReport(props.exercise, props.view.actions);
  const preview = () => (kind() === 'pinyin' && /\d/.test(text()) ? pinyinPreview(text()) : null);
  const key = props.view.cardKey;
  /** A right first answer shows for a moment, without the word's sheet, then the controller moves on. */
  const flashing = () => props.view.state === 'feedback' && props.view.after === 'flash';
  const unknown = () => props.view.actions.some((action) => action.type === 'answer' && action.answer === null);
  const formId = () => `typed-${props.exercise.id}`;
  /** The reading exercises carry no audio, since it gives the tones away. Once answered, the word is heard. */
  const answerAudio = (): SpeechAudio | null => {
    const answer = props.exercise.answer;
    if (props.exercise.audio) return props.exercise.audio;
    return answer ? { source: 'speech-synthesis', hanzi: answer.characters, pinyin: answer.pinyin } : null;
  };

  createEffect(on(() => props.exercise.id, () => {
    const audio = props.exercise.audio;
    if (cue() !== 'audio' || !audio || !props.view.speechAvailable || answered()) return;
    speakWord(audio.pinyin, audio.hanzi, () => props.actions.audioFailed());
  }));

  createEffect(on(answered, (now, before) => {
    if (!now || before || kind() !== 'pinyin' || !props.view.speechAvailable) return;
    const audio = answerAudio();
    // The attempt is already saved, so a failure here only leaves the button to try again.
    if (audio) speakWord(audio.pinyin, audio.hanzi);
  }));

  const submit = (event: Event) => {
    event.preventDefault();
    if (!open() || text().trim() === '') return;
    props.actions.answer({ answer: text() });
  };

  /** Puts a tone digit at the caret, as typing it would. */
  const insertTone = (digit: string) => {
    const value = text();
    const start = field?.selectionStart ?? value.length;
    const end = field?.selectionEnd ?? value.length;
    setText(value.slice(0, start) + digit + value.slice(end));
    field?.focus();
    field?.setSelectionRange(start + 1, start + 1);
  };

  return (
    <>
      <CardScroll showDetails={answered() && !flashing()} details={props.details}>
        <Show when={answered() && props.view.feedback} fallback={<p class="eyebrow mb-3">{EYEBROW[cue()]}</p>}>{(feedback) => (
          <FeedbackNote feedback={feedback()} audioCue={cue() === 'audio'} unknown={unknown()} />
        )}</Show>

        <Show when={cue() === 'gloss' && !answered()}>
          <p class="text-[1.75rem] font-semibold leading-snug text-balance first-letter:uppercase">{askedGloss(props.exercise.prompt)}</p>
        </Show>
        <Show when={cue() === 'audio' && !answered()}>
          <AudioButton
            audio={props.exercise.audio}
            speechAvailable={props.view.speechAvailable}
            size="lg"
            label="Escuchar otra vez"
            onUnavailable={() => props.actions.audioFailed()}
          />
        </Show>
        <Show when={(cue() === 'characters' || answered()) && props.exercise.answer}>{(answer) => (
          <HanziBlock characters={answer().characters} compact={answered()} onCharacter={answered() ? props.onCharacter : undefined} />
        )}</Show>
        {/* A gloss that tells 还 hái from 还 huán, or the length of a word another one shares a sense with. */}
        <Show when={!answered() && props.exercise.context}>{(context) => (
          <p class="mt-2 text-sm text-ink-soft first-letter:uppercase">{context()}</p>
        )}</Show>

        <Show when={answered()} fallback={
          <form id={formId()} class="mt-5 flex w-full max-w-[20rem] flex-col items-stretch gap-2" onSubmit={submit} novalidate>
            <label class="text-sm text-ink-soft" for={`${formId()}-field`}>{props.exercise.prompt}</label>
            <input
              ref={field}
              id={`${formId()}-field`}
              class="h-12 w-full rounded-tile border border-line bg-surface px-3 text-center text-lg text-ink placeholder:text-ink-faint"
              classList={{ 'font-hanzi': kind() === 'characters', 'border-seal': !!props.view.inputError }}
              aria-label={FIELD_LABEL[kind()]}
              aria-invalid={props.view.inputError ? 'true' : undefined}
              aria-describedby={props.view.inputError ? `${formId()}-error` : undefined}
              autocomplete="off"
              autocapitalize="off"
              spellcheck={false}
              lang={LANG[kind()]}
              placeholder={PLACEHOLDER[kind()]}
              disabled={!open()}
              value={text()}
              onInput={(event) => setText(event.currentTarget.value)}
            />
            <Show when={kind() === 'pinyin'}>
              <div class="grid grid-cols-5 gap-1.5" role="group" aria-label="Añadir el tono">
                <For each={TONE_KEYS}>{(key) => (
                  <button
                    type="button"
                    class="btn-ghost h-11 flex-col gap-0 px-0 text-sm"
                    disabled={!open()}
                    aria-label={key.label}
                    onClick={() => insertTone(key.digit)}
                  >
                    <span class="text-base leading-none">{key.mark}</span>
                    <span class="text-[0.6875rem] leading-none opacity-70">{key.digit === '5' ? '·' : key.digit}</span>
                  </button>
                )}</For>
              </div>
            </Show>
            <Show when={preview()}>{(shown) => (
              <p class="text-sm text-ink-soft">Se lee <span class="font-medium text-ink" lang="zh-Latn-pinyin">{shown()}</span></p>
            )}</Show>
            <Show when={props.view.inputError}>{(message) => (
              <p id={`${formId()}-error`} role="alert" class="text-sm text-seal">{message()}</p>
            )}</Show>
          </form>
        }>
          <Show when={report().given}>{(given) => (
            <p class="mt-3 text-sm text-ink-soft">
              Escribiste <span class="font-medium text-ink" classList={{ 'font-hanzi': kind() === 'characters' }} lang={LANG[kind()]}>«{given()}»</span>
            </p>
          )}</Show>
          <Show when={props.exercise.answer}>{(answer) => (
            <AnswerPanel answer={answer()} audio={answerAudio()} speechAvailable={props.view.speechAvailable} />
          )}</Show>
          <Show when={report().summary || report().lines.length > 0}>
            <div class="mt-3 w-full max-w-[19rem] rounded-xl bg-paper/60 px-4 py-2 text-left text-sm leading-snug" aria-label="Qué ha fallado">
              <Show when={report().summary}>{(summary) => <p class="font-semibold text-ink">{summary()}</p>}</Show>
              <For each={report().lines}>{(line) => <p class="mt-1 text-ink-soft">{line}</p>}</For>
            </div>
          </Show>
        </Show>

      </CardScroll>

      <Show when={!answered() || flashing()} fallback={
        <ContinueButton disabled={props.view.state !== 'feedback'} onContinue={() => props.actions.continue(key)} />
      }>
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            class="btn-quiet h-14 w-full"
            disabled={!open()}
            onClick={() => props.actions.answer({ answer: null })}
          >No lo sé</button>
          <button type="submit" form={formId()} class="btn-ink h-14 w-full" disabled={!open() || text().trim() === ''}>Comprobar</button>
        </div>
      </Show>
    </>
  );
};

export default TypedAnswerCard;
