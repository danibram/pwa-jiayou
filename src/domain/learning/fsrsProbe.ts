import { DefaultScheduler, Rating, type DefaultSchedulerCard, type Grade } from 'ts-fsrs';

/** Isolated FSRS-7 experiment. The application does not use this scheduler. */
export async function createFsrsProbe() {
  const scheduler = await DefaultScheduler({
    version: 'FSRS-7',
    desiredRetention: 0.9,
    enableFuzz: false,
    learningSteps: ['1m', '10m'],
    relearningSteps: ['10m'],
  });
  return {
    config: scheduler.config,
    create: (now: Date, cardId: string) => scheduler.newCard({ now, cardId }),
    review: (card: DefaultSchedulerCard, now: Date, grade: Grade = Rating.Good) =>
      scheduler.review({ card, grade, now }),
  };
}

export type FsrsProbe = Awaited<ReturnType<typeof createFsrsProbe>>;
export interface ProbeStep {
  grade: Grade;
  at: Date;
}

/** Good, Again, Good, Hard at explicit dates. The Again lands on a review card and causes a lapse. */
export const probeSequence: readonly ProbeStep[] = [
  { grade: Rating.Good, at: new Date('2026-01-01T00:00:00.000Z') },
  { grade: Rating.Again, at: new Date('2026-01-06T00:00:00.000Z') },
  { grade: Rating.Good, at: new Date('2026-01-06T00:15:00.000Z') },
  { grade: Rating.Hard, at: new Date('2026-01-09T00:15:00.000Z') },
];

/**
 * Applies the steps to a new card. With `restoreBetweenSteps`, every card goes through
 * JSON before the next review, as it would when stored between sessions.
 */
export function replayProbeSequence(
  probe: FsrsProbe,
  steps: readonly ProbeStep[],
  { restoreBetweenSteps }: { restoreBetweenSteps: boolean },
) {
  const first = steps[0];
  if (!first) throw new Error('Probe sequence is empty');
  let card = probe.create(first.at, 'probe-card');
  const cards: DefaultSchedulerCard[] = [];
  const revlogs: ReturnType<FsrsProbe['review']>['revlog'][] = [];
  for (const step of steps) {
    if (restoreBetweenSteps) card = restoreProbeCard(serializeProbeCard(card));
    const result = probe.review(card, step.at, step.grade);
    cards.push(result.card);
    revlogs.push(result.revlog);
    card = result.card;
  }
  return { cards, revlogs };
}

/**
 * `scheduledDays` is the raw interval from FSRS-7's solver and its last digits differ between
 * JavaScript engines. The library never reads it back, so comparisons round it.
 */
export function normalizeProbeCard(card: DefaultSchedulerCard) {
  return {
    ...card,
    dueAt: card.dueAt.getTime(),
    lastReviewAt: card.lastReviewAt?.getTime() ?? null,
    scheduledDays: Math.round(card.scheduledDays * 1e6) / 1e6,
  };
}

export function serializeProbeCard(card: DefaultSchedulerCard): string {
  return JSON.stringify(card);
}

// This helper only restores cards produced by this probe. It is not an input validator.
export function restoreProbeCard(serialized: string): DefaultSchedulerCard {
  const card = JSON.parse(serialized) as DefaultSchedulerCard;
  const dueAt = new Date(card.dueAt);
  const lastReviewAt = card.lastReviewAt === null ? null : new Date(card.lastReviewAt);
  if (Number.isNaN(dueAt.getTime()) || (lastReviewAt && Number.isNaN(lastReviewAt.getTime()))) {
    throw new Error('Invalid FSRS card date');
  }
  return { ...card, dueAt, lastReviewAt };
}
