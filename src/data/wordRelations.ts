import type { VocabularyEntry } from './vocabulary';

/**
 * Curated links between catalog words. Shared characters, tone neighbors and topics
 * stay computed; these are editorial edges the learner should see on purpose.
 */
export const WORD_RELATION_KINDS = ['synonym', 'antonym', 'related', 'classifier', 'confused'] as const;

export type WordRelationKind = (typeof WORD_RELATION_KINDS)[number];

export interface WordRelation {
  kind: WordRelationKind;
  /** Target catalog word id. */
  id: string;
}

export const WORD_RELATION_LABELS: Record<WordRelationKind, string> = {
  synonym: 'Sinónimos',
  antonym: 'Antónimos',
  related: 'Relacionadas',
  classifier: 'Clasificadores',
  confused: 'Fácil de confundir',
};

export const WORD_RELATION_HINTS: Record<WordRelationKind, string> = {
  synonym: 'Mismo o muy parecido significado (大 / 巨大).',
  antonym: 'Significado opuesto (大 / 小).',
  related: 'Misma familia semántica sin ser sinónimo (医生 / 医院).',
  classifier: 'Clasificador o medida que usa esta palabra (书 → 本). Solo de la palabra al clasificador.',
  confused: 'Se parecen en escritura o sonido y se confunden al estudiar (买 / 卖).',
};

/** Synonym, antonym, related and confused should usually exist on both words. Classifier is one-way. */
export const SYMMETRIC_RELATION_KINDS = new Set<WordRelationKind>(['synonym', 'antonym', 'related', 'confused']);

export const isWordRelationKind = (value: unknown): value is WordRelationKind =>
  typeof value === 'string' && (WORD_RELATION_KINDS as readonly string[]).includes(value);

/** Compact label for review diffs: «Sinónimos: 大, 巨大 · Antónimos: 小». */
export const formatWordRelations = (
  relations: WordRelation[] | undefined,
  titleOf: (id: string) => string,
): string => {
  if (!relations?.length) return '';
  return WORD_RELATION_KINDS
    .map((kind) => {
      const ids = relations.filter((row) => row.kind === kind).map((row) => titleOf(row.id));
      return ids.length ? `${WORD_RELATION_LABELS[kind]}: ${ids.join(', ')}` : '';
    })
    .filter(Boolean)
    .join(' · ');
};

/**
 * Resolve a kind for a word: direct edges plus, for symmetric kinds, words that point back.
 * Missing reverse edges still show up so a one-sided draft remains useful in the app.
 */
export const resolveWordRelations = (
  word: VocabularyEntry,
  kind: WordRelationKind,
  byId: (id: string) => VocabularyEntry | undefined,
  all: readonly VocabularyEntry[],
): VocabularyEntry[] => {
  const seen = new Set<string>();
  const out: VocabularyEntry[] = [];
  const push = (id: string) => {
    if (id === word.id || seen.has(id)) return;
    const target = byId(id);
    if (!target) return;
    seen.add(id);
    out.push(target);
  };
  for (const row of word.relations ?? []) {
    if (row.kind === kind) push(row.id);
  }
  if (SYMMETRIC_RELATION_KINDS.has(kind)) {
    for (const other of all) {
      if (other.id === word.id) continue;
      if ((other.relations ?? []).some((row) => row.kind === kind && row.id === word.id)) push(other.id);
    }
  }
  return out;
};

export const relationGroups = (
  word: VocabularyEntry,
  byId: (id: string) => VocabularyEntry | undefined,
  all: readonly VocabularyEntry[],
): { kind: WordRelationKind; label: string; words: VocabularyEntry[] }[] =>
  WORD_RELATION_KINDS
    .map((kind) => ({
      kind,
      label: WORD_RELATION_LABELS[kind],
      words: resolveWordRelations(word, kind, byId, all),
    }))
    .filter((group) => group.words.length > 0);
