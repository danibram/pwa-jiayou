import { Component, Show } from 'solid-js';
import Pinyin from '../../Pinyin';
import WatchStrokes from './WatchStrokes';

interface FreeStrokesProps {
  character: string;
  meaning: string;
  pinyin: string;
  /** Why this view records nothing, said once under the strokes. */
  note: string;
}

/**
 * The stroke order of a character outside a Trazos session: one outside HSK, outside the selected
 * levels, or past today's new-character budget. It only plays the strokes and saves nothing.
 */
const FreeStrokes: Component<FreeStrokesProps> = (props) => (
  <div class="flex min-h-0 flex-1 flex-col justify-center pb-4 animate-rise [animation-delay:60ms]">
    <div class="px-2 pb-3 text-center">
      <p class="font-sans text-2xl font-semibold leading-tight text-balance">{props.meaning}</p>
      <Show when={props.pinyin}>
        <Pinyin text={props.pinyin} class="mt-1 text-xl font-medium" />
      </Show>
    </div>
    <WatchStrokes char={props.character} />
    <p class="mt-3 text-center text-sm text-ink-soft">{props.note}</p>
  </div>
);

export default FreeStrokes;
