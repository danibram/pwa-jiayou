/** What a session counts. Palabra is feminine and carácter masculine, and the copy must agree. */
export type NounKind = 'word' | 'char';

const NOUNS: Record<NounKind, { one: string; many: string; feminine: boolean }> = {
  word: { one: 'palabra', many: 'palabras', feminine: true },
  char: { one: 'carácter', many: 'caracteres', feminine: false },
};

/** "1 palabra", "3 caracteres". */
export const countNoun = (n: number, kind: NounKind): string => `${n} ${n === 1 ? NOUNS[kind].one : NOUNS[kind].many}`;

/** The object pronoun for n items: "la acertaste", "los acertaste". */
export const pronoun = (n: number, kind: NounKind): string => {
  const feminine = NOUNS[kind].feminine;
  return n === 1 ? (feminine ? 'la' : 'lo') : feminine ? 'las' : 'los';
};

/** Picks the ending that agrees with the noun: agree(n, kind, 'recuperad') gives "recuperadas" or "recuperado". */
export const agree = (n: number, kind: NounKind, stem: string): string =>
  `${stem}${NOUNS[kind].feminine ? 'a' : 'o'}${n === 1 ? '' : 's'}`;
