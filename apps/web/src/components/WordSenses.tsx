import { Component, For, Show } from 'solid-js';
import { groupSenses, WORD_POS_LABELS } from '@jiayou/content';
import type { VocabularyEntry } from '../data/vocabulary';

interface Props {
  word: VocabularyEntry;
  /** Leave out the first use, when the meaning above already says it, as on a review card. */
  omitLead?: boolean;
  /** Small type throughout, for a review card or a sheet. The word page makes the first use large. */
  compact?: boolean;
  /** One line per part of speech ("verbo: ver, leer"), for a card that only adds to its meaning. */
  inline?: boolean;
  /** A visible title over the full list, for a sheet. The word page keeps it for screen readers only. */
  heading?: string;
  class?: string;
}

/** Every use of a word, grouped by part of speech, with how each one is used. */
const WordSenses: Component<Props> = (props) => {
  const groups = () => {
    const all = groupSenses(props.word.senses);
    if (!props.omitLead) return all;
    return all
      .map((group, index) => (index === 0 ? { ...group, senses: group.senses.slice(1) } : group))
      .filter((group) => group.senses.length > 0);
  };
  return (
    <Show when={groups().length > 0}>
      <Show when={!props.inline} fallback={
        <section class={`text-left ${props.class ?? ''}`} aria-label="Otros usos">
          <h3 class="eyebrow">Otros usos</h3>
          <For each={groups()}>{(group) => (
            <p class="mt-1 text-[0.9375rem] leading-snug text-ink">
              <Show when={group.pos && groups().length > 1}>{(_) => <span class="text-ink-soft">{WORD_POS_LABELS[group.pos!].toLowerCase()}: </span>}</Show>
              <For each={group.senses}>{(sense, index) => (
                <>
                  {index() > 0 ? ', ' : ''}<span>{sense.text}</span>
                  <Show when={sense.note}>{(note) => <span class="text-sm text-ink-soft"> ({note()})</span>}</Show>
                </>
              )}</For>
            </p>
          )}</For>
        </section>
      }>
      <section class={`text-left ${props.class ?? ''}`} aria-label={props.omitLead ? 'Otros usos' : 'Significados'}>
        <h3 class={props.omitLead || props.heading ? 'eyebrow' : 'sr-only'}>{props.heading ?? (props.omitLead ? 'Otros usos' : 'Significados')}</h3>
        <For each={groups()}>{(group, groupIndex) => (
          <div class="mt-3 first:mt-0" classList={{ 'mt-2': (props.omitLead || !!props.heading) && groupIndex() === 0 }} role="group" aria-label={group.pos ? WORD_POS_LABELS[group.pos] : 'Usos'}>
            {/* Under a visible title the part of speech is a quiet line, not a second heading. */}
            <Show when={group.pos}>{(pos) => <p class={props.heading ? 'text-xs text-ink-soft first-letter:uppercase' : 'eyebrow'}>{WORD_POS_LABELS[pos()].toLowerCase()}</p>}</Show>
            <ol class="mt-1 space-y-1.5">
              <For each={group.senses}>{(sense, index) => (
                <li class={`flex gap-2.5 leading-snug text-ink ${!props.compact && groupIndex() === 0 && index() === 0 ? 'text-[1.25rem] font-medium' : 'text-[0.9375rem]'}`}>
                  <Show when={props.word.senses.length > 1}><span class="mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-ink-faint" aria-hidden="true" /></Show>
                  <span class="min-w-0">
                    <span class="first-letter:uppercase inline-block">{sense.text}</span>
                    {/* How it is used reads quieter than the use itself. */}
                    <Show when={sense.note}>{(note) => <span class="text-sm font-normal text-ink-soft"> ({note()})</span>}</Show>
                  </span>
                </li>
              )}</For>
            </ol>
          </div>
        )}</For>
      </section>
      </Show>
    </Show>
  );
};

export default WordSenses;
