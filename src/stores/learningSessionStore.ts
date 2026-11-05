import { getOwner, onCleanup, runWithOwner } from 'solid-js';
import { createStore } from 'solid-js/store';
import { evaluateAttempt, evaluatorVersion as currentEvaluatorVersion, type EvaluationResult } from '../domain/learning/evaluation';
import { exposureCard, seededRandom, selectExercise, type ExerciseContext, type ExercisePrompt, type ExerciseSelection } from '../domain/learning/exercises';
import { gradeTypedAnswer, isTypedAnswerExercise, parsePinyinInput, PRODUCTION_ROLES, TYPED_RUBRICS, type ProductionKind, type TypedGrade } from '../domain/learning/production';
import { addLocalDays, effectiveItemEvents, passesPractice, pendingToday } from '../domain/learning/scheduler';
import {
  buildSession,
  itemKind,
  markAlreadyKnown,
  requeueAfterAgain,
  seededShuffle,
  type PlannedCard,
  type SessionPlan,
  type SessionScope,
} from '../domain/learning/sessions';
import {
  EXERCISE_ROLES,
  STUDY_RULES,
  WRITING_FROM_MEMORY,
  type AttemptAction,
  type ContentReference,
  type Exercise,
  type Hint,
  type InvalidEvaluation,
  type ItemId,
  type LearningEvent,
  type LegacyPrompt,
  type Rating,
  type SchedulerState,
  type SessionAttempt,
  type SessionMode,
  type SessionState,
  type Timestamp,
} from '../domain/learning/types';
import {
  isLearningStorageError,
  LearningStorageError,
  type CommitAnswerInput,
  type LearningChange,
  type NextState,
  type PendingEvent,
} from '../persistence/learning';
import { contentReferenceOf, learningStore, type LearningRuntime, type LearningStore } from './learningStore';

// --- The UI seam. Components build against these types; keep them stable. ---

export type LearningSessionState = 'loading' | 'presenting' | 'feedback' | 'saving' | 'paused' | 'finished' | 'error';

/** What the last answer wrote. `exposure` is never shown as feedback: exposures move straight on. */
export type RecordedKind = 'scheduled-review' | 'practice' | 'invalid-attempt' | 'exposure';

export interface LearningSessionFeedback {
  /** The first-attempt outcome. "No lo sé" (`unanswered`) shows as `incorrect`. */
  outcome: 'correct' | 'partial' | 'incorrect' | 'invalid';
  /** The FSRS rating written, only for a scheduled review. */
  rating: Rating | null;
  recorded: RecordedKind;
}

export interface LearningSessionView {
  state: LearningSessionState;
  /** The card on screen: an exercise, or an exposure (teaching card) that is not answered. */
  selection: ExerciseSelection | null;
  /** The current attempt's actions so far, in order. */
  actions: readonly AttemptAction[];
  revealed: boolean;
  feedback: LearningSessionFeedback | null;
  /** Zero-based index of the card on screen. */
  position: number;
  /** Cards in the session, requeued ones included. */
  total: number;
  speechAvailable: boolean;
  error: { message: string; retryable: boolean } | null;
  /**
   * Why the last typed answer was not taken: text the policy cannot read, such as "ni8" or pinyin
   * in a characters field. Nothing was recorded and the card stays open. Cleared by the next action.
   */
  inputError: string | null;
  /** A confirmed answer `undoLast` would void: its feedback is shown, or the next card is untouched. */
  canUndo: boolean;
  /**
   * Whether the teaching card on screen offers "Ya la sé": the first teaching of a word, while
   * today's claims stay under `STUDY_RULES.alreadyKnownPerDay`.
   */
  canClaimKnown: boolean;
}

/**
 * What the UI may do. Calls that do not fit the current state are ignored.
 *
 * - `answer` on a multiple-choice card: `optionId` picks an option, graded correct when the option
 *   shows the item's own content. A wrong pick stays on the card (state `presenting`, the action
 *   kept), so the learner can try again; the attempt ends on a correct pick, on "No lo sé"
 *   (`{ optionId: null }`), or when only the correct option is left. The first pick decides the
 *   evaluation.
 * - `answer` on a self-assessed card (meaning, reverse, listen): only "No lo sé" (`answer: null` or
 *   empty) is accepted, and it ends the attempt as `unanswered`.
 * - `answer` on a typed card (`isTypedAnswerExercise`): `answer: null` is "No lo sé" and ends the
 *   attempt as `unanswered`; blank text is ignored. Other text is graded with `gradeTypedAnswer`
 *   before anything is saved. Text the policy cannot read sets `inputError`, records nothing and
 *   keeps the card open; anything else is recorded with that evaluation and ends the attempt, so
 *   the stored action and the event agree with the evaluator's own regrading.
 * - `reveal` shows the answer; `selfAssess` ends a self-assessed card with the learner's rating.
 * - `hint` records a hint; the exercise builder says whether it reveals the answer.
 * - `drawing` ends a writing card with the stroke checker's mistakes.
 * - `knowIt` is "Ya la sé" on a teaching card: it writes an `already-known` exposure and turns the
 *   card into a meaning check in place.
 * - `continue` moves on after feedback, and on a teaching card writes its exposure and moves on.
 * - `undoLast` voids the last answer while its feedback is shown, or before the next card is
 *   answered, and asks that card again.
 * - `pause`/`resume` only change the view; every action is already saved.
 * - `retry` repeats the write that failed. It reuses the event id, so it never writes twice.
 * - `audioFailed` closes the attempt as an `invalid-attempt` with a technical error. The rest of
 *   the session runs without audio: `speechAvailable` turns false and later audio cards are rebuilt.
 */
export interface LearningSessionActions {
  answer(input: { answer?: string | null; optionId?: string | null }): void;
  reveal(): void;
  hint(hint: Hint): void;
  selfAssess(rating: Rating): void;
  drawing(input: { mistakes: number }): void;
  knowIt(): void;
  continue(): void;
  undoLast(): void;
  pause(): void;
  resume(): void;
  retry(): void;
  audioFailed(): void;
}

export interface LearningSessionItemResult {
  itemId: ItemId;
  content: ContentReference;
  /** Answers in the order given; voided ones are left out. */
  results: readonly { recorded: Exclude<RecordedKind, 'exposure'>; outcome: LearningSessionFeedback['outcome']; rating: Rating | null }[];
  /** The item's next due time after the session, or null while it has no rating. */
  dueAt: Timestamp | null;
}

export interface LearningSessionSummary {
  /** Events this session wrote that still count, by type. */
  recorded: Record<RecordedKind, number>;
  items: readonly LearningSessionItemResult[];
  /** Items of the session with a due time, soonest first. */
  nextReviews: readonly { itemId: ItemId; dueAt: Timestamp }[];
}

/** The card behind the current position, for controls the view does not cover. */
export interface LearningSessionCard {
  itemId: ItemId;
  intent: PlannedCard['intent'];
  reason: PlannedCard['reason'];
  /** Whether `knowIt` applies: see `LearningSessionView.canClaimKnown`. */
  canClaimKnown: boolean;
}

export interface LearningSessionOptions {
  mode: SessionMode;
  scope?: SessionScope;
  /** Defaults to the app's `learningStore`. */
  store?: LearningStore;
  /** Seeds practice order and exercise choice. Defaults to the clock. */
  seed?: number;
  /** Resume the stored active session of this mode when its scope matches. Defaults to true. */
  resume?: boolean;
  /**
   * After a correct first pick on a multiple-choice card the feedback moves on by itself after
   * `delayMs` (800 by default). Tests inject the timer.
   */
  autoAdvance?: { delayMs?: number; setTimer?: (run: () => void, ms: number) => void };
}

export interface LearningSession {
  view: LearningSessionView;
  actions: LearningSessionActions;
  summary(): LearningSessionSummary;
  card(): LearningSessionCard | null;
  /** The stored session id, once loaded. */
  sessionId(): string | null;
  /** Settles when loading ends, in `presenting`, `finished` or `error`. */
  ready: Promise<void>;
  /** Settles once every write queued so far has finished or failed. */
  idle(): Promise<void>;
}

// --- Implementation. ---

type QueueEntry = SessionState['queue'][number];
type ValidResult = Exclude<EvaluationResult, { kind: 'invalid-attempt' }>;

/** Whether two scopes name the same items. Topic lists compare as sorted id lists. */
const sameScope = (a: SessionScope, b: SessionScope): boolean => {
  if (a.kind === 'all' || b.kind === 'all') return a.kind === b.kind;
  if (a.kind === 'item' || b.kind === 'item') return a.kind === 'item' && b.kind === 'item' && a.itemId === b.itemId;
  const x = [...new Set(a.topicIds)].sort();
  const y = [...new Set(b.topicIds)].sort();
  return x.length === y.length && x.every((id, index) => id === y[index]);
};

const ERROR_MESSAGE: Record<string, string> = {
  'quota-exceeded': 'No queda espacio para guardar. Libera espacio y vuelve a intentarlo.',
  aborted: 'No se pudo guardar la respuesta. Vuelve a intentarlo.',
  unavailable: 'No se puede abrir el almacenamiento. Recarga la página.',
  'stale-state': 'Otra pestaña cambió esta tarjeta. Vuelve a intentarlo.',
};

/** A typed card stored under a policy version this build does not grade: no text could pass it. */
const isStaleTypedExercise = (exercise: Exercise): boolean =>
  exercise.format === 'free-recall' &&
  exercise.grading === 'automatic' &&
  Object.prototype.hasOwnProperty.call(TYPED_RUBRICS, exercise.rubric.id) &&
  !isTypedAnswerExercise(exercise);

const rejectedStale = (itemId: ItemId) =>
  new LearningStorageError({ kind: 'stale-state', itemId, message: `The state of ${itemId} keeps changing in another tab` });

/**
 * The second line under the shell's headline, which already says the progress was not saved. A kind
 * without its own advice gets no second line, so the headline is not repeated.
 */
const describeError = (error: unknown): { message: string; retryable: boolean } => {
  if (isLearningStorageError(error)) {
    return { message: ERROR_MESSAGE[error.error.kind] ?? '', retryable: error.retryable };
  }
  return { message: 'Algo ha fallado en la sesión.', retryable: false };
};

/** The prompt an exercise was built from: role fields are unique per prompt, and per kind for typed answers. */
const promptOf = (exercise: Exercise): ExercisePrompt => {
  if (exercise.format === 'writing') return exercise.stage === 'memory' ? 'write-memory' : 'write-trace';
  if (isTypedAnswerExercise(exercise)) {
    const kind = (Object.keys(PRODUCTION_ROLES) as ProductionKind[]).find((candidate) => {
      const role = PRODUCTION_ROLES[candidate];
      const typedGloss = exercise.rubric.id === 'typed-gloss';
      return role.skill === exercise.skill && role.cue === exercise.cue && (candidate === 'gloss-from-audio') === typedGloss;
    });
    if (kind) return kind;
  }
  const match = (Object.keys(EXERCISE_ROLES) as LegacyPrompt[]).find((prompt) => {
    const role = EXERCISE_ROLES[prompt];
    return role.skill === exercise.skill && role.format === exercise.format && role.cue === exercise.cue && role.grading === exercise.grading;
  });
  return match ?? 'meaning';
};

const selectionOf = (entry: QueueEntry): ExerciseSelection =>
  entry.exercise
    ? {
        kind: 'exercise',
        itemId: entry.itemId,
        content: entry.content,
        exercise: entry.exercise,
        evaluatorVersion: entry.evaluatorVersion,
        prompt: promptOf(entry.exercise),
        skipped: [],
      }
    : { kind: 'exposure', itemId: entry.itemId, content: entry.content, card: entry.exposure! };

const cardOf = (entry: QueueEntry): PlannedCard => ({ itemId: entry.itemId, intent: entry.intent, reason: entry.reason });

/** Copies for the reactive view, so the store never wraps objects that go to IndexedDB. */
const plain = <T>(value: T): T => (value === null || value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T));

/** Only the fields the backup format allows, so a hint from a component cannot carry extras. */
const cleanHint = (hint: Hint): Hint => ({
  kind: hint.kind,
  revealsAnswer: hint.revealsAnswer,
  ...(typeof hint.value === 'string' ? { value: hint.value } : {}),
});

/** What to say when typed text cannot be read. The learner fixes it and nothing is saved. */
const inputErrorMessage = (grade: TypedGrade): string => {
  if (grade.kind === 'characters') return 'Escribe la palabra en caracteres chinos, sin letras ni signos.';
  if (grade.kind === 'pinyin') {
    const [first] = grade.diagnosis.formatErrors;
    if (first?.kind === 'unknown-tone-number') return `No hay tono ${first.character}. Usa del 1 al 4, y 5 o 0 para el tono neutro.`;
    if (first?.kind === 'misplaced-digit') return 'Pon el número del tono justo después de su sílaba, como en ni3 hao3.';
    if (first?.kind === 'unexpected-character') {
      return `«${first.character}» no se usa en pinyin. Escribe letras y tonos, como ni3 hao3 o nǐ hǎo.`;
    }
    return 'Revisa las marcas de tono. Escribe letras y tonos, como ni3 hao3 o nǐ hǎo.';
  }
  return 'Escribe el significado con palabras.';
};

const feedbackOutcome = (result: EvaluationResult): LearningSessionFeedback['outcome'] => {
  if (result.kind === 'invalid-attempt') return 'invalid';
  const outcome = result.evaluation.outcome;
  return outcome === 'unanswered' ? 'incorrect' : outcome;
};

/** Again, a miss, or a failed "Ya la sé" check brings the item back later in the session. */
const failed = (result: ValidResult, entry: QueueEntry): boolean => {
  if (result.kind === 'scheduled-review') return result.rating === 'again';
  return entry.intent === 'already-known-check' || result.evaluation.outcome !== 'correct';
};

export const createLearningSession = (options: LearningSessionOptions): LearningSession => {
  const { mode } = options;
  const scope: SessionScope = options.scope ?? { kind: 'all' };
  const store = options.store ?? learningStore;

  const [view, setRaw] = createStore<LearningSessionView>({
    state: 'loading',
    selection: null,
    actions: [],
    revealed: false,
    feedback: null,
    position: 0,
    total: 0,
    speechAvailable: false,
    error: null,
    inputError: null,
    canUndo: false,
    canClaimKnown: false,
  });

  let rt: LearningRuntime;
  let random: () => number = Math.random;
  let session: SessionState | null = null;
  let attempt: SessionAttempt | null = null;
  /** The write that failed, repeated as is by `retry`. */
  let failedWrite: (() => Promise<void>) | null = null;
  let stateBeforePause: LearningSessionState = 'presenting';
  let stateBeforeError: LearningSessionState = 'presenting';
  /** Writes run one after another, so a draft never lands after the answer it precedes. */
  let queue: Promise<unknown> = Promise.resolve();
  let undo: { eventId: string; voidId: string; before: SessionState; attemptId: string } | null = null;

  const undoable = (): boolean =>
    undo !== null && (view.state === 'feedback' || (view.state === 'presenting' && (!attempt || attempt.actions.length === 0)));
  /** Every view change also refreshes `canUndo`, which depends on the state and the open attempt. */
  const setView = ((...args: unknown[]) => {
    (setRaw as (...rest: unknown[]) => void)(...args);
    const next = undoable();
    if (view.canUndo !== next) setRaw('canUndo', next);
  }) as typeof setRaw;
  const delayMs = options.autoAdvance?.delayMs ?? 800;
  const setTimer = options.autoAdvance?.setTimer ?? ((run: () => void, ms: number) => void setTimeout(run, ms));
  /** Bumped whenever the screen moves, so a stale auto-advance does nothing. */
  let shownToken = 0;

  /**
   * Set by the first audio that fails to play. The device said it could speak, but this session
   * stops trusting it and runs without audio, so the learner does not skip card after card.
   */
  let speechBroken = false;
  const speechOn = (): boolean => !speechBroken && rt.speechAvailable();

  const entryAt = (index: number): QueueEntry | null => session?.queue[index] ?? null;
  const current = (): QueueEntry | null => (session ? entryAt(session.position) : null);

  const context = (itemId: ItemId): ExerciseContext => ({
    vocabulary: rt.vocabulary(),
    familiar: (contentId) => {
      const id = `word-meaning:${contentId}` as ItemId;
      const state = rt.states().get(id);
      return (state !== undefined && state.state !== 'new') || rt.itemEvents(id).some((event) => event.type === 'exposure');
    },
    speechAvailable: speechOn(),
    recentEvidence: effectiveItemEvents(rt.itemEvents(itemId), itemId).flatMap((event) => ('evidence' in event ? event.evidence : [])),
    random,
  });

  /** The stored form of a planned card, or null when its content is gone. */
  const buildEntry = (card: PlannedCard): QueueEntry | null => {
    const content = rt.contentFor(card.itemId);
    if (!content) return null;
    const selection = selectExercise(card, content, context(card.itemId));
    return selection.kind === 'exposure'
      ? { ...card, content: selection.content, exercise: null, exposure: selection.card, evaluatorVersion: currentEvaluatorVersion }
      : { ...card, content: selection.content, exercise: selection.exercise, exposure: null, evaluatorVersion: selection.evaluatorVersion };
  };

  const planOf = (state: SessionState): SessionPlan => {
    const cards = state.queue.map(cardOf);
    const today = rt.dayRule.localDay(rt.clock());
    return {
      mode,
      today,
      cards,
      counts: { cards: cards.length, scheduled: 0, teach: 0, practice: 0, alreadyKnownCheck: 0, newItems: 0, taughtToday: 0, newLeftAfter: 0, tomorrowLoadFull: false },
      leftOut: [],
      // Requeue and "Ya la sé" read only the cards and the limits.
      leftOutCounts: {} as SessionPlan['leftOutCounts'],
      limits: { requeueGap: STUDY_RULES.requeueGap, requeueLimit: rt.settings.requeueLimit, requeuesPerItem: rt.settings.requeuesPerItem },
    };
  };

  /** Keeps stored entries for cards the transform kept, builds the cards it added. */
  const remap = (entries: readonly QueueEntry[], cards: readonly PlannedCard[], fresh: (card: PlannedCard) => QueueEntry | null): QueueEntry[] => {
    const used = new Set<number>();
    const out: QueueEntry[] = [];
    for (const card of cards) {
      const index = entries.findIndex(
        (entry, i) => !used.has(i) && entry.itemId === card.itemId && entry.intent === card.intent && entry.reason === card.reason,
      );
      if (index >= 0) {
        used.add(index);
        out.push(entries[index]);
        continue;
      }
      const built = fresh(card);
      if (built) out.push(built);
    }
    return out;
  };

  /** "Ya la sé" claims written today, each an `already-known` exposure. Exposures are never voided. */
  const claimsToday = (): number => {
    const today = rt.dayRule.localDay(rt.clock());
    return rt.events().filter((event) => event.type === 'exposure' && event.card.reason === 'already-known' && event.localDay === today).length;
  };

  /** Only the first teaching of a word, never a reteach or a character, and within the daily cap. */
  const claimAvailable = (entry: QueueEntry | null): boolean =>
    !!entry &&
    entry.intent === 'teach' &&
    entry.reason === 'new' &&
    itemKind(entry.itemId) === 'word-meaning' &&
    claimsToday() < STUDY_RULES.alreadyKnownPerDay;

  const show = (state: LearningSessionState, index: number) => {
    shownToken += 1;
    const entry = entryAt(index);
    setView({
      state,
      selection: entry ? plain(selectionOf(entry)) : null,
      actions: plain(attempt && entry?.exercise ? [...attempt.actions] : []),
      revealed: !!attempt?.actions.some((action) => action.type === 'reveal'),
      position: index,
      total: session?.queue.length ?? 0,
      speechAvailable: speechOn(),
      error: null,
      inputError: null,
      canClaimKnown: state === 'presenting' && claimAvailable(entry),
    });
    if (state !== 'feedback') setView('feedback', null);
  };

  const fail = (error: unknown, write: (() => Promise<void>) | null) => {
    const described = describeError(error);
    failedWrite = described.retryable ? write : null;
    // A failed draft returns to the card it was saving; a failed answer lets its own write set the state.
    if (view.state !== 'error') stateBeforeError = view.state === 'saving' || view.state === 'loading' ? 'presenting' : view.state;
    setView({ state: 'error', error: described });
  };

  /** Set when another tab reset the progress: this session must not write again. */
  let stopped = false;

  /** Runs a write after the ones before it. On failure the view moves to `error` with this write to retry. */
  const run = (write: () => Promise<void>, saving: boolean): void => {
    if (stopped) return;
    if (saving) setView('state', 'saving');
    const next = queue.then(write).catch((error: unknown) => fail(error, write));
    queue = next;
  };

  const withAttempt = (state: SessionState, open: SessionAttempt): SessionState => ({
    ...state,
    attempts: [...state.attempts.filter((other) => other.id !== open.id && other.status !== 'in-progress'), open],
  });

  const draft = (): void => {
    if (!session) return;
    const snapshot = session;
    run(() => rt.repo.saveAttemptDraft(snapshot), false);
  };

  /** Puts the card at the session's position on screen, opening or restoring its attempt. */
  const present = (): void => {
    if (!session) return;
    const entry = current();
    if (!entry) {
      attempt = null;
      if (session.status === 'active') {
        const done: SessionState = { ...session, status: 'completed' };
        session = done;
        run(() => rt.repo.saveAttemptDraft(done), false);
      }
      setView({ state: 'finished', selection: null, actions: [], revealed: false, feedback: null, position: session.queue.length, total: session.queue.length, error: null, canClaimKnown: false });
      return;
    }
    attempt = null;
    if (entry.exercise) {
      const open = session.attempts.find(
        (candidate) => candidate.status === 'in-progress' && candidate.itemId === entry.itemId && candidate.exercise.id === entry.exercise!.id,
      );
      attempt = open ?? {
        id: rt.newId(),
        eventId: rt.newId(),
        itemId: entry.itemId,
        content: entry.content,
        exercise: entry.exercise,
        evaluatorVersion: entry.evaluatorVersion,
        actions: [],
        status: 'in-progress',
      };
      session = withAttempt(session, attempt);
    }
    show('presenting', session.position);
  };

  /** The cached state after a non-rating event: an unassisted correct practice after teaching sets `eligibleFrom` (P1). */
  const practiceNextState = (itemId: ItemId, event: PendingEvent): NextState => {
    const taughtBefore = effectiveItemEvents(rt.itemEvents(itemId), itemId).some(
      (other) => other.type === 'exposure' && other.card.reason === 'teaching',
    );
    const passes = taughtBefore && passesPractice(event);
    return (stored: SchedulerState | null) => {
      if (stored && stored.state !== 'new') return null;
      const base = stored ?? rt.scheduler.newState(itemId);
      if (passes && base.eligibleFrom === null) return { ...base, eligibleFrom: addLocalDays(event.localDay, 1) };
      return stored ? null : base;
    };
  };

  const isStale = (error: unknown): boolean => isLearningStorageError(error) && error.error.kind === 'stale-state';

  /**
   * Writes the answer. `onStale` runs instead of `after` when another tab changed the item since
   * the answer was evaluated; nothing was written then.
   */
  const commit = (input: CommitAnswerInput, after: () => void, onStale?: () => Promise<void>): void => {
    const write = async () => {
      try {
        await rt.commit(input);
      } catch (error) {
        if (onStale && isStale(error)) {
          await onStale();
          return;
        }
        throw error;
      }
      after();
    };
    run(write, true);
  };

  /**
   * Takes the stored session when another tab moved it on, so this tab does not answer a card twice.
   * Returns whether it did. Local drafts on the same card win: they are newer than the stored ones.
   */
  const adoptStored = async (): Promise<boolean> => {
    if (!session) return false;
    const stored = await rt.loadSession(mode);
    if (!stored || stored.id !== session.id) return false;
    if (stored.position === session.position && stored.queue.length === session.queue.length) return false;
    session = stored;
    undo = null;
    present();
    return true;
  };

  /**
   * For writes that are not re-evaluated (exposures, a stale attempt closed on resume): when another
   * tab moved the session on, this tab takes the stored session and the write is dropped.
   */
  const adoptOnStale = (snapshot: SessionState, itemId: ItemId) => async () => {
    await store.reload();
    if (session !== snapshot || (await adoptStored())) return;
    throw rejectedStale(itemId);
  };

  /**
   * Evaluates the open attempt and writes its event, the item's state and the advanced session at once.
   * The write carries the state the evaluation read; if another tab changed it meanwhile, the store
   * reloads and the answer is evaluated again once, unless the other tab already moved past this card.
   */
  const submit = (invalidation?: InvalidEvaluation, staleRetries = 1): void => {
    if (!session || !attempt) return;
    const entry = current()!;
    const exercise = entry.exercise!;
    const before = session;
    const submitted: SessionAttempt = { ...attempt, status: 'submitted' };
    const now = rt.clock();
    const itemState = rt.states().get(entry.itemId) ?? null;
    let result: EvaluationResult;
    try {
      result = evaluateAttempt(submitted, exercise, {
        sessionMode: mode,
        scheduledEligible: itemState !== null && pendingToday(itemState, now, rt.dayRule),
        alreadyKnownCheck: entry.intent === 'already-known-check',
        invalidation,
      });
    } catch (error) {
      fail(error, null);
      return;
    }

    const occurredAt =
      result.kind === 'scheduled-review' && itemState && itemState.state !== 'new' ? Math.max(now, itemState.lastReviewAt) : now;
    const base = {
      schemaVersion: 1 as const,
      id: submitted.eventId,
      sessionId: session.id,
      sessionMode: mode,
      occurredAt,
      localDay: rt.dayRule.localDay(occurredAt),
      itemId: entry.itemId,
      attemptId: submitted.id,
      content: submitted.content,
      exercise,
      evaluatorVersion: result.evaluatorVersion,
      actions: submitted.actions,
    };
    let event: PendingEvent;
    let nextState: NextState;
    if (result.kind === 'scheduled-review') {
      const scheduler = rt.scheduler;
      const rating = result.rating;
      event =
        result.basis === 'already-known'
          ? { ...base, evidence: result.evidence, type: 'scheduled-review', configId: scheduler.configId, basis: 'already-known', rating: 'good', evaluation: { outcome: 'correct' } }
          : result.rating === 'again'
            ? { ...base, evidence: result.evidence, type: 'scheduled-review', configId: scheduler.configId, basis: 'due', rating: 'again', evaluation: result.evaluation }
            : { ...base, evidence: result.evidence, type: 'scheduled-review', configId: scheduler.configId, basis: 'due', rating: result.rating, evaluation: { outcome: 'correct' } };
      nextState = (stored) => scheduler.apply(stored ?? scheduler.newState(entry.itemId), rating, occurredAt);
    } else if (result.kind === 'practice') {
      event = { ...base, evidence: result.evidence, type: 'practice', evaluation: result.evaluation };
      nextState = practiceNextState(entry.itemId, event);
    } else {
      event = { ...base, evidence: [], type: 'invalid-attempt', evaluation: result.evaluation };
      nextState = practiceNextState(entry.itemId, event);
    }

    // A content change is closed in place: the regenerated card stays at the same position.
    const advance = invalidation ? 0 : 1;
    let queueAfter = session.queue;
    if (result.kind !== 'invalid-attempt' && failed(result, entry)) {
      const plan = requeueAfterAgain(planOf(session), session.position, entry.itemId);
      if (plan.cards.length !== session.queue.length) queueAfter = remap(session.queue, plan.cards, buildEntry);
    }
    const position = session.position + advance;
    const next: SessionState = {
      ...session,
      queue: queueAfter,
      position,
      attempts: session.attempts.map((other) => (other.id === submitted.id ? submitted : other)),
      status: position >= queueAfter.length ? 'completed' : 'active',
    };
    const feedback: LearningSessionFeedback = {
      outcome: feedbackOutcome(result),
      rating: result.kind === 'scheduled-review' ? result.rating : null,
      recorded: result.kind,
    };
    const shown = before.position;
    const onStale = async () => {
      await store.reload();
      // Another tab's answer already reached this tab and moved it on: this answer is dropped.
      if (session !== before || (await adoptStored())) return;
      if (staleRetries <= 0) throw rejectedStale(entry.itemId);
      submit(invalidation, staleRetries - 1);
    };
    commit({ event, nextState, session: next, basedOn: itemState, sessionPosition: before.position }, () => {
      session = next;
      attempt = submitted;
      undo = { eventId: submitted.eventId, voidId: rt.newId(), before, attemptId: submitted.id };
      shownToken += 1;
      setView({ state: 'feedback', feedback, total: next.queue.length, position: shown, actions: plain([...submitted.actions]), error: null });
      if (exercise.format === 'multiple-choice' && feedback.outcome === 'correct') {
        const token = shownToken;
        setTimer(() => {
          if (token === shownToken && view.state === 'feedback') present();
        }, delayMs);
      }
    }, onStale);
  };

  const record = (action: AttemptAction, end: boolean): void => {
    if (view.state !== 'presenting' || !session || !attempt) return;
    attempt = { ...attempt, actions: [...attempt.actions, action] };
    session = withAttempt(session, attempt);
    // A new action on this card means the previous answer is no longer the one to undo.
    undo = null;
    setView({ actions: plain([...attempt.actions]), revealed: attempt.actions.some((other) => other.type === 'reveal'), inputError: null });
    if (end) submit();
    else draft();
  };

  const exercise = (): Exercise | null => (view.state === 'presenting' && attempt ? current()?.exercise ?? null : null);

  const actions: LearningSessionActions = {
    answer(input) {
      const shown = exercise();
      if (!shown) return;
      const at = rt.clock();
      const optionId = input.optionId ?? null;
      const text = typeof input.answer === 'string' && input.answer.trim() !== '' ? input.answer : null;
      if (shown.format === 'multiple-choice') {
        if (optionId === null) {
          record({ type: 'answer', at, answer: null, selectedOptionId: null, evaluation: { outcome: 'unanswered' } }, true);
          return;
        }
        const option = shown.options.find((candidate) => candidate.id === optionId);
        if (!option) return;
        const right = option.contentId === current()!.content.contentId;
        const wrongBefore = new Set(
          attempt!.actions.flatMap((action) => (action.type === 'answer' && action.selectedOptionId ? [action.selectedOptionId] : [])),
        );
        if (wrongBefore.has(optionId)) return;
        const exhausted = !right && wrongBefore.size + 1 >= shown.options.length - 1;
        record({ type: 'answer', at, answer: option.text, selectedOptionId: optionId, evaluation: { outcome: right ? 'correct' : 'incorrect' } }, right || exhausted);
        return;
      }
      if (isTypedAnswerExercise(shown)) {
        if (input.answer === null || input.answer === undefined) {
          record({ type: 'answer', at, answer: null, selectedOptionId: null, evaluation: { outcome: 'unanswered' } }, true);
          return;
        }
        if (text === null) return;
        // Only separators ("'-") parse as zero syllables, which the policy would grade as a miss.
        const parsed = shown.rubric.id === 'typed-pinyin' ? parsePinyinInput(text) : null;
        if (parsed?.kind === 'tokens' && parsed.tokens.length === 0) {
          setView('inputError', 'Escribe el pinyin con letras y tonos, como ni3 hao3 o nǐ hǎo.');
          return;
        }
        let grade: TypedGrade | null;
        try {
          grade = gradeTypedAnswer(shown, text);
        } catch (error) {
          // A catalog reading the policy cannot read is a content error, not the learner's.
          fail(error, null);
          return;
        }
        if (!grade) return;
        // Text with nothing to grade ("...") is not "No lo sé": the learner fixes it like a format error.
        if (grade.evaluation.outcome === 'invalid' || grade.evaluation.outcome === 'unanswered') {
          setView('inputError', inputErrorMessage(grade));
          return;
        }
        record({ type: 'answer', at, answer: text, selectedOptionId: null, evaluation: grade.evaluation }, true);
        return;
      }
      if (shown.grading === 'self-assessment' && text === null) {
        record({ type: 'answer', at, answer: null, selectedOptionId: null, evaluation: { outcome: 'unanswered' } }, true);
      }
    },
    reveal() {
      if (!exercise() || view.revealed) return;
      record({ type: 'reveal', at: rt.clock() }, false);
    },
    hint(hint) {
      if (!exercise()) return;
      record({ type: 'hint', at: rt.clock(), hint: cleanHint(hint) }, false);
    },
    selfAssess(rating) {
      const shown = exercise();
      // Rating needs the answer on screen: a recall is only judged against what it should have been.
      if (!shown || shown.grading !== 'self-assessment' || !view.revealed) return;
      record({ type: 'self-assessment', at: rt.clock(), rating }, true);
    },
    drawing({ mistakes }) {
      const shown = exercise();
      if (!shown || shown.format !== 'writing' || !Number.isSafeInteger(mistakes) || mistakes < 0) return;
      const outcome = mistakes > WRITING_FROM_MEMORY.hardMaxMistakes ? 'incorrect' : 'correct';
      record({ type: 'drawing', at: rt.clock(), mistakes, evaluation: { outcome } }, true);
    },
    knowIt() {
      const entry = current();
      if (view.state !== 'presenting' || !session || !entry || !claimAvailable(entry)) return;
      const content = rt.contentFor(entry.itemId);
      if (!content) return;
      const plan = markAlreadyKnown(planOf(session), session.position, entry.itemId);
      const check = buildEntry({ itemId: entry.itemId, intent: 'already-known-check', reason: 'claimed-known' });
      if (!check) return;
      const queueAfter = remap(session.queue, plan.cards, (card) => (card.intent === 'already-known-check' && card.itemId === entry.itemId ? check : buildEntry(card)));
      const now = rt.clock();
      const event: PendingEvent = {
        schemaVersion: 1,
        id: rt.newId(),
        sessionId: session.id,
        sessionMode: mode,
        occurredAt: now,
        localDay: rt.dayRule.localDay(now),
        type: 'exposure',
        itemId: entry.itemId,
        content: contentReferenceOf(content),
        card: exposureCard(entry.itemId, content, 'already-known', context(entry.itemId)),
      };
      const before = session;
      const next: SessionState = { ...session, queue: queueAfter };
      commit({ event, nextState: practiceNextState(entry.itemId, event), session: next, sessionPosition: before.position }, () => {
        session = next;
        undo = null;
        present();
      }, adoptOnStale(before, entry.itemId));
    },
    continue() {
      if (!session) return;
      if (view.state === 'feedback') {
        present();
        return;
      }
      const entry = current();
      if (view.state !== 'presenting' || !entry || !entry.exposure) return;
      const now = rt.clock();
      const event: PendingEvent = {
        schemaVersion: 1,
        id: rt.newId(),
        sessionId: session.id,
        sessionMode: mode,
        occurredAt: now,
        localDay: rt.dayRule.localDay(now),
        type: 'exposure',
        itemId: entry.itemId,
        content: entry.content,
        card: entry.exposure,
      };
      const before = session;
      const position = session.position + 1;
      const next: SessionState = { ...session, position, status: position >= session.queue.length ? 'completed' : 'active' };
      commit({ event, nextState: practiceNextState(entry.itemId, event), session: next, sessionPosition: before.position }, () => {
        session = next;
        undo = null;
        present();
      }, adoptOnStale(before, entry.itemId));
    },
    undoLast() {
      if (!session || !undo) return;
      const untouched = view.state === 'feedback' || (view.state === 'presenting' && (!attempt || attempt.actions.length === 0));
      if (!untouched) return;
      const target = undo;
      const write = async () => {
        await rt.voidAttempt(target.eventId, 'user-correction', rt.clock(), { id: target.voidId, sessionId: target.before.id, sessionMode: mode });
        // Back to the card as it was before the answer, with a fresh attempt.
        const restored: SessionState = {
          ...target.before,
          status: 'active',
          attempts: target.before.attempts.filter((other) => other.id !== target.attemptId),
        };
        session = restored;
        undo = null;
        present();
        await rt.repo.saveAttemptDraft(session, { rewind: true });
      };
      run(write, true);
    },
    pause() {
      if (view.state !== 'presenting' && view.state !== 'feedback') return;
      stateBeforePause = view.state;
      setView('state', 'paused');
    },
    resume() {
      if (view.state !== 'paused') return;
      setView('state', stateBeforePause);
    },
    retry() {
      if (view.state !== 'error' || !failedWrite) return;
      const write = failedWrite;
      failedWrite = null;
      setView({ error: null });
      run(async () => {
        await write();
        if (view.state === 'saving') setView('state', stateBeforeError);
      }, true);
    },
    audioFailed() {
      if (!exercise() || !session) return;
      speechBroken = true;
      setView('speechAvailable', false);
      // The cards still to come that need audio are chosen again, now without it.
      const from = session.position;
      session = {
        ...session,
        queue: session.queue.map((entry, index) =>
          index > from && entry.exercise?.cue === 'audio' ? buildEntry(cardOf(entry)) ?? entry : entry,
        ),
      };
      record({ type: 'answer', at: rt.clock(), answer: null, selectedOptionId: null, evaluation: { outcome: 'invalid', reason: 'technical-error' } }, true);
    },
  };

  /**
   * A stored session whose cards no longer hold: content that changed, or a typed card written under
   * a policy version this build cannot grade (it would accept no answer). An open attempt with
   * actions on such a card closes as invalid (`content-changed`, or `other` for a policy change) and
   * the card is regenerated; other such cards are regenerated silently. A card whose content is no
   * longer installed keeps its stored exercise, which holds everything it shows.
   */
  const revalidate = (stored: SessionState): { session: SessionState; invalid: { attempt: SessionAttempt; reason: InvalidEvaluation['reason'] } | null; changed: boolean } => {
    let changed = false;
    let invalid: { attempt: SessionAttempt; reason: InvalidEvaluation['reason'] } | null = null;
    const queueAfter = stored.queue.map((entry, index) => {
      if (index < stored.position) return entry;
      const content = rt.contentFor(entry.itemId);
      if (!content) return entry;
      const contentChanged = contentReferenceOf(content).contentRevision !== entry.content.contentRevision;
      const policyGone = !!entry.exercise && isStaleTypedExercise(entry.exercise);
      if (!contentChanged && !policyGone) return entry;
      changed = true;
      if (index === stored.position && entry.exercise) {
        const open = stored.attempts.find(
          (candidate) => candidate.status === 'in-progress' && candidate.itemId === entry.itemId && candidate.exercise.id === entry.exercise!.id,
        );
        if (open && open.actions.length > 0) invalid = { attempt: open, reason: contentChanged ? 'content-changed' : 'other' };
      }
      return buildEntry(cardOf(entry)) ?? entry;
    });
    return { session: { ...stored, queue: queueAfter }, invalid, changed };
  };

  /**
   * Another tab wrote. A reset stops this session for good. Any other write may have moved this
   * session on (the same session open in two tabs), so the stored one is taken when it moved.
   */
  const onExternalChange = (change: LearningChange): void => {
    if (stopped) return;
    if (change.kind === 'reset') {
      stopped = true;
      setView({ state: 'error', error: { message: 'Se ha borrado el progreso en otra pestaña. Vuelve al inicio.', retryable: false } });
      return;
    }
    queue = queue
      .then(async () => {
        if (!stopped && (view.state === 'presenting' || view.state === 'feedback')) await adoptStored();
      })
      .catch(() => {});
  };

  const start = async (): Promise<void> => {
    rt = await store.init();
    const unsubscribe = store.onExternalChange(onExternalChange);
    // The screen that made this session owns it; the subscription ends with that screen.
    if (owner) runWithOwner(owner, () => onCleanup(unsubscribe));
    const seed = options.seed ?? rt.clock();
    random = seededRandom(seed);
    const stored = options.resume === false ? null : await rt.loadSession(mode);
    if (stored && stored.scope && sameScope(stored.scope, scope)) {
      const checked = revalidate(stored);
      if (checked.invalid) {
        // Close the stale attempt against the card it was shown with; the commit carries the new queue.
        session = stored;
        submitStale(checked.invalid.attempt, checked.invalid.reason, checked.session.queue);
        return;
      }
      session = checked.session;
      if (checked.changed) draft();
      present();
      return;
    }
    const plan = buildSession({
      mode,
      scope,
      pool: rt.pool(),
      states: rt.states(),
      events: rt.events(),
      now: rt.clock(),
      dayRule: rt.dayRule,
      settings: rt.settings,
      shuffle: seededShuffle(seed),
    });
    const entries = plan.cards.flatMap((card) => {
      const entry = buildEntry(card);
      return entry ? [entry] : [];
    });
    session = { schemaVersion: 1, id: rt.newId(), mode, scope, status: 'active', startedAt: rt.clock(), queue: entries, position: 0, attempts: [] };
    if (entries.length === 0) {
      session = { ...session, status: 'completed' };
      present();
      return;
    }
    const first = session;
    run(() => rt.repo.saveAttemptDraft(first), false);
    present();
  };

  /** Writes the invalid attempt for a card whose content changed, with the regenerated queue. */
  const submitStale = (stale: SessionAttempt, reason: InvalidEvaluation['reason'], regenerated: readonly QueueEntry[]): void => {
    if (!session) return;
    const entry = current()!;
    const now = rt.clock();
    const result = evaluateAttempt(stale, entry.exercise!, {
      sessionMode: mode,
      scheduledEligible: false,
      alreadyKnownCheck: entry.intent === 'already-known-check',
      invalidation: { outcome: 'invalid', reason },
    });
    if (result.kind !== 'invalid-attempt') return;
    const event: PendingEvent = {
      schemaVersion: 1,
      id: stale.eventId,
      sessionId: session.id,
      sessionMode: mode,
      occurredAt: now,
      localDay: rt.dayRule.localDay(now),
      itemId: entry.itemId,
      attemptId: stale.id,
      content: stale.content,
      exercise: stale.exercise,
      evaluatorVersion: result.evaluatorVersion,
      actions: stale.actions,
      evidence: [],
      type: 'invalid-attempt',
      evaluation: result.evaluation,
    };
    const next: SessionState = {
      ...session,
      queue: [...regenerated],
      attempts: session.attempts.map((other) => (other.id === stale.id ? { ...stale, status: 'submitted' } : other)),
    };
    const before = session;
    commit({ event, nextState: practiceNextState(entry.itemId, event), session: next, sessionPosition: before.position }, () => {
      session = next;
      attempt = null;
      present();
    }, adoptOnStale(before, entry.itemId));
  };

  const summary = (): LearningSessionSummary => {
    const recorded: Record<RecordedKind, number> = { 'scheduled-review': 0, practice: 0, 'invalid-attempt': 0, exposure: 0 };
    if (!session) return { recorded, items: [], nextReviews: [] };
    const id = session.id;
    const own = rt.events().filter((event) => event.sessionId === id);
    const voided = new Set(rt.events().flatMap((event) => (event.type === 'attempt-voided' ? [event.targetEventId] : [])));
    const items = new Map<ItemId, { content: ContentReference; results: LearningSessionItemResult['results'][number][] }>();
    for (const event of [...own].sort((a, b) => a.sequence - b.sequence)) {
      if (event.type === 'attempt-voided' || voided.has(event.id)) continue;
      recorded[event.type] += 1;
      const entry = items.get(event.itemId) ?? { content: event.content, results: [] };
      items.set(event.itemId, entry);
      if (event.type === 'exposure') continue;
      entry.results.push({
        recorded: event.type,
        outcome: event.evaluation.outcome === 'invalid' ? 'invalid' : event.evaluation.outcome === 'unanswered' ? 'incorrect' : event.evaluation.outcome,
        rating: event.type === 'scheduled-review' ? event.rating : null,
      });
    }
    const dueOf = (itemId: ItemId): Timestamp | null => {
      const state = rt.states().get(itemId);
      return state && state.state !== 'new' ? state.dueAt : null;
    };
    const list = [...items].map(([itemId, value]) => ({ itemId, content: value.content, results: value.results, dueAt: dueOf(itemId) }));
    const nextReviews = list
      .flatMap((item) => (item.dueAt === null ? [] : [{ itemId: item.itemId, dueAt: item.dueAt }]))
      .sort((a, b) => a.dueAt - b.dueAt);
    return { recorded, items: list, nextReviews };
  };

  const idle = async (): Promise<void> => {
    let seen: Promise<unknown>;
    do {
      seen = queue;
      await seen;
    } while (seen !== queue);
  };

  const owner = getOwner();
  const ready = start().catch((error: unknown) => fail(error, null));

  /** After a reset in another tab every action does nothing. */
  const guarded = Object.fromEntries(
    Object.entries(actions).map(([name, action]) => [name, (...args: unknown[]) => (stopped ? undefined : (action as (...rest: unknown[]) => void)(...args))]),
  ) as unknown as LearningSessionActions;

  return {
    view,
    actions: guarded,
    summary,
    card() {
      const entry = current();
      if (!entry || view.state === 'feedback' || view.state === 'finished') return null;
      return { itemId: entry.itemId, intent: entry.intent, reason: entry.reason, canClaimKnown: claimAvailable(entry) };
    },
    sessionId: () => session?.id ?? null,
    ready: ready.then(idle),
    idle,
  };
};

export type { ExerciseSelection, Hint, Rating, AttemptAction, SessionScope, SessionMode, LearningEvent };
