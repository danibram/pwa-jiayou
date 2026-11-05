import type { CharacterContent, WordContent } from '@jiayou/content';
import type { ProductionKind } from '../production/exercises';
import type {
  CardIntent,
  CardReason,
  ContentReference,
  Exercise,
  ExposureCard,
  ItemId,
  LegacyPrompt,
  SkillEvidence,
} from '../types';

/** The planned card this module turns into an exercise. `PlannedCard` from `../sessions` fits it. */
export interface PlannedCardInput {
  itemId: ItemId;
  intent: CardIntent;
  /** `new-practice` and `teach-again` keep a word on the supported rungs of the ladder. */
  reason: CardReason;
}

/** A word as the catalog or a parsed `VocabularyEntry` carries it. Level and topics rank distractors. */
export interface WordEntry extends WordContent {
  level?: number;
  topicIds?: readonly string[];
}

export type ItemContent =
  | { kind: 'word'; word: WordEntry }
  | { kind: 'character'; character: CharacterContent };

export interface ExerciseContext {
  /**
   * Every word the learner could answer with: the installed catalog plus custom words. Distractors
   * come from it, and so do the homophone, homograph and shared-sense checks.
   */
  vocabulary: readonly WordEntry[];
  /** Words the learner has met, by content id. They are preferred as distractors. */
  familiar?: (contentId: string) => boolean;
  /** Whether speech synthesis can speak right now. The caller checks it; this module never does. */
  speechAvailable: boolean;
  /**
   * The item's evidence from non-voided events, in any order. It sets the practice rung and
   * decides which skill practice trains.
   */
  recentEvidence: readonly SkillEvidence[];
  /** A seeded generator returning numbers in [0, 1). Every random choice here goes through it. */
  random: () => number;
}

/** The two writing stages that are answered. Watching the strokes is the teaching exposure. */
export type WritingPrompt = 'write-memory' | 'write-trace';
/** Every format a card can take: the legacy prompts, the writing stages and the typed answers. */
export type ExercisePrompt = LegacyPrompt | WritingPrompt | ProductionKind;

export type SkipReason =
  /** An audio cue while speech synthesis is unavailable. */
  | 'speech-unavailable'
  /** Fewer than two distractors survive the ambiguity filters. */
  | 'too-few-distractors'
  /** Another word sounds the same, so the audio alone does not name one word. */
  | 'homophone'
  /** Another word answers to the gloss shown, so the gloss alone does not name one word. */
  | 'shared-sense'
  /** A particle or classifier: its gloss describes grammar and cannot cue the word (P7). */
  | 'function-word';

export type ExerciseSelection =
  | {
      kind: 'exercise';
      itemId: ItemId;
      content: ContentReference;
      exercise: Exercise;
      /** The evaluator rules current when the exercise was built, as the session queue stores them. */
      evaluatorVersion: string;
      prompt: ExercisePrompt;
      /** Formats tried before the chosen one, in order, and why each was skipped. */
      skipped: readonly { prompt: ExercisePrompt; reason: SkipReason }[];
    }
  | { kind: 'exposure'; itemId: ItemId; content: ContentReference; card: ExposureCard };
