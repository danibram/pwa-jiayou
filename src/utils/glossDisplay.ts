/**
 * Dictionary glosses carry notes meant for lexicographers: "(clas. libros)", "(simplificado de 後)",
 * "(cant.) este". These helpers turn them into Spanish a learner can read on a card.
 */

const senses = (text: string) =>
  text.split(/[;；]/).map((sense) => sense.trim()).filter(Boolean);

const cleanSense = (sense: string): string =>
  sense
    // "(simplificado de 後) detrás" and "(variante de X)" say nothing about the meaning.
    .replace(/\((?:simplificado|variante|forma antigua|tradicional) de [^)]*\)\s*/gi, '')
    // "(clas. libros)" and "clasif. (árboles)" read as "clasificador de libros".
    .replace(/^\(\s*clas(?:if)?\.\s*([^)]*)\)$/i, 'clasificador de $1')
    .replace(/^clas(?:if)?\.\s*\(([^)]*)\)$/i, 'clasificador de $1')
    .replace(/^clas(?:if)?\.(?=\s|$)/i, 'clasificador')
    .trim();

/** A sense only for Cantonese or a bare note in brackets is not something to learn here. */
const dropSense = (sense: string) => /^\(cant\.\)/i.test(sense) || /^\([^)]*\)$/.test(sense);

/**
 * The gloss as a learner should read it, senses joined with "; ".
 * Classifier senses go last, so the headline is the meaning when the character has one.
 */
export const displayGloss = (text: string): string => {
  const kept = senses(text)
    .filter((sense) => !/^\(cant\.\)/i.test(sense))
    .map(cleanSense)
    .filter((sense) => sense && !dropSense(sense));
  const isClassifier = (sense: string) => /^clasificador\b/i.test(sense);
  const ordered = [...kept.filter((sense) => !isClassifier(sense)), ...kept.filter(isClassifier)];
  return [...new Set(ordered)].join('; ');
};

/** The first sense of the cleaned gloss, for a headline or a tile. */
export const glossHead = (text: string): string => senses(displayGloss(text))[0] ?? text.trim();
