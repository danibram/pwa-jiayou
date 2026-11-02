import { Component, For, Show } from 'solid-js';
import type { Grade } from '../stores/progressStore';
import Icon from './Icon';
import Pinyin from './Pinyin';
import { GRADE_LABEL } from './GradeButtons';
import { createDialogFocus } from '../utils/dialog';
import { agree, countNoun, nounKind, pronoun } from '../utils/countNoun';

export interface SessionSummary {
  again: number;
  hard: number;
  good: number;
  total: number;
  percentage: number;
  streak: number;
}

/** A character or a word, as the summary shows it. */
export interface SummaryItem {
  character: string;
  pinyin: string;
}

interface ScoreModalProps {
  /** Shown while set. Counts are items by their first attempt, not grade events. */
  summary: SessionSummary | null;
  missed: SummaryItem[];
  /** Items met this session, in order. */
  practised: SummaryItem[];
  /** Singular and plural for what the session holds. Defaults to characters. */
  noun?: { one: string; many: string };
  /** When the items come back, for example "Los fallos vuelven hoy". */
  returnNote?: string;
  onReviewMissed: () => void;
  /** Opens stroke practice. Without it the chips are static. */
  onOpenStrokes?: (char: string) => void;
  onGoHome: () => void;
  /** Label for the button that leaves the summary. */
  exitLabel?: string;
  /** Weak items before and after a weak session, for example 8 then 3, and how many this session cleared. */
  weakChange?: { before: number; after: number; recovered?: number };
  /** Weak items in the learner's levels after this session: the number Home shows, which can differ from the misses. */
  weakNow?: number;
}

/**
 * When the misses come back. Misses still due come back today; a miss answered right on the retry
 * already has its next review tomorrow. Everything answered right waits longer.
 */
export const returnNoteText = (missed: number, stillDue: number, one: string): string => {
  const kind = nounKind(one);
  const due = Math.min(stillDue, missed);
  const passed = missed - due;
  if (missed === 0) return 'A partir de mañana, según lo bien que te lo sabías.';
  const parts: string[] = [];
  if (due > 0) parts.push(`${countNoun(due, kind)} ${agree(due, kind, 'fallad')} ${due === 1 ? 'vuelve' : 'vuelven'} hoy.`);
  if (passed > 0) parts.push(`${countNoun(passed, kind)} que fallaste y luego acertaste ${passed === 1 ? 'vuelve' : 'vuelven'} mañana.`);
  return parts.join(' ');
};

const ROWS: { grade: Grade; bar: string; text: string }[] = [
  { grade: 'good', bar: 'bg-jade', text: 'text-jade' },
  { grade: 'hard', bar: 'bg-ink/40', text: 'text-ink' },
  { grade: 'again', bar: 'bg-seal', text: 'text-seal' },
];

const ScoreModal: Component<ScoreModalProps> = (props) => {
  let dialog: HTMLDivElement | undefined;
  createDialogFocus(() => props.summary !== null, () => dialog, () => props.onGoHome());
  const kind = () => nounKind(props.noun?.one ?? 'carácter');
  /** "los" or "las", for sentences about the items in general. */
  const them = () => pronoun(2, kind());
  const canOpen = (item: SummaryItem) => !!props.onOpenStrokes && Array.from(item.character).length === 1;
  return (
    <Show when={props.summary}>
      {(summary) => {
  const lesson = () => summary().total === 0;
  const verdict = () => {
    if (lesson()) {
      const n = props.practised.length;
      return {
        title: '明天见',
        pinyin: 'míng tiān jiàn',
        subtitle: `Has visto ${countNoun(n, kind())}. Mañana te ${pronoun(n, kind())} pregunto.`,
      };
    }
    const p = summary().percentage;
    const forgot = summary().again > 0;
    // A weak session is judged by what it cleared, not by first tries: these words were missed before.
    const weak = props.weakChange;
    if (weak) {
      const cleared = weak.before - weak.after;
      const title = weak.after === 0 ? { title: '太棒了', pinyin: 'tài bàng le' } : cleared > 0 ? { title: '不错', pinyin: 'bú cuò' } : { title: '加油', pinyin: 'jiā yóu' };
      const recovered = weak.recovered ?? cleared;
      const fact = `${recovered} ${agree(recovered, kind(), 'recuperad')}. Flojos: ${weak.before} → ${weak.after}.`;
      return {
        ...title,
        subtitle: weak.after === 0 ? `${fact} Ya no te queda ninguno.` : cleared > 0 ? `${fact} ${them() === 'las' ? 'Las' : 'Los'} que quedan vuelven pronto.` : `${fact} Un Bien aquí lo saca de la lista.`,
      };
    }
    if (p === 100) return { title: '太棒了', pinyin: 'tài bàng le', subtitle: 'Todo a la primera. Vuelve mañana para afianzarlo.' };
    if (p >= 85) return { title: '很好', pinyin: 'hěn hǎo', subtitle: forgot ? 'Muy bien. Repasa lo que se te escapó.' : 'Muy bien. Ningún olvido, solo algún Casi.' };
    if (p >= 60) return { title: '不错', pinyin: 'bú cuò', subtitle: forgot ? 'Bien. Los fallos merecen otra vuelta.' : 'Bien. Lo que salió con Casi volverá pronto.' };
    return { title: '加油', pinyin: 'jiā yóu', subtitle: forgot ? `Sigue así. Repite ${them()} que fallaste.` : 'Sigue así. Mañana costará menos.' };
  };

  return (
      <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-paper/90 backdrop-blur-md animate-fade">
        <div
          class="w-full max-w-md bg-surface rounded-t-card sm:rounded-card border border-line shadow-card px-6 pt-7 animate-rise max-h-[92dvh] overflow-y-auto"
          style={{ 'padding-bottom': 'max(env(safe-area-inset-bottom), 1.5rem)' }}
          role="dialog"
          ref={dialog}
          tabIndex={-1}
          aria-modal="true"
          aria-labelledby="score-title"
        >
          <div class="text-center">
            <h2 id="score-title" class="font-hanzi text-5xl font-semibold leading-none" lang="zh-CN">
              {verdict().title}
            </h2>
            <Pinyin text={verdict().pinyin} class="mt-2 block text-sm font-medium" />
            <p class="mx-auto mt-2 max-w-[18rem] text-[0.9375rem] leading-snug text-ink-soft">{verdict().subtitle}</p>
          </div>

          <Show when={!lesson()}>
            <div class="mt-6">
              <div class="eyebrow mb-2 text-center">
                {countNoun(summary().total, kind())} en esta sesión
              </div>
              <div class="flex h-2 overflow-hidden rounded-full bg-line" aria-hidden="true">
                <For each={ROWS}>
                  {(row) => (
                    <div
                      class={`h-full ${row.bar}`}
                      style={{ width: `${(summary()[row.grade] / summary().total) * 100}%` }}
                    />
                  )}
                </For>
              </div>
              <dl class="mt-3 grid grid-cols-3 text-center">
                <For each={ROWS}>
                  {(row) => (
                    <div>
                      <dd
                        class="font-display text-2xl font-semibold tabular-nums leading-none"
                        classList={{ [row.text]: summary()[row.grade] > 0, 'text-ink-faint': summary()[row.grade] === 0 }}
                      >
                        {summary()[row.grade]}
                      </dd>
                      <dt class="mt-1 text-xs text-ink-soft">{GRADE_LABEL[row.grade]}</dt>
                    </div>
                  )}
                </For>
              </dl>
            </div>
          </Show>

          {/* One fact per row, so none runs into the next. */}
          <div class="mt-5 divide-y divide-line/70 border-y border-line/70 text-sm">
            <Show when={props.returnNote}>
              <div class="flex items-center justify-between gap-3 py-2.5">
                <span class="shrink-0 text-ink-soft">Próximo repaso</span>
                <span class="text-right text-ink">{props.returnNote}</span>
              </div>
            </Show>
            <Show when={props.weakNow !== undefined && !props.weakChange && !lesson()}>
              <div class="flex items-center justify-between gap-3 py-2.5 tabular-nums">
                <span class="text-ink-soft">Flojos en tus niveles</span>
                <span class="font-semibold text-ink">{props.weakNow}</span>
              </div>
            </Show>
            <Show when={summary().streak > 0}>
              <div class="flex items-center justify-between gap-3 py-2.5 tabular-nums">
                <span class="text-ink-soft">Racha</span>
                <span class="font-semibold text-ink">
                  {summary().streak} {summary().streak === 1 ? 'día' : 'días'}
                </span>
              </div>
            </Show>
          </div>

          <Show when={props.missed.length > 0}>
            <div class="mt-6">
              <div class="eyebrow mb-2">
                {props.missed.some(canOpen) ? 'Fallos de esta sesión · toca uno para escribirlo' : 'Fallos de esta sesión'}
              </div>
              <div class="flex flex-wrap gap-2">
                <For each={props.missed}>
                  {(item) => (
                    <Show
                      when={canOpen(item)}
                      fallback={
                        // Not a button, so it carries no tile lift or border.
                        <div class="flex h-14 min-w-[3.5rem] flex-col items-center justify-center rounded-tile bg-ink/[0.04] px-2.5" aria-label={`${item.character}, ${item.pinyin}`}>
                          <span class="font-hanzi text-2xl leading-none" lang="zh-CN">{item.character}</span>
                          <Pinyin word text={item.pinyin} class="mt-1 text-[0.6875rem]" />
                        </div>
                      }
                    >
                      <button
                        onClick={() => props.onOpenStrokes?.(item.character)}
                        class="tile flex h-14 min-w-[3.5rem] flex-col items-center justify-center px-2.5 transition hover:border-seal/40"
                        aria-label={`${item.character}, ${item.pinyin}`}
                      >
                        <span class="font-hanzi text-2xl leading-none" lang="zh-CN">{item.character}</span>
                        <Pinyin word text={item.pinyin} class="mt-1 text-[0.6875rem]" />
                      </button>
                    </Show>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <div class="mt-7 space-y-2.5">
            <Show
              when={props.missed.length > 0}
              fallback={
                <Show when={props.practised.length > 0 && canOpen(props.practised[0])}>
                  <button
                    onClick={() => props.onOpenStrokes?.(props.practised[0].character)}
                    class="btn-ink h-14 w-full text-[0.9375rem]"
                  >
                    <Icon name="brush" size={18} />
                    Practicar su escritura
                  </button>
                </Show>
              }
            >
              <button onClick={props.onReviewMissed} class="btn-ink h-14 w-full text-[0.9375rem]">
                <Icon name="replay" size={18} />
                {props.missed.length === 1
                  ? 'Repasar 1 fallo'
                  : `Repasar los ${props.missed.length} fallos`}
              </button>
            </Show>
            <button onClick={props.onGoHome} class="btn-quiet h-12 w-full text-sm">
              {props.exitLabel ?? 'Volver al inicio'}
            </button>
          </div>
        </div>
      </div>
  );
      }}
    </Show>
  );
};

export default ScoreModal;
