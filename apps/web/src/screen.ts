import { isRecord } from './utils/parse';

export type StrokeFocus =
  | { kind: 'level' }
  | { kind: 'character'; char: string }
  | { kind: 'topic'; char: string; topicId: string };

export type Screen =
  | { page: 'home' }
  | { page: 'vocabulario'; topic?: boolean; wordId?: string; returnTo?: 'home' }
  | { page: 'vocabulary-review'; resume: boolean; practiceId?: string }
  | { page: 'acerca' }
  | { page: 'opciones' }
  | { page: 'trazos'; focus: StrokeFocus; from: Screen };

export type HomeTarget =
  | { page: 'vocabulario'; topic?: boolean; wordId?: string }
  | { page: 'vocabulary-review'; resume: boolean; practiceId?: string }
  | { page: 'acerca' }
  | { page: 'opciones' }
  | { page: 'trazos'; focus: Exclude<StrokeFocus, { kind: 'topic' }> };

export const homeScreen = { page: 'home' } satisfies Screen;

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
  if (value.page === 'home' || value.page === 'acerca' || value.page === 'opciones') {
    return { page: value.page };
  }
  if (value.page === 'vocabulario') return { page: 'vocabulario', topic: value.topic === true, ...(typeof value.wordId === 'string' ? { wordId: value.wordId } : {}), ...(value.returnTo === 'home' ? { returnTo: value.returnTo } : {}) };
  if (value.page === 'vocabulary-review') return { page: 'vocabulary-review', resume: true, ...(typeof value.practiceId === 'string' ? { practiceId: value.practiceId } : {}) };
  if (value.page === 'trazos') {
    if (!isRecord(value.from) || value.from.page === 'trazos') return undefined;
    const from = parseScreen(value.from);
    const focus = parseFocus(value);
    if (!from || !focus) return undefined;
    return { page: 'trazos', focus, from };
  }
  return undefined;
};

export const trazosScreen = (screen: Screen) => (screen.page === 'trazos' ? screen : undefined);
