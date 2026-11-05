import type { PlannedCard, SessionCounts } from './types.ts';

/** Card totals by intent. Every card is one unit of work, a teaching card too. */
export const summarize = (
  cards: readonly PlannedCard[],
): Pick<SessionCounts, 'cards' | 'scheduled' | 'teach' | 'practice' | 'alreadyKnownCheck'> => {
  const out = { cards: cards.length, scheduled: 0, teach: 0, practice: 0, alreadyKnownCheck: 0 };
  for (const card of cards) {
    if (card.intent === 'scheduled') out.scheduled += 1;
    else if (card.intent === 'teach') out.teach += 1;
    else if (card.intent === 'practice') out.practice += 1;
    else out.alreadyKnownCheck += 1;
  }
  return out;
};
