import type { VocabularyEntry } from '../data/vocabulary';
import { parseCheckpoint, type ProgressCheckpoint } from '../domain/progress/checkpoint';
import { GRADES, type Grade } from '../domain/progress/types';
import { isNonNegativeInteger, isOneOf, isRecord } from './parse';
import { KEYS, PRACTICE_SESSION_PREFIX, practiceSessionKey } from '../persistence/keys';
import { storage } from '../persistence/keyValue';

const sessionKey = (practiceId?: string) => practiceId ? practiceSessionKey(practiceId) : KEYS.wordSession;
const KINDS = ['learn', 'review', 'recall'] as const;
const STEPS = ['learn', 'seen', 'ask', 'check'] as const;
/**
 * What a card shows first: the word, its meaning, its sound, the meaning with words to pick from,
 * the sound with words to pick from (`hear`), or the word with meanings to pick from (`recognize`).
 * The last three are for words met only once or twice, so the answer is checked, not self-graded.
 */
export const PROMPTS = ['meaning', 'reverse', 'listen', 'pick', 'hear', 'recognize'] as const;
export type Prompt = typeof PROMPTS[number];

export interface VocabularySessionSnapshot {
  version: 1;
  deck: { entry: VocabularyEntry; kind: typeof KINDS[number]; prompt?: Prompt }[];
  position: number;
  revealed: boolean;
  step: typeof STEPS[number];
  feedback: Grade | null;
  counts: Record<Grade, number>;
  /** Each word's worst answer, by id. Sessions saved before it existed only have counts. */
  results?: Record<string, Grade>;
  heading: string;
  mode?: 'today' | 'practice';
  /** The records this session changed, as they were before it, so discarding can undo its answers. */
  checkpoint?: ProgressCheckpoint;
}

export function hasStoredVocabularySession(practiceId?: string): boolean {
  try { return storage.read(sessionKey(practiceId)) !== null; } catch { return false; }
}

export function loadVocabularySession(entries: VocabularyEntry[], practiceId?: string): VocabularySessionSnapshot | null {
  try {
    const raw = storage.read(sessionKey(practiceId));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) throw new Error('Invalid session');
    if (value.version !== 1) return null;
    if (value.mode !== undefined && value.mode !== 'today' && value.mode !== 'practice') throw new Error('Invalid mode');
    const known = new Map(entries.map((entry) => [entry.id, entry]));
    if (!Array.isArray(value.deck) || value.deck.length === 0) throw new Error('Invalid deck');
    const deck: VocabularySessionSnapshot['deck'] = [];
    for (const card of value.deck) {
      if (!isRecord(card) || typeof card.id !== 'string' || !isOneOf(KINDS, card.kind)) throw new Error('Invalid card');
      if (card.prompt !== undefined && !isOneOf(PROMPTS, card.prompt)) throw new Error('Invalid prompt');
      const entry = known.get(card.id);
      if (!entry) throw new Error('Unavailable entry');
      deck.push({ entry, kind: card.kind, ...(card.prompt ? { prompt: card.prompt } : {}) });
    }
    const checkpoint = value.checkpoint === undefined ? undefined : parseCheckpoint(value.checkpoint);
    if (!isNonNegativeInteger(value.position) || value.position >= deck.length || typeof value.revealed !== 'boolean' || !isOneOf(STEPS, value.step) || (value.feedback !== null && !isOneOf(GRADES, value.feedback)) || !isRecord(value.counts) || typeof value.heading !== 'string') throw new Error('Invalid session');
    const counts = { again: 0, hard: 0, good: 0 };
    for (const grade of GRADES) {
      const count = value.counts[grade];
      if (!isNonNegativeInteger(count)) throw new Error('Invalid counts');
      counts[grade] = count;
    }
    let results: Record<string, Grade> | undefined;
    if (value.results !== undefined) {
      if (!isRecord(value.results)) throw new Error('Invalid results');
      results = {};
      for (const [id, grade] of Object.entries(value.results)) {
        if (!isOneOf(GRADES, grade)) throw new Error('Invalid results');
        results[id] = grade;
      }
    }
    return { version: 1, deck, position: value.position, revealed: value.revealed, step: value.step, feedback: value.feedback, counts, ...(results ? { results } : {}), heading: value.heading, ...(value.mode ? { mode: value.mode } : {}), ...(checkpoint ? { checkpoint } : {}) };
  } catch {
    try { storage.remove(sessionKey(practiceId)); } catch { /* Storage may be unavailable. */ }
    return null;
  }
}

export function saveVocabularySession(snapshot: VocabularySessionSnapshot, practiceId?: string): boolean {
  try {
    const raw = storage.read(sessionKey(practiceId));
    if (raw) {
      const existing: unknown = JSON.parse(raw);
      if (!isRecord(existing) || existing.version !== 1) return false;
    }
    storage.write(sessionKey(practiceId), JSON.stringify({ ...snapshot, deck: snapshot.deck.map(({ entry, kind, prompt }) => ({ id: entry.id, kind, ...(prompt ? { prompt } : {}) })) }));
    return true;
  } catch { return false; }
}

export function discardVocabularySession(practiceId?: string): boolean {
  try { storage.remove(sessionKey(practiceId)); return storage.read(sessionKey(practiceId)) === null; } catch { return false; }
}

export function discardAllVocabularySessions(): boolean {
  try {
    const keys = storage.keys(KEYS.wordSession)
      .filter((key) => key === KEYS.wordSession || key.startsWith(PRACTICE_SESSION_PREFIX));
    for (const key of keys) storage.remove(key);
    return keys.every((key) => storage.read(key) === null);
  } catch { return false; }
}

/**
 * The first paused practice session that `accepts` lets through, in storage order. Unreadable ones
 * are dropped on the way, as loading them does. `entries` is read only once a session is found.
 */
export function findPausedPractice(
  entries: () => VocabularyEntry[],
  accepts: (practiceId: string) => boolean,
): { id: string; title: string } | null {
  try {
    for (const key of storage.keys(PRACTICE_SESSION_PREFIX)) {
      const id = key.slice(PRACTICE_SESSION_PREFIX.length);
      if (!accepts(id)) continue;
      const snapshot = loadVocabularySession(entries(), id);
      if (snapshot) return { id, title: snapshot.heading };
    }
  } catch { /* Storage unavailable: nothing to resume. */ }
  return null;
}
