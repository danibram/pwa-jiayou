import { Component, createMemo, For, onCleanup, Show } from 'solid-js';
import TopBar from '../components/TopBar';
import Pinyin from '../components/Pinyin';
import RiceGrid from '../components/RiceGrid';
import { LearningCard, LearningSessionShell } from '../components/learning';
import SessionSummary, { type SummaryItemResult } from '../components/learning/summary/SessionSummary';
import { useLearningStore } from '../components/LearningStoreContext';
import { catalogWords, findWord, type VocabularyEntry } from '../data/vocabulary';
import { leadSense } from '../data/wordSenses';
import { characterExample, characterGloss } from '../utils/wordParts';
import { levelRank } from '../utils/wordOrder';
import { stopSpeech } from '../utils/speech';
import { ALL_ID, MORE_ID, sessionTarget } from '../utils/wordSessions';
import { dueByEndOfTomorrow } from '../utils/progressSummary';
import { createLearningSession } from '../stores/learningSessionStore';
import type { ItemId } from '../domain/learning/types';

interface Props {
  onBack: () => void;
  onStrokes: (char: string) => void;
  /** Continue the stored session when it matches. False builds a new one; answers already given stay. */
  resume: boolean;
  practiceId?: string;
  /** Starts another word session, for example `__more__` from an empty review. Undefined is Hoy. */
  onPractice?: (practiceId?: string) => void;
}

const WORD_PREFIX = 'word-meaning:';

/** The catalog entry behind a word item, for what the card does not store: tiles, related words. */
const entryOf = (itemId: ItemId): VocabularyEntry | undefined =>
  itemId.startsWith(WORD_PREFIX) ? findWord(itemId.slice(WORD_PREFIX.length)) : undefined;

/** Another HSK word that shares a character, as a usage example. Not one of the word's own parts (好 in 你好): the tiles already show those. */
const relatedWord = (entry: VocabularyEntry) =>
  catalogWords().find((other) =>
    other.id !== entry.id &&
    other.simplified !== entry.simplified &&
    !entry.simplified.includes(other.simplified) &&
    other.level <= Math.max(levelRank(entry), 2) &&
    other.characters.some((char) => entry.characters.includes(char)));

/** What the page adds under an answer: the traditional form, a word that shares a character, and the stroke tiles. */
const WordDetails: Component<{ entry: VocabularyEntry; onStrokes: (char: string) => void }> = (props) => {
  const related = () => relatedWord(props.entry);
  const example = () => (!related() && props.entry.characters.length === 1 ? characterExample(props.entry.simplified) : undefined);
  const count = () => props.entry.characters.length;
  return (
    <>
      <Show when={props.entry.traditional !== props.entry.simplified}>
        <p class="mt-2 text-sm text-ink-soft">Tradicional: <span lang="zh-TW" class="font-hanzi">{props.entry.traditional}</span></p>
      </Show>
      <Show when={related()}>{(other) => (
        <div class="mt-3 w-full max-w-[19rem] rounded-xl bg-paper/60 px-4 py-2 text-left">
          <p class="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-ink-soft">También en</p>
          <p class="mt-1 flex flex-wrap items-baseline gap-x-2 text-ink">
            <span class="font-hanzi text-[1.5rem] leading-none" lang="zh-CN">{other().simplified}</span>
            <Pinyin word text={other().pinyin} class="text-base font-medium whitespace-nowrap" />
          </p>
          <p class="mt-0.5 text-sm text-ink-soft">{leadSense(other().senses)}</p>
        </div>
      )}</Show>
      {/* A one-character word with no other word to show it in (的, 了) gets its curated example. */}
      <Show when={example()}>{(shown) => (
        <div class="mt-3 w-full max-w-[19rem] rounded-xl bg-paper/60 px-4 py-2 text-left">
          <p class="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-ink-soft">Ejemplo</p>
          <p class="mt-1 flex flex-wrap items-baseline gap-x-2 text-ink">
            <span class="font-hanzi text-[1.5rem] leading-none" lang="zh-CN">{shown().word}</span>
            <Pinyin word text={shown().pinyin} class="text-base font-medium whitespace-nowrap" />
          </p>
          <p class="mt-0.5 text-sm text-ink-soft">{shown().es}</p>
        </div>
      )}</Show>
      <p class="mt-3 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-ink-soft">{count() > 1 ? 'Cómo se escribe · toca un carácter' : 'Cómo se escribe'}</p>
      <div class="mt-1.5 flex flex-wrap justify-center gap-2">
        <For each={props.entry.characters}>{(char, index) => {
          const gloss = () => (count() > 1 ? characterGloss(char) : undefined);
          const repeated = () => props.entry.characters.filter((part) => part === char).length > 1;
          return (
            <button type="button" class="tile min-h-11 min-w-11 max-w-[8rem] px-3 py-1" onClick={() => props.onStrokes(char)} aria-label={`Practicar trazos de ${char}${gloss() ? `, ${gloss()}` : ''}${repeated() ? `, posición ${index() + 1} de ${count()}` : ''}`}>
              <span class="block font-hanzi text-xl" lang="zh-CN">{char}</span>
              <Show when={gloss()}><span class="block truncate font-sans text-xs text-ink-soft">{gloss()}</span></Show>
              <Show when={repeated()}><span class="block font-sans text-xs text-ink-soft">{index() + 1} de {count()}</span></Show>
            </button>
          );
        }}</For>
      </div>
    </>
  );
};

/**
 * A word session: Hoy, Más palabras, a topic, Flojos, Repasar todo or one word. The learning session
 * controller plans, evaluates and saves; this page frames it and adds the catalog details. Leaving
 * keeps every confirmed answer, so the back button just leaves.
 */
const VocabularyReview: Component<Props> = (props) => {
  const store = useLearningStore();
  const target = sessionTarget(props.practiceId);
  const session = createLearningSession({ mode: target.mode, scope: target.scope, store, resume: props.resume });
  onCleanup(stopSpeech);

  const currentEntry = createMemo(() => {
    const selection = session.view.selection;
    return selection ? entryOf(selection.itemId) : undefined;
  });
  const note = () => {
    if (target.mode === 'topic') return target.heading;
    const card = session.card();
    return card?.intent === 'teach' ? 'Palabra nueva' : undefined;
  };

  const exitLabel = () => (target.wordId ? 'Volver a la palabra' : target.topicIds ? 'Volver al tema' : 'Volver al inicio');
  const newPerDay = () => store.settings().newPerDay['word-meaning'];

  /** Nothing to plan: the plan that would start now says why. */
  const empty = () => session.view.state === 'finished' && session.view.total === 0;
  const emptyPlan = createMemo(() => (empty() ? store.previewPlan(target.mode, target.scope) : null));
  const leftOut = (reason: 'new-budget-day' | 'tomorrow-load' | 'pending-elsewhere' | 'not-in-pool' | 'content-unavailable') =>
    (emptyPlan()?.leftOutCounts[reason] ?? 0) > 0;
  const many = !!target.topicIds && target.topicIds.length > 1;
  const emptyTitle = () => {
    if (leftOut('not-in-pool')) return 'Esta palabra no está en tus niveles';
    if (leftOut('new-budget-day')) return `Ya has aprendido ${newPerDay()} palabras nuevas hoy`;
    if (leftOut('pending-elsewhere')) return 'Primero, los repasos de hoy';
    if (leftOut('tomorrow-load')) return 'Mañana ya tienes muchos repasos';
    if (target.mode === 'topic') return `Nada que estudiar en ${many ? 'estos temas' : 'este tema'}`;
    if (target.mode === 'review-all') return 'Aún no hay palabras que repasar';
    if (target.mode === 'weak') return 'No tienes palabras flojas';
    if (target.mode === 'more-words') return 'No quedan palabras nuevas';
    return 'Todo al día';
  };
  const emptyBody = () => {
    if (leftOut('not-in-pool')) return 'Marca su nivel en Inicio para estudiarla.';
    if (leftOut('new-budget-day')) {
      return target.topicIds
        ? (many ? 'Estos temas te esperan mañana.' : 'Este tema te espera mañana.')
        : 'Más palabras nuevas hoy se olvidan antes de mañana. Repasa las que ya conoces.';
    }
    if (leftOut('pending-elsewhere')) return 'Tienes palabras pendientes en Hoy. Repásalas y después sigue aquí con las nuevas.';
    if (leftOut('tomorrow-load')) return 'Las palabras nuevas vuelven cuando bajen los repasos.';
    if (leftOut('content-unavailable')) return 'Algunas palabras todavía no están descargadas en este dispositivo.';
    if (target.mode === 'topic') return `Marca otro nivel en Inicio para traer más palabras de ${many ? 'estos temas' : 'este tema'}.`;
    if (target.mode === 'review-all') return 'El repaso solo pregunta las palabras que ya has visto. Empieza aprendiendo unas pocas.';
    if (target.mode === 'weak') return 'Ninguna palabra que hayas fallado sigue floja.';
    if (target.mode === 'more-words') return 'Has visto todas las palabras de los niveles marcados. Marca otro nivel en Inicio.';
    return 'No te quedan palabras para repasar ahora.';
  };
  /** The empty state's way forward: Hoy when it has work, learning when there is nothing to review, review when the cap is spent. */
  const emptyAction = (): { label: string; id?: string } | undefined => {
    if (!props.onPractice) return undefined;
    if (leftOut('pending-elsewhere')) return { label: 'Ir a Hoy' };
    if (target.mode === 'more-words' && leftOut('new-budget-day') && (store.previewPlan('review-all')?.cards.length ?? 0) > 0) return { label: 'Repasar palabras', id: ALL_ID };
    if (target.mode === 'review-all' && (store.previewPlan('more-words')?.counts.newItems ?? 0) > 0) return { label: 'Aprender palabras nuevas', id: MORE_ID };
    return undefined;
  };

  const summaryItems = (): SummaryItemResult[] =>
    session.summary().items.map((item) => {
      const entry = entryOf(item.itemId);
      return { itemId: item.itemId, label: entry?.simplified ?? item.content.contentId, pinyin: entry?.pinyin, results: item.results };
    });
  const newWords = () => {
    const budget = newPerDay();
    return { taught: Math.max(0, budget - store.newLeftToday('other')), budget };
  };

  return (
    <div class="screen">
      <div class="animate-rise">
        <TopBar title={target.heading} onBack={props.onBack} backLabel="Volver" />
      </div>
      <Show when={!empty()} fallback={
        <div class="m-auto max-w-[18rem] text-center animate-rise [animation-delay:60ms]">
          <RiceGrid class="mx-auto h-16 w-16 text-ink-faint" />
          <p class="mt-3 font-display text-2xl font-semibold">{emptyTitle()}</p>
          <p class="mt-2 text-sm text-ink-soft">{emptyBody()}</p>
          <Show when={emptyAction()} fallback={<button type="button" class="btn-ink mt-6 h-12 px-8" onClick={() => props.onBack()}>{exitLabel()}</button>}>
            {(action) => <>
              <button type="button" class="btn-ink mt-6 h-12 w-full px-8" onClick={() => props.onPractice?.(action().id)}>{action().label}</button>
              <button type="button" class="btn-quiet mt-2 h-11 w-full px-6 text-sm" onClick={() => props.onBack()}>{exitLabel()}</button>
            </>}
          </Show>
        </div>
      }>
        <LearningSessionShell
          view={session.view}
          actions={session.actions}
          note={note()}
          finished={
            <SessionSummary
              open
              recorded={session.summary().recorded}
              items={summaryItems()}
              dueTomorrow={dueByEndOfTomorrow(store.runtime().pool().map((item) => item.itemId), store)}
              nextDueAt={session.summary().nextReviews[0]?.dueAt ?? null}
              newWords={newWords()}
              now={store.now()}
              onClose={() => props.onBack()}
              exitLabel={exitLabel()}
            />
          }
        >
          <LearningCard
            view={session.view}
            actions={session.actions}
            details={<Show when={currentEntry()}>{(entry) => <WordDetails entry={entry()} onStrokes={props.onStrokes} />}</Show>}
          />
        </LearningSessionShell>
      </Show>
    </div>
  );
};

export default VocabularyReview;
