import type { HSKCharacter, HskLevel, ReviewPool } from '../types';
import { GRADES, type Grade } from '../stores/progressStore';
import { isHskLevel, isNonNegativeInteger, isOneOf, isRecord } from './parse';

export type CardKind = 'learn' | 'quiz' | 'write' | 'retry';
export type NewStep = 'learn' | 'seen' | 'ask' | 'check';

const CARD_KINDS = ['learn', 'quiz', 'write', 'retry'] as const satisfies readonly CardKind[];
const NEW_STEPS = ['learn', 'seen', 'ask', 'check'] as const satisfies readonly NewStep[];
const POOLS = ['today', 'more', 'all'] as const satisfies readonly ReviewPool[];

export interface SessionCard {
  char: HSKCharacter;
  kind: CardKind;
}

export interface SessionSnapshot {
  version: 1;
  pool: ReviewPool;
  /** Null when an older save did not record the levels. Resume must leave the current selection alone. */
  selectedLevels: HskLevel[] | null;
  deck: SessionCard[];
  position: number;
  revealed: boolean;
  step: NewStep;
  feedback: Grade | null;
  counts: Record<Grade, number>;
  missed: HSKCharacter[];
  seen: HSKCharacter[];
  taught: HSKCharacter[];
  heading: string;
  writeState: { done: number; total: number; mistakes: number; hint: boolean };
}

const KEY = 'jiayou-session-v1';

export function hasStoredSession(): boolean {
  try { return localStorage.getItem(KEY) !== null; } catch { return false; }
}

const byCharacter = (characters: HSKCharacter[]) =>
  new Map(characters.map((char) => [char.character, char]));

const parseChars = (value: unknown, characters: Map<string, HSKCharacter>): HSKCharacter[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const found: HSKCharacter[] = [];
  for (const id of value) {
    if (typeof id !== 'string') return undefined;
    const char = characters.get(id);
    if (!char) return undefined;
    found.push(char);
  }
  return found;
};

const parseDeck = (value: unknown, characters: Map<string, HSKCharacter>): SessionCard[] | undefined => {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const deck: SessionCard[] = [];
  for (const card of value) {
    if (!isRecord(card) || typeof card.character !== 'string' || !isOneOf(CARD_KINDS, card.kind)) return undefined;
    const char = characters.get(card.character);
    if (!char) return undefined;
    deck.push({ char, kind: card.kind });
  }
  return deck;
};

const parseLevels = (value: unknown, available: ReadonlySet<HskLevel>): HskLevel[] | undefined => {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const levels: HskLevel[] = [];
  for (const level of value) {
    if (!isHskLevel(level) || !available.has(level)) return undefined;
    levels.push(level);
  }
  return levels;
};

const parseCounts = (value: unknown): Record<Grade, number> | undefined => {
  if (!isRecord(value)) return undefined;
  const counts = { again: 0, hard: 0, good: 0 };
  for (const grade of GRADES) {
    const count = value[grade];
    if (!isNonNegativeInteger(count)) return undefined;
    counts[grade] = count;
  }
  return counts;
};

const parseWriteState = (value: unknown): SessionSnapshot['writeState'] | undefined => {
  if (!isRecord(value)) return undefined;
  const { done, total, mistakes, hint } = value;
  if (!isNonNegativeInteger(done) || !isNonNegativeInteger(total) || !isNonNegativeInteger(mistakes) || typeof hint !== 'boolean') {
    return undefined;
  }
  return { done, total, mistakes, hint };
};

const readSession = (parsed: Record<string, unknown>, characters: HSKCharacter[]): SessionSnapshot | undefined => {
  if (!isOneOf(POOLS, parsed.pool)) return undefined;
  const known = byCharacter(characters);
  const deck = parseDeck(parsed.deck, known);
  if (!deck) return undefined;
  const available = new Set<HskLevel>(characters.map((char) => char.hsk_level));
  const selectedLevels = Array.isArray(parsed.selectedLevels)
    ? parseLevels(parsed.selectedLevels, available) ?? null
    : null;
  const missed = parseChars(parsed.missed, known);
  const seen = parseChars(parsed.seen, known);
  const taught = parseChars(parsed.taught, known);
  const counts = parseCounts(parsed.counts);
  const writeState = parseWriteState(parsed.writeState);
  const feedback = parsed.feedback;
  if (Array.isArray(parsed.selectedLevels) && !selectedLevels) return undefined;
  if (!missed || !seen || !taught || !counts || !writeState) return undefined;
  if (!isNonNegativeInteger(parsed.position) || parsed.position >= deck.length) return undefined;
  if (typeof parsed.revealed !== 'boolean' || !isOneOf(NEW_STEPS, parsed.step)) return undefined;
  if (feedback !== null && !isOneOf(GRADES, feedback)) return undefined;
  if (typeof parsed.heading !== 'string') return undefined;
  return {
    version: 1,
    pool: parsed.pool,
    selectedLevels,
    deck,
    position: parsed.position,
    revealed: parsed.revealed,
    step: parsed.step,
    feedback,
    counts,
    missed,
    seen,
    taught,
    heading: parsed.heading,
    writeState,
  };
};

export function loadSession(characters: HSKCharacter[]): SessionSnapshot | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch { return null; }
  try {
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) throw new Error('Invalid session');
    // Keep sessions written by newer app versions so a compatible app can recover them.
    if (parsed.version !== 1) return null;
    const snapshot = readSession(parsed, characters);
    if (!snapshot) throw new Error('Invalid session');
    return snapshot;
  } catch {
    try { localStorage.removeItem(KEY); } catch { /* Storage may be unavailable. */ }
    return null;
  }
}

const serialize = (snapshot: SessionSnapshot) => JSON.stringify({
  version: snapshot.version,
  pool: snapshot.pool,
  selectedLevels: snapshot.selectedLevels,
  deck: snapshot.deck.map(({ char, kind }) => ({ character: char.character, kind })),
  position: snapshot.position,
  revealed: snapshot.revealed,
  step: snapshot.step,
  feedback: snapshot.feedback,
  counts: snapshot.counts,
  missed: snapshot.missed.map((char) => char.character),
  seen: snapshot.seen.map((char) => char.character),
  taught: snapshot.taught.map((char) => char.character),
  heading: snapshot.heading,
  writeState: snapshot.writeState,
});

export function saveSession(snapshot: SessionSnapshot): boolean {
  try {
    const current = localStorage.getItem(KEY);
    if (current) {
      const existing: unknown = JSON.parse(current);
      if (!isRecord(existing) || existing.version !== 1) return false;
    }
    localStorage.setItem(KEY, serialize(snapshot));
    return true;
  } catch { return false; }
}

export function discardSession(): boolean {
  try { localStorage.removeItem(KEY); return localStorage.getItem(KEY) === null; } catch { return false; }
}
