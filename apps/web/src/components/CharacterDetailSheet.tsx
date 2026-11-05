import { Component, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import CharacterGlyph from './CharacterGlyph';
import Drawer from './Drawer';
import SpeakButton from './SpeakButton';
import Icon from './Icon';
import Pinyin from './Pinyin';
import ToneNeighbors from './ToneNeighbors';
import { StatusTag, type StudyStatus } from './TopicProgress';
import type { VocabularyEntry } from '../data/vocabulary';
import { vocabularyStore } from '../stores/vocabularyStore';
import { levelRank } from '../utils/wordOrder';
import type { KnownCharacter } from '../utils/wordCharacter';
import { charactersWithRadical, indexRowFor } from '../utils/characterSearch';
import { displayGloss, glossHead } from '@jiayou/chinese';
import { mainMeaning, otherMeanings } from '@jiayou/chinese';
import { leadSense } from '@jiayou/content';
import { canSpeak } from '../utils/speech';

interface CharacterDetailSheetProps {
  /** Without `hsk_level` the character is outside HSK: no badge, and its strokes load online rather than from a list. */
  character: KnownCharacter;
  /** The character's list is on this device. */
  installed: boolean;
  /** Undefined until the character is studied; a search result may be unseen. */
  status?: StudyStatus;
  busy?: boolean;
  error?: string;
  /** Asking first is the caller's job; this only reports the tap. Without it the sheet says where to download. */
  onDownload?: () => void;
  onStrokes?: () => void;
  /** Opens a word from the list of words with this character. */
  onOpenWord?: (wordId: string) => void;
  onOpenCharacter?: (character: string) => void;
  /** The word page the sheet opened from, left out of its word list. */
  currentWordId?: string;
  /** Draws "Ver trazos" as a quiet button, for a sheet over a session whose own action is Continuar. */
  quietStrokes?: boolean;
  /** Back to the sheet this one was opened from. */
  onBack?: () => void;
  /** Called after the drawer has slid away, however it was closed. */
  onClose: () => void;
}

/**
 * Up to six words of the checked lists that use the character: the character as a word of its own
 * first, then the lowest level.
 */
const wordsWith = (char: string, currentWordId?: string) =>
  vocabularyStore.getSelectedWords()
    .filter((word: VocabularyEntry) => word.characters.includes(char) && word.id !== currentWordId)
    .sort((a, b) =>
      Number(b.simplified === char) - Number(a.simplified === char) ||
      levelRank(a) - levelRank(b) ||
      a.simplified.length - b.simplified.length)
    .slice(0, 6);

/** One look at a character, the same from search, a word page or anywhere else. Nothing here changes what you study. */
const CharacterDetailSheet: Component<CharacterDetailSheetProps> = (props) => {
  const char = () => props.character;
  const [loadedStrokes, setLoadedStrokes] = createSignal(0);
  const words = createMemo(() => wordsWith(char().character, props.currentWordId));
  const headline = () => glossHead(mainMeaning(char()));
  const fold = (text: string) => text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim();
  /** The extra senses, minus any the headline already says. */
  const more = () => {
    const said = new Set(headline().split(/[;,]/).map(fold));
    const rest = [...displayGloss(mainMeaning(char())).split('; ').slice(1), ...otherMeanings(char()).split(' · ').map(displayGloss)];
    const out: string[] = [];
    for (const sense of rest) {
      // "raíz, origen, fuente" under the headline "origen" becomes "raíz, fuente".
      const parts = sense.split(/,\s*/).filter((part) => part && !said.has(fold(part)));
      parts.forEach((part) => said.add(fold(part)));
      if (parts.length) out.push(parts.join(', '));
    }
    return out.join(' · ');
  };
  let header: HTMLDivElement | undefined;
  let info: HTMLDivElement | undefined;
  /** Square side for the glyph: the info column's height, never more than 45% of the row. */
  const [glyphSize, setGlyphSize] = createSignal(112);
  onMount(() => {
    const fit = () => {
      if (!header || !info) return;
      setGlyphSize(Math.round(Math.max(112, Math.min(info.offsetHeight, header.clientWidth * 0.45))));
    };
    fit();
    const observer = new ResizeObserver(fit);
    if (header) observer.observe(header);
    if (info) observer.observe(info);
    onCleanup(() => observer.disconnect());
  });
  const strokes = () => char().stroke_count || loadedStrokes();
  /** Outside HSK there is no list to download, and the strokes come from the network fallback. */
  const strokesReady = () => props.installed || char().hsk_level === undefined;
  const radical = () => {
    const r = char().radical;
    if (!r || r === char().character) return undefined;
    const row = indexRowFor(r);
    return { char: r, pinyin: row?.pinyin, gloss: row ? glossHead(row.gloss) : undefined, siblings: charactersWithRadical(r, char().character, vocabularyStore.studiedLevels()).slice(0, 6) };
  };

  return (
    <Drawer
      aria-labelledby="character-detail-title"
      class="px-4"
      style={{ 'padding-bottom': 'max(env(safe-area-inset-bottom), 1.25rem)' }}
      onClose={() => props.onClose()}
      onBack={props.onBack}
    >

      {/* The glyph is as tall as everything beside it, so the sheet has no empty corner. */}
      <div ref={(element) => (header = element)} class="mt-1 flex items-center gap-4">
        <CharacterGlyph
          char={char().character}
          class="shrink-0"
          style={{ width: `${glyphSize()}px`, height: `${glyphSize()}px` }}
          animate
          onStrokeCount={setLoadedStrokes}
        />
        <div ref={(element) => (info = element)} class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <Pinyin text={char().pinyin} class="text-xl font-medium" />
            <Show when={canSpeak()}>
              <SpeakButton pinyin={char().pinyin} hanzi={char().character} />
            </Show>
          </div>
          <h2 id="character-detail-title" class="mt-0.5 font-sans text-[1.375rem] font-semibold leading-tight first-letter:uppercase">
            {headline()}
          </h2>
          <Show when={more()}>
            <p class="mt-1 text-sm leading-snug text-ink-soft first-letter:uppercase">{more()}</p>
          </Show>
          <Show when={props.status}>
            {(status) => <StatusTag status={status()} feminine={false} class="mt-2" />}
          </Show>
          <dl class="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
            <Show when={strokes() > 0}>
              <dt class="text-ink-soft">Trazos</dt>
              <dd class="tabular-nums">{strokes()}</dd>
            </Show>
            <Show when={char().traditional && char().traditional !== char().character}>
              <dt class="text-ink-soft">Tradicional</dt>
              <dd class="font-hanzi text-lg leading-none" lang="zh-TW">{char().traditional}</dd>
            </Show>
          </dl>
        </div>
      </div>

      {/* The radical is the part a learner can spot in other characters, so it gets its own card. */}
      <Show when={radical()}>
        {(r) => (
          <section class="tile mt-5 px-3 py-3" aria-label="Radical">
            <div class="flex items-center gap-3">
              <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-tile bg-jade-soft/60 font-hanzi text-[2rem] leading-none text-jade" lang="zh-CN">{r().char}</span>
              <span class="min-w-0 flex-1">
                <span class="eyebrow block">Radical</span>
                <span class="flex min-w-0 items-baseline gap-2">
                  <Show when={r().pinyin}>{(p) => <Pinyin text={p()} class="text-sm" />}</Show>
                  <Show when={r().gloss}>{(g) => <span class="min-w-0 truncate text-sm text-ink-soft">{g()}</span>}</Show>
                </span>
                <span class="block text-xs text-ink-faint">En verde dentro del carácter.</span>
              </span>
            </div>
            <Show when={r().siblings.length > 0}>
              <p class="mt-3 text-xs text-ink-soft">También lo llevan</p>
              <ul class="mt-1.5 flex flex-wrap gap-1.5">
                <For each={r().siblings}>{(row) => (
                  <li>
                    <button
                      type="button"
                      class="flex min-h-9 items-center gap-1.5 rounded-full border border-line/80 px-2.5 py-1 active:bg-ink/5 disabled:opacity-100"
                      disabled={!props.onOpenCharacter}
                      aria-label={`${row.character}, ${row.pinyin}, ${glossHead(row.gloss)}`}
                      onClick={() => props.onOpenCharacter?.(row.character)}
                    >
                      <span class="font-hanzi text-lg leading-none" lang="zh-CN">{row.character}</span>
                      <span class="max-w-[5.5rem] truncate text-xs text-ink-soft">{glossHead(row.gloss)}</span>
                    </button>
                  </li>
                )}</For>
              </ul>
            </Show>
          </section>
        )}
      </Show>

      <Show when={words().length > 0 || char().example}>
        <h3 class="eyebrow mt-5">Palabras con <span class="font-hanzi text-sm normal-case tracking-normal" lang="zh-CN">{char().character}</span></h3>
        <ul class="tile mt-2 divide-y divide-line/70 px-3">
          <Show when={words().length === 0 ? char().example : undefined}>
            {(example) => (
              <li class="flex items-baseline gap-3 py-2">
                <span class="font-hanzi text-xl" lang="zh-CN">{example().word}</span>
                <Pinyin word text={example().pinyin} class="shrink-0 text-sm" />
                <span class="min-w-0 flex-1 truncate text-right text-sm text-ink-soft first-letter:uppercase">{example().es}</span>
              </li>
            )}
          </Show>
          <For each={words()}>
            {(word) => {
              const row = (
                <>
                  <span class="font-hanzi text-xl" lang="zh-CN">{word.simplified}</span>
                  <Pinyin word text={word.pinyin} class="shrink-0 text-sm" />
                  <span class="min-w-0 flex-1 truncate text-right text-sm text-ink-soft first-letter:uppercase">{leadSense(word.senses)}</span>
                </>
              );
              return (
                <li>
                  <Show when={props.onOpenWord} fallback={<div class="flex items-baseline gap-3 py-2">{row}</div>}>
                    <button type="button" class="flex min-h-11 w-full items-baseline gap-3 py-2 text-left" onClick={() => props.onOpenWord?.(word.id)}>
                      {row}
                      <Icon name="next" size={14} class="shrink-0 self-center text-ink-faint" />
                    </button>
                  </Show>
                </li>
              );
            }}
          </For>
        </ul>
      </Show>

      <ToneNeighbors character={char().character} pinyin={char().pinyin} onOpenWord={props.onOpenWord} onOpenCharacter={props.onOpenCharacter} />

      <Show when={props.error}>
        <p role="alert" class="mt-3 text-sm text-seal">{props.error}</p>
      </Show>

      <Show
        when={strokesReady()}
        fallback={
          <Show
            when={props.onDownload}
            fallback={<p class="mt-5 text-center text-sm text-ink-soft">Sus trazos se descargarán la próxima vez que abras la app con conexión.</p>}
          >
            <button type="button" class="btn-quiet mt-5 h-12 w-full text-sm" disabled={props.busy} onClick={() => props.onDownload?.()}>
              {props.busy ? 'Descargando…' : `Descargar HSK ${char().hsk_level} para practicar sus trazos`}
            </button>
          </Show>
        }
      >
        <Show when={props.onStrokes}>
          <button type="button" class={`${props.quietStrokes ? 'btn-quiet' : 'btn-ink'} mt-5 h-12 w-full text-sm`} onClick={() => props.onStrokes?.()}>
            <Icon name="brush" size={16} />
            Ver trazos y escribirlo
          </button>
        </Show>
      </Show>
    </Drawer>
  );
};

export default CharacterDetailSheet;
