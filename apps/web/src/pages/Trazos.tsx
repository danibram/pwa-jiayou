import { Component, createMemo, onCleanup, Show } from 'solid-js';
import TopBar from '../components/TopBar';
import RiceGrid from '../components/RiceGrid';
import { LearningSessionShell } from '../components/learning';
import { FreeStrokes, WritingCard, WritingSummary, type WritingSummaryItem } from '../components/learning/writing';
import { useLearningStore } from '../components/LearningStoreContext';
import { topicById } from '../data/topics';
import type { SessionScope } from '@jiayou/learning/sessions';
import type { ItemId } from '@jiayou/learning/types';
import { characterStore } from '../stores/characterStore';
import { createLearningSession } from '../stores/learningSessionStore';
import { type LearningStore } from '../stores/learningStore';
import { characterItemId, characterOf } from '@jiayou/learning/items';
import type { StrokeFocus } from '../screen';
import { glossHead } from '@jiayou/chinese';
import { spokenMeaning } from '@jiayou/chinese';
import { stopSpeech } from '../utils/speech';
import { characterOrWordStub } from '../utils/wordCharacter';

interface TrazosProps {
  onBack: (char?: string) => void;
  backLabel?: string;
  focus: StrokeFocus;
}

const isOneCharacter = (text: string) => [...text].length === 1;

const scopeOf = (focus: StrokeFocus): SessionScope => {
  switch (focus.kind) {
    case 'level':
      return { kind: 'all' };
    case 'topic':
      return { kind: 'topics', topicIds: [focus.topicId] };
    case 'character':
      return { kind: 'item', itemId: characterItemId(focus.char) };
  }
};

/** The meaning line the stroke page has always shown: the gloss head, capitalized. */
const meaningOf = (char: string): { meaning: string; pinyin: string } => {
  const known = characterOrWordStub(char, characterStore.state.characters);
  if (!known) return { meaning: '', pinyin: '' };
  return { meaning: glossHead(spokenMeaning(known)).replace(/^./, (letter) => letter.toUpperCase()), pinyin: known.pinyin };
};

/** Why a single character is only watched: no catalog row, or not in the levels being studied. */
const outsideNote = (store: LearningStore, char: string): string =>
  store.content(characterItemId(char))
    ? 'Este carácter no está en tus niveles. Puedes ver sus trazos, pero la práctica no se guarda.'
    : 'Este carácter no está en las listas HSK. Puedes ver sus trazos, pero la práctica no se guarda.';

/**
 * A Trazos session (mode `strokes`): a new character is watched, then traced; a character due today
 * is written from memory, the only card that rates it. The session controller plans, evaluates and
 * saves; leaving keeps every confirmed answer.
 */
const StrokeSession: Component<TrazosProps & { store: LearningStore; title: string }> = (props) => {
  const scope = scopeOf(props.focus);
  const session = createLearningSession({ mode: 'strokes', scope, store: props.store });
  onCleanup(stopSpeech);

  const currentChar = () => {
    const selection = session.view.selection;
    if (!selection) return undefined;
    return selection.kind === 'exercise' ? selection.exercise.answer?.characters : selection.card.answer.characters;
  };

  const empty = () => session.view.state === 'finished' && session.view.total === 0;
  const emptyPlan = createMemo(() => (empty() ? props.store.previewPlan('strokes', scope) : null));
  const leftOut = (reason: 'new-budget-day' | 'tomorrow-load' | 'content-unavailable' | 'not-in-pool') =>
    (emptyPlan()?.leftOutCounts[reason] ?? 0) > 0;
  const newPerDay = () => props.store.settings().newPerDay['character-writing'];

  const emptyTitle = () => {
    if (leftOut('new-budget-day')) return `Ya has empezado ${newPerDay()} caracteres nuevos hoy`;
    if (leftOut('tomorrow-load')) return 'Mañana ya tienes muchos repasos';
    return 'Todo al día';
  };
  const emptyBody = () => {
    if (leftOut('new-budget-day')) return 'Los caracteres nuevos vuelven mañana. Lo que ya has empezado se repasa cuando toca.';
    if (leftOut('tomorrow-load')) return 'Los caracteres nuevos vuelven cuando bajen los repasos.';
    if (leftOut('content-unavailable')) return 'Algunos caracteres todavía no están descargados en este dispositivo.';
    if (props.focus.kind === 'topic') return 'No quedan caracteres de este tema por practicar ahora.';
    return 'No te quedan caracteres por escribir ahora.';
  };

  const summaryItems = (): WritingSummaryItem[] =>
    session.summary().items.map((item) => ({
      itemId: item.itemId,
      label: characterOf(item.itemId as ItemId) ?? item.content.contentId,
      results: item.results,
    }));

  const back = () => props.onBack(currentChar() ?? (props.focus.kind === 'level' ? undefined : props.focus.char));

  return (
    <div class="screen">
      <div class="animate-rise">
        <TopBar title={props.title} onBack={back} backLabel={props.backLabel ?? 'Volver'} />
      </div>
      <Show
        when={!empty()}
        fallback={
          <Show
            when={props.focus.kind === 'character' && props.focus.char}
            fallback={
              <div class="m-auto max-w-[18rem] text-center animate-rise [animation-delay:60ms]">
                <RiceGrid class="mx-auto h-16 w-16 text-ink-faint" />
                <p class="mt-3 font-display text-2xl font-semibold">{emptyTitle()}</p>
                <p class="mt-2 text-sm text-ink-soft">{emptyBody()}</p>
                <button type="button" class="btn-ink mt-6 h-12 px-8" onClick={back}>{props.backLabel ?? 'Volver'}</button>
              </div>
            }
          >
            {(char) => (
              <FreeStrokes
                character={char()}
                {...meaningOf(char())}
                note={leftOut('new-budget-day')
                  ? `Hoy ya has empezado ${newPerDay()} caracteres nuevos. Puedes ver sus trazos; mañana entra en tu práctica.`
                  : 'Ahora no toca practicarlo. Puedes ver sus trazos, pero esta vez no se guarda.'}
              />
            )}
          </Show>
        }
      >
        <LearningSessionShell
          view={session.view}
          actions={session.actions}
          note={props.focus.kind === 'topic' ? props.title : undefined}
          finished={
            <WritingSummary
              items={summaryItems()}
              pendingLeft={props.store.pendingToday('character-writing')}
              onClose={back}
              exitLabel={props.backLabel ?? 'Volver'}
            />
          }
        >
          <WritingCard view={session.view} actions={session.actions} />
        </LearningSessionShell>
      </Show>
    </div>
  );
};

/**
 * Trazos. The selected levels, a topic or one character open a session. A character the pool does
 * not hold (outside HSK, outside the selected levels, or not downloaded) only shows its strokes.
 */
const Trazos: Component<TrazosProps> = (props) => {
  const store = useLearningStore();
  const focus = props.focus;
  const title = focus.kind === 'topic' ? topicById(focus.topicId)?.title ?? 'Trazos' : 'Trazos';
  const single = focus.kind === 'character' && isOneCharacter(focus.char) ? focus.char : null;
  const watchOnly = focus.kind === 'character' && (single === null || !store.inPool(characterItemId(single)));

  if (watchOnly) {
    const char = focus.char;
    return (
      <div class="screen">
        <div class="animate-rise">
          <TopBar title={title} onBack={() => props.onBack(char)} backLabel={props.backLabel ?? 'Volver'} />
        </div>
        <FreeStrokes character={char} {...meaningOf(char)} note={single ? outsideNote(store, single) : 'Solo se pueden practicar caracteres sueltos.'} />
      </div>
    );
  }
  return <StrokeSession {...props} store={store} title={title} />;
};

export default Trazos;
