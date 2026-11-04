/**
 * What a word means, as data: one row per use, each with its part of speech.
 * 比 → [{ pos: 'verbo', text: 'comparar' }, { pos: 'preposición', text: 'más que' }].
 */
export const WORD_POS = [
  'sustantivo',
  'verbo',
  'adjetivo',
  'adverbio',
  'clasificador',
  'pronombre',
  'numeral',
  'preposición',
  'conjunción',
  'partícula',
  'interjección',
  /** Set phrases, greetings and idioms that work as a whole: 不客气, 一路平安. */
  'expresión',
] as const;

export type WordPos = (typeof WORD_POS)[number];

export interface WordSense {
  /** Unset only while a word waits for review in the editor. */
  pos?: WordPos;
  /** The Spanish a card can show: "reportar", "más que". No brackets, no Chinese. */
  text: string;
  /** How it is used, for the word page: "noticias", "usado con 都/也 en el patrón 连…都/也". */
  note?: string;
}

export const WORD_POS_LABELS: Record<WordPos, string> = {
  sustantivo: 'Sustantivo',
  verbo: 'Verbo',
  adjetivo: 'Adjetivo',
  adverbio: 'Adverbio',
  clasificador: 'Clasificador',
  pronombre: 'Pronombre',
  numeral: 'Numeral',
  preposición: 'Preposición',
  conjunción: 'Conjunción',
  partícula: 'Partícula',
  interjección: 'Interjección',
  expresión: 'Expresión',
};

export const isWordPos = (value: unknown): value is WordPos =>
  typeof value === 'string' && (WORD_POS as readonly string[]).includes(value);

/** The first use: what a review card, a list row or a tile shows. */
export const leadSense = (senses: readonly WordSense[]): string => senses[0]?.text ?? '';

/** Every use as one line of text, for search and accessible labels: "comparar; más que". */
export const sensesText = (senses: readonly WordSense[]): string => senses.map((sense) => sense.text).join('; ');

/** Uses grouped by part of speech, keeping their order; a part of speech that comes back later opens a new group. */
export const groupSenses = (senses: readonly WordSense[]): { pos?: WordPos; senses: WordSense[] }[] => {
  const groups: { pos?: WordPos; senses: WordSense[] }[] = [];
  for (const sense of senses) {
    const last = groups[groups.length - 1];
    if (last && last.pos === sense.pos) last.senses.push(sense);
    else groups.push({ pos: sense.pos, senses: [sense] });
  }
  return groups;
};

/** Reads `senses` from a catalog row; throws with the word in the message when a row is malformed. */
export const parseSenses = (value: unknown, word: string): WordSense[] => {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`Sin significados: ${word}`);
  return value.map((raw) => {
    const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    if (typeof row.text !== 'string' || !row.text.trim()) throw new Error(`Significado vacío: ${word}`);
    if (row.pos !== undefined && !isWordPos(row.pos)) throw new Error(`Categoría desconocida en ${word}: ${String(row.pos)}`);
    if (row.note !== undefined && (typeof row.note !== 'string' || !row.note.trim())) throw new Error(`Nota vacía: ${word}`);
    return { ...(row.pos ? { pos: row.pos as WordPos } : {}), text: row.text, ...(row.note ? { note: row.note as string } : {}) };
  });
};
