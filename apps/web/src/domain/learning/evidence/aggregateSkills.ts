import { REPLAY_ORDER, type LearningEvent, type SkillAggregate } from '../types';

type AttemptEvent = Extract<LearningEvent, { type: 'practice' | 'scheduled-review' | 'invalid-attempt' }>;

const compare = (a: string | number, b: string | number): number => (a < b ? -1 : a > b ? 1 : 0);

const byReplayOrder = (a: LearningEvent, b: LearningEvent): number => {
  for (const key of REPLAY_ORDER) {
    const order = compare(a[key], b[key]);
    if (order !== 0) return order;
  }
  return 0;
};

const isAttempt = (event: LearningEvent): event is AttemptEvent =>
  event.type === 'practice' || event.type === 'scheduled-review' || event.type === 'invalid-attempt';

/**
 * Per item and skill, from the evidence of attempt events that no `attempt-voided` targets.
 * Computed on demand and never stored. The latest observation is the one with the highest
 * `recordedAt`, ties broken by replay order. Sorted by item id, then skill, by code unit.
 */
export const aggregateSkills = (events: readonly LearningEvent[]): SkillAggregate[] => {
  const voided = new Set<string>();
  for (const event of events) if (event.type === 'attempt-voided') voided.add(event.targetEventId);

  const attempts = events.filter((event): event is AttemptEvent => isAttempt(event) && !voided.has(event.id));
  attempts.sort(byReplayOrder);

  const aggregates = new Map<string, SkillAggregate>();
  for (const event of attempts) {
    for (const evidence of event.evidence) {
      const key = `${event.itemId}\u0000${evidence.skill}`;
      const correct = evidence.evaluation.outcome === 'correct' ? 1 : 0;
      const current = aggregates.get(key);
      if (!current) {
        aggregates.set(key, {
          itemId: event.itemId,
          skill: evidence.skill,
          observations: 1,
          correct,
          lastObservedAt: evidence.recordedAt,
          lastOutcome: evidence.evaluation.outcome,
        });
        continue;
      }
      // Events arrive in replay order, so an equal timestamp later in the loop is the later one.
      const latest = evidence.recordedAt >= current.lastObservedAt;
      aggregates.set(key, {
        ...current,
        observations: current.observations + 1,
        correct: current.correct + correct,
        lastObservedAt: latest ? evidence.recordedAt : current.lastObservedAt,
        lastOutcome: latest ? evidence.evaluation.outcome : current.lastOutcome,
      });
    }
  }

  return [...aggregates.values()].sort((a, b) => compare(a.itemId, b.itemId) || compare(a.skill, b.skill));
};
