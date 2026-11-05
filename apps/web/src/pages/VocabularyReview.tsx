import { Component, createMemo, createSignal, For, onCleanup, Show } from 'solid-js';
import TopBar from '../components/TopBar';
import Pinyin from '../components/Pinyin';
import RiceGrid from '../components/RiceGrid';
import CharacterDetailSheet from '../components/CharacterDetailSheet';
import WordExample from '../components/WordExample';
import WordPeekSheet from '../components/WordPeekSheet';
import WordRef from '../components/WordRef';
import WordRelations from '../components/WordRelations';
import WordSenses from '../components/WordSenses';
import type { StudyStatus } from '../components/TopicProgress';
import { characterStore } from '../stores/characterStore';
import { characterOrWordStub } from '../utils/wordCharacter';
import { characterItemId } from '@jiayou/learning/items';
import { studyStatusOf } from '@jiayou/learning/progress';
import { LearningCard, LearningSessionShell } from '../components/learning';
import SessionSummary, { type SummaryItemResult } from '../components/learning/summary/SessionSummary';
import { useLearningStore } from '../components/LearningStoreContext';
import { catalogWords, findWord, type VocabularyEntry } from '../data/vocabulary';
import { leadSense } from '@jiayou/content';
import { characterExample, characterGloss } from '../utils/wordParts';
import { levelRank } from '../utils/wordOrder';
import { stopSpeech } from '../utils/speech';
import { ALL_ID, MORE_ID, sessionTarget } from '../utils/wordSessions';
import { createLearningSession } from '../stores/learningSessionStore';
import { vocabularyStore } from '../stores/vocabularyStore';
import type { ItemId } from '@jiayou/learning/types';
import { wordIdOf } from '@jiayou/learning/items';

interface Props {
  onBack: () => void;
  onStrokes: (char: string) => void;
  /** Continue the stored session when it matches. False builds a new one; answers already given stay. */
  resume: boolean;
  practiceId?: string;
  /** Starts another word session, for example `__more__` from an empty review. Undefined is Hoy. */
  onPractice?: (practiceId?: string) => void;
}

/** The catalog entry behind a word item, for what the card does not store: tiles, related words. */
const entryOf = (itemId: ItemId): VocabularyEntry | undefined => {
  const wordId = wordIdOf(itemId);
  return wordId === null ? undefined : findWord(wordId);
};

/** Another HSK word that shares a character, as a usage example. Not one of the word's own parts (好 in 你好): the tiles already show those. */
const relatedWord = (entry: VocabularyEntry) =>
  catalogWords().find((other) =>
    other.id !== entry.id &&
    other.simplified !== entry.simplified &&
    !entry.simplified.includes(other.simplified) &&
    other.level <= Math.max(levelRank(entry), 2) &&
    other.characters.some((char) => entry.characters.includes(char)));

/** What the page adds under an answer: every other use, a sentence, the characters, close words and a word sharing a character. Everything opens in place. */
const WordDetails: Component<{ entry: VocabularyEntry; onCharacter: (char: string) => void; onWord: (id: string) => void }> = (props) => {
  const related = () => relatedWord(props.entry);
  const example = () => (!related() && props.entry.characters.length === 1 ? characterExample(props.entry.simplified) : undefined);
  const count = () => props.entry.characters.length;
  return (
    <div class="mx-auto w-full max-w-[34rem] pt-2 text-left" data-testid="word-details">
      <Show when={props.entry.traditional !== props.entry.simplified}>
        <p class="mb-3 text-center text-xs text-ink-faint">Tradicional <span lang="zh-TW" class="font-hanzi text-base text-ink-soft">{props.entry.traditional}</span></p>
      </Show>
      {/* The whole meaning first: every use by part of speech, with how it is used. */}
      <WordSenses word={props.entry} compact heading="Significado" class="border-t border-line pt-4" />
      <WordExample word={props.entry} onCharacter={props.onCharacter} class="mt-4 border-t border-line pt-4" />
      <section class="mt-4 border-t border-line pt-4" aria-label="Caracteres">
        <h3 class="eyebrow">{count() > 1 ? 'Sus caracteres' : 'El carácter'}</h3>
        <div class="mt-2 grid gap-2" style={{ 'grid-template-columns': `repeat(${Math.min(count(), 4)}, minmax(0, 1fr))` }}>
          <For each={props.entry.characters}>{(char, index) => {
            const gloss = () => characterGloss(char);
            const repeated = () => props.entry.characters.filter((part) => part === char).length > 1;
            return (
              <button
                type="button"
                class="tile flex min-h-24 min-w-0 flex-col items-center justify-center gap-1 px-2 py-3 transition-transform active:scale-[0.97]"
                onClick={() => props.onCharacter(char)}
                aria-label={`Ver el carácter ${char}${gloss() ? `, ${gloss()}` : ''}${repeated() ? `, posición ${index() + 1} de ${count()}` : ''}`}
              >
                <span class="block font-hanzi text-[2.75rem] leading-none" lang="zh-CN">{char}</span>
                <Show when={gloss()}><span class="block max-w-full truncate text-sm text-ink-soft">{gloss()}</span></Show>
              </button>
            );
          }}</For>
        </div>
      </section>
      <WordRelations word={props.entry} onOpenWord={props.onWord} />
      <Show when={related()}>{(other) => (
        <section class="mt-4 border-t border-line pt-4" aria-label="Aparece en">
          <h3 class="eyebrow">Aparece en</h3>
          <div class="mt-2">
            <WordRef row hanzi={other().simplified} pinyin={other().pinyin} gloss={leadSense(other().senses)} focus={props.entry.simplified} onOpen={() => props.onWord(other().id)} />
          </div>
        </section>
      )}</Show>
      {/* A one-character word with no other word to show it in (的, 了) gets its curated example. */}
      <Show when={example()}>{(shown) => (
        <section class="mt-4 border-t border-line pt-4" aria-label="Ejemplo">
          <h3 class="eyebrow">Ejemplo</h3>
          <p class="mt-1 flex flex-wrap items-baseline gap-x-2 text-ink">
            <span class="font-hanzi text-[1.5rem] leading-none" lang="zh-CN">{shown().word}</span>
            <Pinyin word text={shown().pinyin} class="text-base font-medium whitespace-nowrap" />
          </p>
          <p class="mt-0.5 text-sm text-ink-soft">{shown().es}</p>
        </section>
      )}</Show>
    </div>
  );
};

/** What is open over the session: a character or a word, one at a time. */
type Peek = { kind: 'char'; char: string } | { kind: 'word'; id: string };

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
  /** Sheets opened one from another, so the back arrow returns to the one before. */
  const [stack, setStack] = createSignal<Peek[]>([]);
  const peek = () => stack().at(-1);
  const push = (next: Peek) => setStack((open) => [...open, next].slice(-8));
  const setPeek = (next: Peek | undefined) => setStack(next ? [next] : []);
  const back = () => (stack().length > 1 ? () => setStack((open) => open.slice(0, -1)) : undefined);
  const openChar = (char: string) => push({ kind: 'char', char });
  const openWord = (id: string) => push({ kind: 'word', id });
  /** A word opened from the summary says how it went in the session. */
  const [peekNotes, setPeekNotes] = createSignal<Record<string, string>>({});
  const peekWord = (id: string) => vocabularyStore.findSelectedWord(id) ?? findWord(id);
  const charInstalled = (char: string) => characterStore.state.characters.some((row) => row.character === char);
  const charStatus = (char: string): StudyStatus | undefined => {
    if (!charInstalled(char)) return undefined;
    const status = store.status(characterItemId(char));
    return status === 'new' ? undefined : studyStatusOf(status);
  };

  const onCard = () => ['presenting', 'feedback', 'saving', 'error'].includes(session.view.state) && !!session.view.selection;

  const currentEntry = createMemo(() => {
    const selection = session.view.selection;
    return selection ? entryOf(selection.itemId) : undefined;
  });
  const note = () => {
    // The card's own eyebrow says "Palabra nueva"; the progress line only names a topic.
    return target.mode === 'topic' ? target.heading : undefined;
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
    // None of the words of a checked level that never arrived is in the plan, so nothing above says so.
    const missing = vocabularyStore.missingLabel();
    if (missing && target.mode !== 'weak') return `Las palabras de ${missing} no están descargadas en este dispositivo. Se descargarán cuando haya conexión.`;
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
      return { itemId: item.itemId, label: entry?.simplified ?? item.content.contentId, pinyin: entry?.pinyin, gloss: entry ? leadSense(entry.senses) : undefined, taught: item.taught, results: item.results };
    });
  const newWords = () => {
    const budget = newPerDay();
    return { taught: Math.max(0, budget - store.newLeftToday('other')), budget };
  };

  return (
    <div class="screen">
      <div class="animate-rise">
        {/* On a card the back arrow lives in the progress row; the title bar comes back around it. */}
        <Show when={!onCard()}>
          <TopBar title={target.heading} onBack={props.onBack} backLabel="Volver" />
        </Show>
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
          onBack={props.onBack}
          finished={
            <SessionSummary
              recorded={session.summary().recorded}
              items={summaryItems()}
              alreadyKnown={session.summary().alreadyKnown}
              dueTomorrow={store.pendingTomorrow('word-meaning')}
              nextDueAt={session.summary().nextReviews[0]?.dueAt ?? null}
              newWords={newWords()}
              now={store.now()}
              onClose={() => props.onBack()}
              exitLabel={exitLabel()}
              onOpenItem={(itemId) => {
                const wordId = wordIdOf(itemId as ItemId);
                if (wordId === null) return;
                const item = session.summary().items.find((candidate) => candidate.itemId === itemId);
                const missed = item?.results.filter((answer) => answer.recorded !== 'invalid-attempt' && (answer.outcome === 'incorrect' || answer.rating === 'again')).length ?? 0;
                setPeekNotes({ [wordId]: missed > 0 ? `En esta sesión: ${missed} ${missed === 1 ? 'fallo' : 'fallos'}` : 'En esta sesión: bien' });
                setPeek({ kind: 'word', id: wordId });
              }}
            />
          }
        >
          <LearningCard
            view={session.view}
            actions={session.actions}
            onCharacter={openChar}
            details={<Show when={currentEntry()}>{(entry) => <WordDetails entry={entry()} onCharacter={openChar} onWord={openWord} />}</Show>}
          />
        </LearningSessionShell>
      </Show>
      <Show when={peek()} keyed>{(open) => (
        <Show when={open.kind === 'char' ? characterOrWordStub((open as { char: string }).char, characterStore.state.characters) : undefined} fallback={
          <Show when={open.kind === 'word' ? peekWord((open as { id: string }).id) : undefined}>{(word) => (
            <WordPeekSheet word={word()} note={stack().length === 1 ? peekNotes()[word().id] : undefined} onCharacter={openChar} onBack={back()} onClose={() => setPeek(undefined)}>
              <WordDetails entry={word()} onCharacter={openChar} onWord={openWord} />
            </WordPeekSheet>
          )}</Show>
        }>{(record) => (
          <CharacterDetailSheet
            character={record()}
            installed={charInstalled(record().character)}
            currentWordId={currentEntry()?.id}
            quietStrokes
            status={charStatus(record().character)}
            onOpenCharacter={openChar}
            onOpenWord={openWord}
            onBack={back()}
            onStrokes={() => {
              const char = record().character;
              setPeek(undefined);
              props.onStrokes(char);
            }}
            onClose={() => setPeek(undefined)}
          />
        )}</Show>
      )}</Show>
    </div>
  );
};

export default VocabularyReview;
