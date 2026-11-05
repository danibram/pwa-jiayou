import { describe, expect, it } from 'vitest';
import { Rating, State } from 'ts-fsrs';
import {
  createFsrsProbe,
  normalizeProbeCard,
  probeSequence,
  replayProbeSequence,
  restoreProbeCard,
  serializeProbeCard,
} from '../src/fsrsProbe.ts';

const firstReviewAt = new Date('2026-01-01T00:00:00.000Z');
const nextReviewAt = new Date('2026-01-06T00:00:00.000Z');

async function reviewedOnce() {
  const probe = await createFsrsProbe();
  return { probe, card: probe.review(probe.create(firstReviewAt, 'probe-card'), firstReviewAt).card };
}

describe('FSRS-7 probe', () => {
  it('restores a reviewed card without changing the next review', async () => {
    const { probe, card } = await reviewedOnce();
    const restored = restoreProbeCard(serializeProbeCard(card));

    expect(restored).toEqual(card);
    expect(restored.stabilityFast).toBeGreaterThan(0);
    expect(probe.review(restored, nextReviewAt)).toEqual(probe.review(card, nextReviewAt));
  });

  it('replays Good, Again, Good, Hard identically with and without storage between steps', async () => {
    const uninterrupted = replayProbeSequence(await createFsrsProbe(), probeSequence, { restoreBetweenSteps: false });
    const repeated = replayProbeSequence(await createFsrsProbe(), probeSequence, { restoreBetweenSteps: false });
    const restored = replayProbeSequence(await createFsrsProbe(), probeSequence, { restoreBetweenSteps: true });

    // scheduledDays differs in its last digits between engines, so the comparison rounds it.
    const expected = uninterrupted.cards.map(normalizeProbeCard);
    expect(repeated.cards.map(normalizeProbeCard)).toEqual(expected);
    expect(restored.cards.map(normalizeProbeCard)).toEqual(expected);
    expect(restored.revlogs.map((revlog) => revlog.rating)).toEqual([Rating.Good, Rating.Again, Rating.Good, Rating.Hard]);

    // The sequence exercises review, lapse into relearning and graduation back to review.
    expect(expected.map((card) => [card.state, card.scheduleStatus, card.lapses])).toEqual([
      [State.Review, 'review', 0],
      [State.Relearning, 'learning', 1],
      [State.Review, 'review', 1],
      [State.Review, 'review', 1],
    ]);
    // Memory is rounded to 8 decimals by FSRS-7 and matched across V8 and JavaScriptCore.
    expect(expected[0]).toMatchObject({
      stability: 3.9221,
      stabilityFast: 3.13768,
      difficulty: 3.53072398,
      dueAt: Date.parse('2026-01-05T18:39:55.164Z'),
      scheduledDays: 4.777722,
    });
  });

  it('rejects a review dated before the last review', async () => {
    const { probe, card } = await reviewedOnce();
    const earlier = new Date(firstReviewAt.getTime() - 60_000);
    expect(() => probe.review(card, earlier)).toThrow('elapsedDays must be finite and non-negative');
    expect(() => probe.review(card, new Date(firstReviewAt))).not.toThrow();
  });

  it('requires scheduleStatus on the input card', async () => {
    const { probe, card } = await reviewedOnce();
    const { scheduleStatus: _omitted, ...withoutStatus } = card;
    expect(() => probe.review(withoutStatus as typeof card, nextReviewAt)).toThrow('Expected scheduleStatus string');
  });

  it('ignores scheduleStatus when scheduling', async () => {
    const { probe, card } = await reviewedOnce();
    expect(card.state).toBe(State.Review);
    const mismatched = probe.review({ ...card, scheduleStatus: 'learning' }, nextReviewAt).card;
    const consistent = probe.review(card, nextReviewAt).card;
    expect(mismatched).toEqual(consistent);
    expect(Math.round(consistent.scheduledDays * 1e4) / 1e4).toBe(26.5359);
  });

  it('rejects an invalid stored date', async () => {
    const probe = await createFsrsProbe();
    const card = probe.create(firstReviewAt, 'probe-card');
    expect(() => restoreProbeCard(JSON.stringify({ ...card, dueAt: 'invalid' }))).toThrow('Invalid FSRS card date');
  });
});
