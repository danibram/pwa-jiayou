import { Component, For, Show, createMemo } from 'solid-js';
import SegmentedPicker from './SegmentedPicker';
import {
  joinPinyinParts,
  parsePinyinParts,
  parseSyllableParts,
  type SyllableParts,
  type Tone,
} from '@jiayou/chinese';

const TONE_OPTIONS: { value: `${Tone}`; label: string }[] = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '·' },
];

const field = 'h-11 w-full rounded-tile border border-line bg-surface px-3 text-base text-ink placeholder:text-ink-faint';

interface PinyinEditorProps {
  /** Hanzi that set how many syllable rows to show. */
  hanzi: string;
  /** Current reading, marked or with tone numbers. Empty means use `hint` for display. */
  value: string;
  /** Suggested reading from known characters. */
  hint?: string;
  onChange: (pinyin: string) => void;
  /** Catalog words: show the syllables without letting the learner change them. */
  readOnly?: boolean;
  class?: string;
}

/** One row per character: letters of the syllable, then a tone picker. */
const PinyinEditor: Component<PinyinEditorProps> = (props) => {
  const chars = createMemo(() => [...props.hanzi.replace(/\s+/g, '')]);

  const rows = createMemo(() => {
    const parts = parsePinyinParts(props.value.trim() || props.hint?.trim() || '');
    return chars().map((char, i) => ({
      char,
      letters: parts[i]?.letters ?? '',
      tone: parts[i]?.tone ?? (5 as Tone),
    }));
  });

  const emit = (next: SyllableParts[]) => {
    if (props.readOnly) return;
    props.onChange(joinPinyinParts(next));
  };

  const update = (index: number, patch: Partial<SyllableParts>) => {
    const next = rows().map((row, i) =>
      i === index ? { letters: patch.letters ?? row.letters, tone: patch.tone ?? row.tone } : { letters: row.letters, tone: row.tone },
    );
    emit(next);
  };

  const onLetters = (index: number, raw: string) => {
    if (props.readOnly) return;
    const cleaned = raw.toLowerCase().replace(/[^a-zü:vê1-5]/gi, '');
    const numbered = /^([a-zü:vê]*)([1-5])$/i.exec(cleaned);
    if (numbered?.[2]) {
      const parsed = parseSyllableParts(`${numbered[1] || rows()[index].letters}${numbered[2]}`);
      update(index, { letters: numbered[1] ? parsed.letters : rows()[index].letters, tone: parsed.tone });
      return;
    }
    update(index, { letters: cleaned.replace(/[1-5]/g, '') });
  };

  return (
    <div class={`grid gap-2 ${props.class ?? ''}`} role="group" aria-labelledby="pinyin-label">
      <span id="pinyin-label" class="text-sm font-medium">Pinyin</span>
      <Show
        when={chars().length > 0}
        fallback={<p class="text-sm text-ink-soft">Cuando escribas la palabra arriba, aquí sale una sílaba por carácter.</p>}
      >
        <ul class="grid gap-2">
          <For each={rows()}>
            {(row, index) => (
              <li class="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-1.5">
                <span class="font-hanzi text-center text-xl text-ink" lang="zh-CN" aria-hidden="true">{row.char}</span>
                <label class="min-w-0">
                  <span class="sr-only">Sílaba de {row.char}</span>
                  <input
                    class={field}
                    classList={{ 'opacity-70': !!props.readOnly }}
                    autocomplete="off"
                    autocapitalize="off"
                    spellcheck={false}
                    lang="zh-Latn-pinyin"
                    readOnly={props.readOnly}
                    value={row.letters}
                    placeholder="ni"
                    onInput={(e) => onLetters(index(), e.currentTarget.value)}
                  />
                </label>
                <div class="shrink-0" classList={{ 'pointer-events-none opacity-70': !!props.readOnly }}>
                  <SegmentedPicker
                    compact
                    label={`Tono de ${row.char}`}
                    value={`${row.tone}`}
                    options={TONE_OPTIONS}
                    onChange={(tone) => update(index(), { tone: Number(tone) as Tone })}
                  />
                </div>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
};

export default PinyinEditor;
