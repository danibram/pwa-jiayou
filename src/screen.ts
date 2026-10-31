import type { ReviewPool } from './types';
import { isNonNegativeInteger, isRecord } from './utils/parse';

export type StrokeFocus =
  | { kind: 'level' }
  | { kind: 'character'; char: string }
  | { kind: 'topic'; char: string; topicId: string };

export type Screen =
  | { page: 'home' }
  | { page: 'acerca' }
  | { page: 'temas' }
  | { page: 'tema'; topicId: string; index: number }
  | { page: 'tarjetas' }
  | { page: 'entrenamiento'; pool: ReviewPool; resume: boolean }
  | { page: 'trazos'; focus: StrokeFocus; from: Screen };

export type HomeTarget =
  | { page: 'tarjetas' }
  | { page: 'temas' }
  | { page: 'acerca' }
  | { page: 'entrenamiento'; pool: ReviewPool; resume: boolean }
  | { page: 'trazos'; focus: Exclude<StrokeFocus, { kind: 'topic' }> };

export const homeScreen = { page: 'home' } satisfies Screen;

const POOLS = ['today', 'more', 'all'] as const satisfies readonly ReviewPool[];

const isPool = (value: unknown): value is ReviewPool =>
  typeof value === 'string' && POOLS.some((pool) => pool === value);

const parseFocus = (value: Record<string, unknown>): StrokeFocus | undefined => {
  if (isRecord(value.focus)) {
    const focus = value.focus;
    if (focus.kind === 'level') return { kind: 'level' };
    if (focus.kind === 'character' && typeof focus.char === 'string') return { kind: 'character', char: focus.char };
    if (focus.kind === 'topic' && typeof focus.char === 'string' && typeof focus.topicId === 'string') {
      return { kind: 'topic', char: focus.char, topicId: focus.topicId };
    }
    return undefined;
  }
  if (value.char !== undefined && typeof value.char !== 'string') return undefined;
  if (value.topicId !== undefined && typeof value.topicId !== 'string') return undefined;
  if (typeof value.topicId === 'string') {
    if (typeof value.char !== 'string') return undefined;
    return { kind: 'topic', char: value.char, topicId: value.topicId };
  }
  if (typeof value.char === 'string') return { kind: 'character', char: value.char };
  return { kind: 'level' };
};

/** History state is untrusted. Returns a screen built from checked fields. */
export const parseScreen = (value: unknown): Screen | undefined => {
  if (!isRecord(value)) return undefined;
  if (value.page === 'home' || value.page === 'acerca' || value.page === 'temas' || value.page === 'tarjetas') {
    return { page: value.page };
  }
  if (value.page === 'entrenamiento') {
    if (!isPool(value.pool)) return undefined;
    return { page: 'entrenamiento', pool: value.pool, resume: value.resume === true };
  }
  if (value.page === 'tema') {
    if (typeof value.topicId !== 'string' || !isNonNegativeInteger(value.index)) return undefined;
    return { page: 'tema', topicId: value.topicId, index: value.index };
  }
  if (value.page === 'trazos') {
    if (!isRecord(value.from) || value.from.page === 'trazos') return undefined;
    const from = parseScreen(value.from);
    const focus = parseFocus(value);
    if (!from || !focus) return undefined;
    return { page: 'trazos', focus, from };
  }
  return undefined;
};

export const temaScreen = (screen: Screen) => (screen.page === 'tema' ? screen : undefined);
export const entrenamientoScreen = (screen: Screen) =>
  (screen.page === 'entrenamiento' ? screen : undefined);
export const trazosScreen = (screen: Screen) => (screen.page === 'trazos' ? screen : undefined);
