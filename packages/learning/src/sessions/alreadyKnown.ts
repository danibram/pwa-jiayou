import { itemKind } from '../items.ts';
import { STUDY_RULES, type CardIntent, type CardReason, type ItemId, type LearningEvent, type LocalDay } from '../types.ts';

/** "Ya la sé" claims on `day`, each an `already-known` exposure. Exposures are never voided. */
export const alreadyKnownClaimsOn = (events: readonly LearningEvent[], day: LocalDay): number =>
  events.filter((event) => event.type === 'exposure' && event.card.reason === 'already-known' && event.localDay === day).length;

/** "Ya la sé" fits only the first teaching of a word, never a reteach or a character. */
export const isClaimable = (card: { itemId: ItemId; intent: CardIntent; reason: CardReason }): boolean =>
  card.intent === 'teach' && card.reason === 'new' && itemKind(card.itemId) === 'word-meaning';

/** A claimable card while the day's claims stay under `STUDY_RULES.alreadyKnownPerDay`. */
export const canClaimKnown = (card: { itemId: ItemId; intent: CardIntent; reason: CardReason }, claimsToday: number): boolean =>
  isClaimable(card) && claimsToday < STUDY_RULES.alreadyKnownPerDay;
