/** An immutable revision of one published word or character. */
export interface ContentReference {
  contentId: string;
  contentRevision: string;
}

/**
 * Derived from the content id, so every device names an item the same way. A word's content id is
 * its published `id`; a character's is `char-` and its code point in hex (`content/revision.ts`).
 */
export type ItemId = `word-meaning:${string}` | `character-writing:char-${string}`;

export type LearningItem =
  | { id: `word-meaning:${string}`; kind: 'word-meaning'; content: ContentReference }
  | { id: `character-writing:char-${string}`; kind: 'character-writing'; content: ContentReference };

export type Skill = 'meaning' | 'production' | 'listening' | 'tones' | 'writing' | 'context';
export type Rating = 'again' | 'hard' | 'good' | 'easy';
/** Epoch milliseconds. The caller supplies all times. */
export type Timestamp = number;
/**
 * The device's local calendar day when the event was written, as "2026-11-05". Same rule as the
 * current app's `dayKey`: `toLocaleDateString('sv-SE')`, so a day starts at local midnight.
 */
export type LocalDay = `${number}-${number}-${number}`;

/** ts-fsrs `StepUnit`: minutes, hours or days. */
export type StepUnit = `${number}${'m' | 'h' | 'd'}`;

export interface SchedulerConfig {
  algorithm: 'fsrs';
  modelVersion: 'FSRS-7';
  /** A config for another package version is rejected; upgrading is an explicit rebuild of every item. */
  packageVersion: '6.0.0';
  /** `weights` in ts-fsrs `DefaultSchedulerOptions`. FSRS-7 takes exactly 34. */
  parameters: readonly number[];
  /** A scalar, as `DefaultScheduler` takes it. Per-rating retention would need `defineScheduler`. */
  desiredRetention: number;
  maximumIntervalDays: number;
  /** Replay and backup merge depend on it staying off. */
  enableFuzz: false;
  enableShortTerm: boolean;
  learningSteps: readonly StepUnit[];
  relearningSteps: readonly StepUnit[];
  graduatingInterval: number;
  /** `DefaultScheduler` forces it on for FSRS-7. */
  fractionalDays: true;
  clearStatsOnForget: boolean;
  allowModelOverride: boolean;
}

/** SHA-256 hex of the config's canonical JSON (sorted keys, undefined dropped). Equal configs share an id. */
export type ConfigId = `scheduler-config:sha256:${string}`;

/** Stored once; states and scheduled reviews cite it by `id`. */
export interface StoredSchedulerConfig {
  id: ConfigId;
  config: SchedulerConfig;
}

/**
 * ts-fsrs `State` (0 New, 1 Learning, 2 Review, 3 Relearning). It is the only status kept: with the
 * default middlewares the library's `scheduleStatus` is a function of it (new → new, learning and
 * relearning → learning, review → review), so the adapter derives it on restore.
 */
export type FsrsState = 'new' | 'learning' | 'review' | 'relearning';

/**
 * Derived cache of one item's FSRS card, rebuilt by replaying the item's non-voided scheduled
 * reviews. Field names follow ts-fsrs 6.0.0 `DefaultSchedulerCard`; dates are epoch ms and
 * `cardId` is `itemId`.
 */
export type SchedulerState =
  | {
      schemaVersion: 1;
      itemId: ItemId;
      configId: ConfigId;
      state: 'new';
      /**
       * A word becomes eligible for its first rating the local day after the first non-voided
       * teaching exposure followed by a correct practice answer. Null until then.
       */
      eligibleFrom: LocalDay | null;
    }
  | {
      schemaVersion: 1;
      itemId: ItemId;
      /** The config of the last scheduled review applied. */
      configId: ConfigId;
      state: Exclude<FsrsState, 'new'>;
      dueAt: Timestamp;
      lastReviewAt: Timestamp;
      stability: number;
      stabilityFast: number;
      difficulty: number;
      /** Rounded to 6 decimals by the adapter: engines disagree in the last digits. Never compared for equality. */
      scheduledDays: number;
      reps: number;
      lapses: number;
      learningStep: number;
    };

export type ValidEvaluation =
  | { outcome: 'correct' }
  | { outcome: 'partial'; missing: readonly string[] }
  | { outcome: 'incorrect' }
  | { outcome: 'unanswered' };
export type InvalidEvaluation = {
  outcome: 'invalid';
  /** `content-changed`: a resumed attempt whose content revision is no longer the current one. */
  reason: 'technical-error' | 'ambiguous-question' | 'content-changed' | 'other';
};
export type Evaluation = ValidEvaluation | InvalidEvaluation;

/**
 * `revealsAnswer` is set by whoever builds the exercise: the length of a word (`askGloss`) does not
 * give the answer away, the pinyin on a listening card does.
 */
export interface Hint {
  kind: 'pinyin' | 'audio' | 'length' | 'answer' | 'other';
  revealsAnswer: boolean;
  value?: string;
}

/** What the exercise shows before the answer. */
export type Cue = 'characters' | 'gloss' | 'audio';

/** Device speech synthesis (`speakWord`): no recording and no revision, only what it was asked to say. */
export interface SpeechAudio {
  source: 'speech-synthesis';
  hanzi: string;
  pinyin: string;
}

/** The answer as the card showed it, so a reload does not rebuild it from newer content. */
export interface RevealedAnswer {
  characters: string;
  pinyin: string;
  meaning: string;
}

export interface Exercise {
  id: string;
  skill: Skill;
  format: 'free-recall' | 'multiple-choice' | 'writing' | 'other';
  /** Strokes only: watching and tracing show the character, memory does not. Only memory rates. */
  stage?: 'watch' | 'trace' | 'memory';
  /** Self-assessment: the learner reveals the answer and rates. Automatic: the evaluator decides. */
  grading: 'self-assessment' | 'automatic';
  cue: Cue;
  prompt: string;
  options: readonly { id: string; text: string; contentId?: string | null }[];
  context: string | null;
  audio: SpeechAudio | null;
  answer: RevealedAnswer | null;
  /** Immutable reference to the accepted answers or assessment rubric. */
  rubric: { id: string; revision: string };
}

/** A teaching card or an "already known" claim: shown, not answered. */
export interface ExposureCard {
  id: string;
  reason: 'teaching' | 'already-known';
  answer: RevealedAnswer;
  audio: SpeechAudio | null;
}

/**
 * Ordered interaction records retain answers made before a hint or retry. Their timestamps are
 * kept for metrics and never set the rating.
 */
export type AttemptAction =
  | { type: 'answer'; at: Timestamp; answer: string | null; selectedOptionId: string | null; evaluation: Evaluation }
  | { type: 'hint'; at: Timestamp; hint: Hint }
  | { type: 'reveal'; at: Timestamp }
  | { type: 'self-assessment'; at: Timestamp; rating: Rating }
  /** A stroke drawing from memory, with the mistakes the stroke checker counted. */
  | { type: 'drawing'; at: Timestamp; mistakes: number; evaluation: ValidEvaluation };

/**
 * Writing from memory: no mistakes is Good, one or two is Hard with a correct recall, three or more
 * or any hint is Again.
 */
export const WRITING_FROM_MEMORY = { goodMaxMistakes: 0, hardMaxMistakes: 2, hintRating: 'again' } as const;

/**
 * The flow that wrote an event, from the current screens: Hoy, Más palabras, a topic, Flojos,
 * Repasar todo, one word from its page, and strokes. Weak, mastered and load rules replay from it.
 */
export type SessionMode = 'today' | 'more-words' | 'topic' | 'weak' | 'review-all' | 'word' | 'strokes';

/** Whether a mode may write scheduled reviews for eligible items. Flojos is practice only. */
export const SESSION_MODE_RATES = {
  today: true,
  'more-words': true,
  topic: true,
  weak: false,
  'review-all': true,
  word: true,
  strokes: true,
} as const satisfies Record<SessionMode, boolean>;

/** Study rules from "Decisiones de estudio" in docs/learning-system.md. */
export const STUDY_RULES = {
  /** A scheduled Again in the last 30 local days makes a word weak... */
  weakWindowDays: 30,
  /** ...until this many correct scheduled reviews in a row follow it. */
  weakRecoveryStreak: 2,
  masteredStabilityDays: 21,
  /** No more new words while this many items fall due in the next 24 hours. */
  tomorrowLoadLimit: 60,
  tomorrowWindowMs: 86_400_000,
  /** After Again, the word comes back this many cards later, as practice. */
  requeueGap: 4,
} as const;

/** One observation inside an attempt event; the item, content and attempt are the event's. */
export interface SkillEvidence {
  id: string;
  skill: Skill;
  recordedAt: Timestamp;
  evaluation: ValidEvaluation;
  /** A hint that gave the answer away came before the first answer (any hint, for writing). */
  assisted: boolean;
  /** Wrong options selected, in order, with the content each showed. */
  confusions: readonly { optionId: string; contentId: string | null }[];
  /** Stroke mistakes on the first drawing; null without a drawing. */
  mistakes: number | null;
}

/** Computed on the fly from the evidence of non-voided events. Not persisted. */
export interface SkillAggregate {
  itemId: ItemId;
  skill: Skill;
  observations: number;
  correct: number;
  lastObservedAt: Timestamp;
  lastOutcome: ValidEvaluation['outcome'];
}

interface EventBase {
  schemaVersion: 1;
  /**
   * Globally unique. An attempt event's id is generated when the attempt opens and kept on
   * `SessionAttempt`, so a retried write reuses it.
   */
  id: string;
  sessionId: string;
  sessionMode: SessionMode;
  /** One id per installation. */
  deviceId: string;
  /** Per-device counter that never repeats or goes back, across transactions and sessions. */
  sequence: number;
  occurredAt: Timestamp;
  /** Written with the event, so budgets do not move when the device changes time zone. */
  localDay: LocalDay;
}

interface AttemptEvent extends EventBase {
  itemId: ItemId;
  /** At most one attempt event per attempt id. A second one in a log is corruption. */
  attemptId: string;
  content: ContentReference;
  exercise: Exercise;
  evaluatorVersion: string;
  actions: readonly AttemptAction[];
  evidence: readonly SkillEvidence[];
}

/**
 * Hard, Good and Easy need a correct recall. Again takes any valid outcome, as when a hint gave the
 * answer away. The types do not check the actions against the rating: the evaluator (phase 1B) and
 * backup import do.
 */
export type ScheduledRating =
  | { basis: 'due'; rating: 'again'; evaluation: ValidEvaluation }
  | { basis: 'due'; rating: 'hard' | 'good' | 'easy'; evaluation: { outcome: 'correct' } }
  /**
   * "Ya la sé": the one rating allowed without waiting a day after teaching. Only a correct answer
   * is written this way, as Good; a miss is practice and the word follows the normal path.
   */
  | { basis: 'already-known'; rating: 'good'; evaluation: { outcome: 'correct' } };

/** Event IDs are idempotency keys. Events are append-only. */
export type LearningEvent =
  | (EventBase & { type: 'exposure'; itemId: ItemId; content: ContentReference; card: ExposureCard })
  | (AttemptEvent & { type: 'practice'; evaluation: ValidEvaluation })
  | (AttemptEvent & { type: 'scheduled-review'; configId: ConfigId } & ScheduledRating)
  | (AttemptEvent & { type: 'invalid-attempt'; evaluation: InvalidEvaluation })
  | (EventBase & {
      type: 'attempt-voided';
      /** Must equal the target's item id, so a merge finds the item to rebuild without the target. */
      itemId: ItemId;
      targetEventId: string;
      reason: 'user-correction' | 'content-error' | 'technical-error' | 'other';
    });

export type LearningEventType = LearningEvent['type'];
/** A void targets one of these, never an exposure or another void. */
export type VoidableEventType = Extract<LearningEventType, 'practice' | 'scheduled-review' | 'invalid-attempt'>;

/**
 * Replay order for rebuilding an item: compare these fields in turn, ascending. Numbers compare
 * as numbers, strings by code unit (`<`), never with `localeCompare`.
 */
export const REPLAY_ORDER = ['occurredAt', 'deviceId', 'sequence', 'id'] as const satisfies readonly (keyof EventBase)[];

/**
 * A copy of the log. Importing one adds its events by id and rebuilds the items they touch;
 * replacing everything with it is a separate, explicit action.
 */
export interface LearningBackup {
  schemaVersion: 1;
  exportedAt: Timestamp;
  deviceId: string;
  events: readonly LearningEvent[];
  configs: readonly StoredSchedulerConfig[];
}

/** The current review screen's prompts, from `src/utils/vocabularySession.ts`. Kept here so the domain does not import it. */
export type LegacyPrompt = 'meaning' | 'reverse' | 'listen' | 'pick' | 'hear' | 'recognize';

export interface ExerciseRole {
  /**
   * `scheduled-review` means eligible: a due item writes a scheduled review, any other item writes
   * practice. `practice` never writes a rating.
   */
  role: 'scheduled-review' | 'practice';
  skill: Skill;
  cue: Cue;
  format: Exercise['format'];
  grading: Exercise['grading'];
}

/** What each existing prompt becomes. Only free recall of the meaning from the characters can rate a word. */
export const EXERCISE_ROLES = {
  meaning: { role: 'scheduled-review', skill: 'meaning', cue: 'characters', format: 'free-recall', grading: 'self-assessment' },
  reverse: { role: 'practice', skill: 'production', cue: 'gloss', format: 'free-recall', grading: 'self-assessment' },
  listen: { role: 'practice', skill: 'listening', cue: 'audio', format: 'free-recall', grading: 'self-assessment' },
  pick: { role: 'practice', skill: 'production', cue: 'gloss', format: 'multiple-choice', grading: 'automatic' },
  hear: { role: 'practice', skill: 'listening', cue: 'audio', format: 'multiple-choice', grading: 'automatic' },
  recognize: { role: 'practice', skill: 'meaning', cue: 'characters', format: 'multiple-choice', grading: 'automatic' },
} as const satisfies Record<LegacyPrompt, ExerciseRole>;

/**
 * What a planned card asks of the learner. Package 3B turns it into an Exercise:
 * - `scheduled`: the item is pending today and the mode rates, so the card may write a scheduled review;
 * - `teach`: an exposure that shows the answer and is not answered;
 * - `practice`: answered, never rated;
 * - `already-known-check`: a recall without options right after an `already-known` exposure (P4).
 */
export type CardIntent = 'scheduled' | 'teach' | 'practice' | 'already-known-check';

/** Why the card is in the session. 3B and the summary may read it; the policy keys its bounds on it. */
export type CardReason =
  /** Learning or relearning step whose time has come. */
  | 'learning-step'
  /** Review due before the next local midnight. */
  | 'due-review'
  /** New item whose `eligibleFrom` has arrived: its first FSRS rating (P1). */
  | 'first-rating'
  /** First teaching of an item never taught. Spends the new-item budget. */
  | 'new'
  /** The practice that follows a `new` or `reteach` card. Failing it brings a reteach (P1). */
  | 'new-practice'
  /** Teaching again an item taught before that has no correct practice yet. Free. */
  | 'reteach'
  /** A practice card added `requeueGap` cards after an Again. */
  | 'requeue'
  /**
   * Added after a failed first practice (P1) or a failed "Ya la sé": a teach card and, later, its
   * practice. Failing that practice brings another pair, within the requeue limits.
   */
  | 'teach-again'
  /** An item the learner probably knows (Trazos: a character met in words). Outside the budget. */
  | 'likely-known'
  /** "Ya la sé" turned a teach card into a check. */
  | 'claimed-known'
  /** Practice on a weak item (Flojos). */
  | 'weak'
  /** Practice on a seen item that is not pending. */
  | 'seen'
  /** The one item a single-word session was opened for, when it is neither pending nor new. */
  | 'chosen';

export interface SessionAttempt {
  id: string;
  /** The id its attempt event will be written with, fixed when the attempt opens. */
  eventId: string;
  itemId: ItemId;
  content: ContentReference;
  exercise: Exercise;
  evaluatorVersion: string;
  actions: readonly AttemptAction[];
  status: 'in-progress' | 'submitted';
}

export interface SessionState {
  schemaVersion: 1;
  id: string;
  mode: SessionMode;
  status: 'active' | 'completed' | 'abandoned';
  startedAt: Timestamp;
  /** A teach card carries an exposure and no exercise; every other card carries an exercise. */
  queue: readonly {
    itemId: ItemId;
    intent: CardIntent;
    reason: CardReason;
    content: ContentReference;
    exercise: Exercise | null;
    exposure: ExposureCard | null;
    evaluatorVersion: string;
  }[];
  position: number;
  attempts: readonly SessionAttempt[];
}
