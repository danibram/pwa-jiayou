import { Component, For, Show, createMemo } from 'solid-js';
import { splitPinyin } from '@jiayou/chinese';

/** Pinyin coloured by tone, the same convention as the app. */
export const Pinyin: Component<{ text: string; class?: string }> = (props) => {
  const parts = createMemo(() => splitPinyin(props.text));
  return (
    <span class={`pinyin ${props.class ?? ''}`} lang="zh-Latn-pinyin">
      <For each={parts()}>{(part) => <span classList={{ [`tone-${part.tone ?? 0}`]: true }}>{part.text}</span>}</For>
    </span>
  );
};

/** Hanzi in the app's Kai face. */
export const Hanzi: Component<{ text: string; class?: string; size?: 'sm' | 'md' | 'lg' | 'xl' }> = (props) => (
  <span class={`hanzi hanzi-${props.size ?? 'md'} ${props.class ?? ''}`} lang="zh-Hans">{props.text}</span>
);

export const LevelTag: Component<{ level?: number }> = (props) => (
  <Show when={props.level} fallback={<span class="tag tag-extra">Extra</span>}>
    {(level) => <span class="tag">HSK {level()}</span>}
  </Show>
);

interface FieldProps {
  label: string;
  hint?: string;
  value: string;
  onInput: (value: string) => void;
  multiline?: boolean;
  disabled?: boolean;
  placeholder?: string;
  mono?: boolean;
  lang?: string;
  id?: string;
}

let fieldCount = 0;
/** One labelled control. Textareas grow with their content. */
export const Field: Component<FieldProps> = (props) => {
  const id = props.id ?? `field-${++fieldCount}`;
  return (
    <div class="field">
      <label for={id}>{props.label}</label>
      <Show when={props.multiline} fallback={
        <input id={id} value={props.value} disabled={props.disabled} placeholder={props.placeholder} lang={props.lang} classList={{ hanzi: props.mono }} onInput={(event) => props.onInput(event.currentTarget.value)} />
      }>
        <textarea id={id} value={props.value} disabled={props.disabled} placeholder={props.placeholder} lang={props.lang} rows={2} onInput={(event) => props.onInput(event.currentTarget.value)} />
      </Show>
      <Show when={props.hint}><p class="hint">{props.hint}</p></Show>
    </div>
  );
};
