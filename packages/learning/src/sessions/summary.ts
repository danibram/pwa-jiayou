import { voidedEventIds } from '../scheduler/index.ts';
import type { ContentReference, ItemId, LearningEvent, Rating, SchedulerState, Timestamp, ValidEvaluation, InvalidEvaluation } from '../types.ts';

/** What an event of the session wrote. Exposures are lessons; the rest are answers. */
export type RecordedKind = 'scheduled-review' | 'practice' | 'invalid-attempt' | 'exposure';

/** The first-attempt outcome as the learner sees it. "No lo sé" (`unanswered`) reads as `incorrect`. */
export type AnswerOutcome = 'correct' | 'partial' | 'incorrect' | 'invalid';

export const answerOutcome = (evaluation: ValidEvaluation | InvalidEvaluation): AnswerOutcome =>
  evaluation.outcome === 'unanswered' ? 'incorrect' : evaluation.outcome;

export interface SessionItemResult {
  itemId: ItemId;
  content: ContentReference;
  /** Answers in the order given; voided ones are left out. */
  results: readonly { recorded: Exclude<RecordedKind, 'exposure'>; outcome: AnswerOutcome; rating: Rating | null }[];
  /** The item's next due time after the session, or null while it has no rating. */
  dueAt: Timestamp | null;
  /** The session taught it: a lesson, not a "Ya la sé" claim. A lesson shown twice still counts once. */
  taught: boolean;
}

export interface SessionSummary {
  /** Events this session wrote that still count, by type. */
  recorded: Record<RecordedKind, number>;
  /** "Ya la sé" claims among the session's exposures. */
  alreadyKnown: number;
  items: readonly SessionItemResult[];
  /** Items of the session with a due time, soonest first. */
  nextReviews: readonly { itemId: ItemId; dueAt: Timestamp }[];
}

const emptyCounts = (): Record<RecordedKind, number> => ({ 'scheduled-review': 0, practice: 0, 'invalid-attempt': 0, exposure: 0 });

export const EMPTY_SESSION_SUMMARY: SessionSummary = { recorded: emptyCounts(), alreadyKnown: 0, items: [], nextReviews: [] };

/**
 * What one session wrote that still counts, per item, with each item's next due time from `states`.
 * Reads the whole log because a void may come from a later session.
 */
export const summarizeSession = (
  events: readonly LearningEvent[],
  sessionId: string,
  states: ReadonlyMap<ItemId, SchedulerState>,
): SessionSummary => {
  const recorded = emptyCounts();
  const voided = voidedEventIds(events);
  const own = events.filter((event) => event.sessionId === sessionId).sort((a, b) => a.sequence - b.sequence);
  let alreadyKnown = 0;
  const items = new Map<ItemId, { content: ContentReference; results: SessionItemResult['results'][number][]; taught: boolean }>();
  for (const event of own) {
    if (event.type === 'attempt-voided' || voided.has(event.id)) continue;
    recorded[event.type] += 1;
    const entry = items.get(event.itemId) ?? { content: event.content, results: [], taught: false };
    items.set(event.itemId, entry);
    if (event.type === 'exposure') {
      if (event.card.reason === 'already-known') alreadyKnown += 1;
      else if (event.card.reason === 'teaching') entry.taught = true;
      continue;
    }
    entry.results.push({
      recorded: event.type,
      outcome: answerOutcome(event.evaluation),
      rating: event.type === 'scheduled-review' ? event.rating : null,
    });
  }
  const dueOf = (itemId: ItemId): Timestamp | null => {
    const state = states.get(itemId);
    return state && state.state !== 'new' ? state.dueAt : null;
  };
  const list = [...items].map(([itemId, value]) => ({ itemId, content: value.content, results: value.results, dueAt: dueOf(itemId), taught: value.taught }));
  const nextReviews = list
    .flatMap((item) => (item.dueAt === null ? [] : [{ itemId: item.itemId, dueAt: item.dueAt }]))
    .sort((a, b) => a.dueAt - b.dueAt);
  return { recorded, alreadyKnown, items: list, nextReviews };
};
