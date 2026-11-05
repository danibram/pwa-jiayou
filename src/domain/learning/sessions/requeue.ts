import type { ItemId } from '../types';
import { summarize } from './counts';
import type { PlannedCard, SessionPlan } from './types';

/** Cards an Again added for the item: requeued practice and teach-again pairs. */
const addedFor = (cards: readonly PlannedCard[], itemId?: ItemId) =>
  cards.filter((card) => (itemId === undefined || card.itemId === itemId) && (card.reason === 'requeue' || card.reason === 'teach-again'));

/** Requeues already made for the item: each requeued practice is one, each teach-again pair is one. */
const requeuesFor = (cards: readonly PlannedCard[], itemId: ItemId) =>
  addedFor(cards, itemId).filter((card) => card.reason === 'requeue' || card.intent === 'teach').length;

const insertAt = (cards: readonly PlannedCard[], at: number, card: PlannedCard): PlannedCard[] => {
  const index = Math.min(at, cards.length);
  return [...cards.slice(0, index), card, ...cards.slice(index)];
};

const withCards = (plan: SessionPlan, cards: PlannedCard[]): SessionPlan => ({
  ...plan,
  cards,
  counts: { ...plan.counts, ...summarize(cards) },
});

const cardAt = (plan: SessionPlan, position: number, itemId: ItemId): PlannedCard => {
  const card = plan.cards[position];
  if (!card || card.itemId !== itemId) throw new Error(`No card for ${itemId} at position ${position}`);
  return card;
};

/**
 * After Again on the card at `position`. The item comes back `requeueGap` cards later as practice.
 * A failed first practice after teaching (P1) or a failed "Ya la sé" brings a teach card instead,
 * with its practice `requeueGap` cards after it. Insert positions clamp to the end of the plan.
 *
 * Counts come from the cards themselves, so a reloaded plan keeps its bounds. Past `requeuesPerItem`
 * for the item, or when the cards would pass `requeueLimit` for the session, it returns `plan` itself.
 * A likely-known check that fails adds nothing: the item waits for a normal session as a new item.
 */
export const requeueAfterAgain = (plan: SessionPlan, position: number, itemId: ItemId): SessionPlan => {
  const card = cardAt(plan, position, itemId);
  if (card.intent === 'teach') throw new Error('A teach card is not answered');
  if (card.intent === 'already-known-check' && card.reason === 'likely-known') return plan;

  const { requeueGap, requeueLimit, requeuesPerItem } = plan.limits;
  const reteach =
    (card.intent === 'practice' && (card.reason === 'new-practice' || card.reason === 'teach-again')) ||
    card.intent === 'already-known-check';
  const adding = reteach ? 2 : 1;
  if (requeuesFor(plan.cards, itemId) >= requeuesPerItem) return plan;
  if (addedFor(plan.cards).length + adding > requeueLimit) return plan;

  const teachAt = position + 1 + requeueGap;
  if (!reteach) return withCards(plan, insertAt(plan.cards, teachAt, { itemId, intent: 'practice', reason: 'requeue' }));
  const withTeach = insertAt(plan.cards, teachAt, { itemId, intent: 'teach', reason: 'teach-again' });
  const placed = Math.min(teachAt, plan.cards.length);
  return withCards(plan, insertAt(withTeach, placed + 1 + requeueGap, { itemId, intent: 'practice', reason: 'teach-again' }));
};

/**
 * "Ya la sé" on the teach card at `position` (P4): it becomes an already-known check and the practice
 * planned for it leaves the session. A first teaching it replaces no longer spends the budget.
 */
export const markAlreadyKnown = (plan: SessionPlan, position: number, itemId: ItemId): SessionPlan => {
  const card = cardAt(plan, position, itemId);
  if (card.intent !== 'teach' || card.reason === 'teach-again') throw new Error('Only a planned teach card can be claimed as known');
  const paired = plan.cards.findIndex((other, index) => index > position && other.itemId === itemId && other.reason === 'new-practice');
  const cards = plan.cards
    .map((other, index) => (index === position ? { itemId, intent: 'already-known-check' as const, reason: 'claimed-known' as const } : other))
    .filter((_, index) => index !== paired);
  const freed = card.reason === 'new' ? 1 : 0;
  const next = withCards(plan, cards);
  return { ...next, counts: { ...next.counts, newItems: plan.counts.newItems - freed, newLeftAfter: plan.counts.newLeftAfter + freed } };
};
