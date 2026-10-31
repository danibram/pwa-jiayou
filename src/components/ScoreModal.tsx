import { Component, For, Show } from 'solid-js';
import { HSKCharacter } from '../types';
import Icon from './Icon';
import Pinyin from './Pinyin';

export interface SessionSummary {
  again: number;
  hard: number;
  good: number;
  total: number;
  percentage: number;
  streak: number;
}

interface ScoreModalProps {
  /** Shown while set. */
  summary: SessionSummary | null;
  missed: HSKCharacter[];
  /** Characters graded this session, in order. */
  practised: HSKCharacter[];
  onReviewMissed: () => void;
  onOpenStrokes: (char: string) => void;
  onGoHome: () => void;
  /** Label for the button that leaves the summary. */
  exitLabel?: string;
}

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const ScoreModal: Component<ScoreModalProps> = (props) => {
  const result = () => props.summary!;
  const lesson = () => result().total === 0;
  const verdict = () => {
    if (lesson()) {
      const n = props.practised.length;
      return {
        title: '明天见',
        pinyin: 'míng tiān jiàn',
        subtitle: `Has visto ${n} ${n === 1 ? 'carácter' : 'caracteres'}. Mañana te los pregunto.`,
      };
    }
    const p = result().percentage;
    if (props.missed.length === 0)
      return {
        title: '太棒了',
        pinyin: 'tài bàng le',
        subtitle: 'Todo acertado. Vuelve mañana para afianzarlos.',
      };
    if (p >= 70)
      return { title: '很好', pinyin: 'hěn hǎo', subtitle: 'Muy bien. Repasa los que fallaste.' };
    if (p >= 50)
      return {
        title: '加油',
        pinyin: 'jiā yóu',
        subtitle: 'Vas por buen camino. Repasa los fallos.',
      };
    return {
      title: '慢慢来',
      pinyin: 'màn màn lái',
      subtitle: 'Poco a poco. Repite los que fallaste.',
    };
  };

  return (
    <Show when={props.summary}>
      <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/30 backdrop-blur-[2px] animate-fade">
        <div
          class="w-full max-w-md bg-surface rounded-t-card sm:rounded-card border border-line shadow-card px-6 pt-7 animate-rise max-h-[92dvh] overflow-y-auto"
          style={{ 'padding-bottom': 'max(env(safe-area-inset-bottom), 1.5rem)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="score-title"
        >
          <div class="flex items-center gap-5">
            <div class="relative h-32 w-32 flex-shrink-0">
              <svg viewBox="0 0 120 120" class="h-full w-full -rotate-90">
                <circle
                  cx="60"
                  cy="60"
                  r={RADIUS}
                  fill="none"
                  stroke="rgb(var(--ink) / 0.08)"
                  stroke-width="9"
                />
                <circle
                  cx="60"
                  cy="60"
                  r={RADIUS}
                  fill="none"
                  stroke="rgb(var(--jade))"
                  stroke-width="9"
                  stroke-linecap="round"
                  stroke-dasharray={`${CIRCUMFERENCE}`}
                  stroke-dashoffset={CIRCUMFERENCE * (1 - result().percentage / 100)}
                  style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1)' }}
                />
              </svg>
              <div class="absolute inset-0 flex flex-col items-center justify-center">
                <span class="font-display text-[2.125rem] font-semibold leading-none tabular-nums">
                  <Show
                    when={!lesson()}
                    fallback={<span class="font-hanzi text-4xl">{props.practised.length}</span>}
                  >
                    {result().percentage}
                    <span class="text-lg text-ink-faint">%</span>
                  </Show>
                </span>
              </div>
            </div>
            <div class="min-w-0">
              <h2 id="score-title" class="font-hanzi text-4xl font-semibold" lang="zh-CN">
                {verdict().title}
              </h2>
              <Pinyin text={verdict().pinyin} class="block text-sm font-medium" />
              <p class="text-sm text-ink-soft mt-1 leading-snug">{verdict().subtitle}</p>
              <div
                class="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-sm font-semibold tabular-nums"
                classList={{ hidden: lesson() }}
              >
                <span
                  classList={{ 'text-jade': result().good > 0, 'text-ink-faint': !result().good }}
                >
                  {result().good} bien
                </span>
                <span
                  classList={{
                    'text-ink-soft': result().hard > 0,
                    'text-ink-faint': !result().hard,
                  }}
                >
                  {result().hard} difícil
                </span>
                <span
                  classList={{ 'text-seal': result().again > 0, 'text-ink-faint': !result().again }}
                >
                  {result().again} otra vez
                </span>
              </div>
              <Show when={result().streak > 0}>
                <div class="mt-2 text-xs text-ink-faint">
                  Racha:{' '}
                  <span class="font-semibold text-gold">
                    {result().streak} {result().streak === 1 ? 'día' : 'días'}
                  </span>
                </div>
              </Show>
            </div>
          </div>

          <Show when={props.missed.length > 0}>
            <div class="mt-6">
              <div class="eyebrow mb-2">Para repasar · toca para practicar los trazos</div>
              <div class="flex flex-wrap gap-2">
                <For each={props.missed}>
                  {(char) => (
                    <button
                      onClick={() => props.onOpenStrokes(char.character)}
                      class="tile h-14 min-w-[3.5rem] px-2 flex flex-col items-center justify-center hover:border-seal/40 transition"
                      aria-label={`${char.character}, ${char.pinyin}`}
                    >
                      <span class="font-hanzi text-2xl leading-none" lang="zh-CN">
                        {char.character}
                      </span>
                      <span class="text-[0.625rem] text-ink-faint mt-1">{char.pinyin}</span>
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <div class="mt-7 space-y-2.5">
            <Show
              when={props.missed.length > 0}
              fallback={
                <Show when={props.practised.length > 0}>
                  <button
                    onClick={() => props.onOpenStrokes(props.practised[0].character)}
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
    </Show>
  );
};

export default ScoreModal;
