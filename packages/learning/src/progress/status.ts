import { effectiveItemEvents, isMastered, isWeak } from '../scheduler/index.ts';
import type { ItemId, LearningEvent, LocalDay, SchedulerState } from '../types.ts';

/**
 * Where an item stands for the learner:
 * - `new`: never taught;
 * - `learning`: taught and waiting for its first rating, or in a learning or relearning step;
 * - `review`: rated and spaced out;
 * - `weak`: a scheduled Again in the last 30 days not yet followed by two passes (`isWeak`);
 * - `mastered`: stability past `STUDY_RULES.masteredStabilityDays`.
 */
export type ItemStatus = 'new' | 'learning' | 'review' | 'weak' | 'mastered';

export const itemStatus = (itemId: ItemId, state: SchedulerState | undefined, itemEvents: readonly LearningEvent[], today: LocalDay): ItemStatus => {
  if (state && state.state !== 'new') {
    if (isWeak(itemEvents, itemId, today)) return 'weak';
    if (isMastered(state)) return 'mastered';
    return state.state === 'review' ? 'review' : 'learning';
  }
  if (state?.eligibleFrom) return 'learning';
  const taught = effectiveItemEvents(itemEvents, itemId).some((event) => event.type === 'exposure' && event.card.reason === 'teaching');
  return taught ? 'learning' : 'new';
};

/** The three statuses Home and the word list show: weak and review words are still learning. */
export const studyStatusOf = (status: ItemStatus): 'new' | 'learning' | 'mastered' =>
  status === 'new' ? 'new' : status === 'mastered' ? 'mastered' : 'learning';
