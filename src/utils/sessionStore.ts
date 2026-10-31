import type { HSKCharacter } from '../types';
import type { ReviewPool } from '../pages/Entrenamiento';
import type { Grade } from '../stores/progressStore';

export type CardKind = 'learn' | 'quiz' | 'write' | 'retry';
export type NewStep = 'learn' | 'seen' | 'ask' | 'check';
export interface SessionSnapshot {
  version: 1;
  pool: ReviewPool;
  deck: { character: string; kind: CardKind }[];
  position: number;
  revealed: boolean;
  step: NewStep;
  feedback: Grade | null;
  counts: Record<Grade, number>;
  missed: string[];
  seen: string[];
  taught: string[];
  heading: string;
  writeState: { done: number; total: number; mistakes: number; hint: boolean };
}
const KEY = 'jiayou-session-v1';
const integer = (x: unknown): x is number => Number.isSafeInteger(x) && (x as number) >= 0;
export function loadSession(characters: HSKCharacter[]): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SessionSnapshot;
    const known = new Set(characters.map((c) => c.character));
    const ids = (x: unknown) => Array.isArray(x) && x.every((id) => typeof id === 'string' && known.has(id));
    if (!s || s.version !== 1 || !['today', 'more', 'all'].includes(s.pool) ||
      !Array.isArray(s.deck) || !s.deck.length || !s.deck.every((c) => c && known.has(c.character) && ['learn', 'quiz', 'write', 'retry'].includes(c.kind)) ||
      !integer(s.position) || s.position >= s.deck.length || typeof s.revealed !== 'boolean' ||
      !['learn', 'seen', 'ask', 'check'].includes(s.step) || ![null, 'again', 'hard', 'good'].includes(s.feedback) ||
      !s.counts || !(['again', 'hard', 'good'] as const).every((g) => integer(s.counts[g])) ||
      !ids(s.missed) || !ids(s.seen) || !ids(s.taught) || typeof s.heading !== 'string' ||
      !s.writeState || !integer(s.writeState.done) || !integer(s.writeState.total) || !integer(s.writeState.mistakes) || typeof s.writeState.hint !== 'boolean') throw new Error('Invalid session');
    return s;
  } catch {
    discardSession();
    return null;
  }
}
export function saveSession(snapshot: SessionSnapshot): void {
  try { localStorage.setItem(KEY, JSON.stringify(snapshot)); } catch { /* Storage may be unavailable. */ }
}
export function discardSession(): void {
  try { localStorage.removeItem(KEY); } catch { /* Storage may be unavailable. */ }
}
