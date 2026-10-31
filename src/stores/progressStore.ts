import { createSignal } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { isNonNegativeInteger, isRecord } from '../utils/parse';

export type Grade = 'again' | 'hard' | 'good';
export const GRADES = ['again', 'hard', 'good'] as const satisfies readonly Grade[];

/** Per-character learning history, kept across sessions. */
export interface CharProgress {
  right: number;
  wrong: number;
  /** Successful reviews since the last lapse. */
  reps: number;
  lapses: number;
  /** Days until the next review. */
  interval: number;
  ease: number;
  /** Epoch ms when the character is due again. */
  due: number;
  strokeRuns: number;
  /** Fewest mistakes in a completed stroke practice. */
  strokeBest: number | null;
  lastSeen: number;
}

interface DailyLog {
  day: string;
  reviewed: number;
  introduced: number;
  /** Consecutive days with at least one review, including `day`. */
  streak: number;
}

interface ProgressState {
  chars: Record<string, CharProgress>;
  daily: DailyLog;
}

const STORAGE_KEY = 'hsk-flashcards-stats';
const DAY_MS = 86_400_000;
const MASTERED_INTERVAL = 21;
export const DAILY_GOAL = 20;
export const NEW_PER_DAY = 10;
export const SESSION_SIZE = 20;

const today = () => new Date().toLocaleDateString('sv-SE');
const yesterday = () => new Date(Date.now() - DAY_MS).toLocaleDateString('sv-SE');

const emptyDaily = (): DailyLog => ({ day: today(), reviewed: 0, introduced: 0, streak: 0 });

const empty = (): CharProgress => ({
  right: 0,
  wrong: 0,
  reps: 0,
  lapses: 0,
  interval: 0,
  ease: 2.5,
  due: 0,
  strokeRuns: 0,
  strokeBest: null,
  lastSeen: 0,
});

const invalidCharacter = () => new Error('Hay datos de caracteres no válidos.');

const countField = (value: Record<string, unknown>, key: string): number => {
  if (!(key in value) || value[key] === undefined) return 0;
  const field = value[key];
  if (!isNonNegativeInteger(field)) throw invalidCharacter();
  return field;
};

const easeField = (value: Record<string, unknown>): number => {
  if (!('ease' in value) || value.ease === undefined) return 2.5;
  const field = value.ease;
  if (typeof field !== 'number' || !Number.isFinite(field) || field < 1.3) throw invalidCharacter();
  return field;
};

const strokeBestField = (value: Record<string, unknown>): number | null => {
  if (!('strokeBest' in value) || value.strokeBest === undefined || value.strokeBest === null) return null;
  const field = value.strokeBest;
  if (!isNonNegativeInteger(field)) throw invalidCharacter();
  return field;
};

const parseCharacterProgress = (value: Record<string, unknown>): CharProgress => ({
  right: countField(value, 'right'),
  wrong: countField(value, 'wrong'),
  reps: countField(value, 'reps'),
  lapses: countField(value, 'lapses'),
  interval: countField(value, 'interval'),
  ease: easeField(value),
  due: countField(value, 'due'),
  strokeRuns: countField(value, 'strokeRuns'),
  strokeBest: strokeBestField(value),
  lastSeen: countField(value, 'lastSeen'),
});

const parseDaily = (value: unknown): DailyLog => {
  if (!isRecord(value) || typeof value.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.day)) {
    throw new Error('El registro diario no es válido.');
  }
  const date = new Date(`${value.day}T00:00:00Z`);
  const reviewed = value.reviewed;
  const introduced = value.introduced;
  const streak = value.streak;
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value.day ||
    !isNonNegativeInteger(reviewed) || !isNonNegativeInteger(introduced) || !isNonNegativeInteger(streak)) {
    throw new Error('El registro diario no es válido.');
  }
  return { day: value.day, reviewed, introduced, streak };
};

/** Accepts legacy character maps and the current versioned backup format. */
export const parseProgress = (raw: string): ProgressState => {
  const saved: unknown = JSON.parse(raw);
  if (!isRecord(saved)) throw new Error('El archivo no contiene datos de progreso válidos.');
  if ('version' in saved && saved.version !== 2) throw new Error('Esta versión de la copia no es compatible.');
  const chars = 'chars' in saved ? saved.chars : saved;
  if (!isRecord(chars)) throw new Error('La lista de caracteres no es válida.');
  const migrated: Record<string, CharProgress> = {};
  for (const [char, value] of Object.entries(chars)) {
    if (!('chars' in saved) && char === 'daily') continue;
    if (!char || !isRecord(value) || [...char].length !== 1 || ['__proto__', 'constructor', 'prototype'].includes(char)) {
      throw invalidCharacter();
    }
    migrated[char] = parseCharacterProgress(value);
  }
  const daily = 'daily' in saved ? parseDaily(saved.daily) : emptyDaily();
  if (saved.version === 2 && (!('chars' in saved) || !('daily' in saved))) throw new Error('La copia está incompleta.');
  return { chars: migrated, daily };
};

let loadBlocked = false;
const [storageError, setStorageError] = createSignal<string | null>(null);
const load = (): ProgressState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? { chars: {}, daily: emptyDaily() } : parseProgress(raw);
  } catch {
    loadBlocked = true;
    setStorageError('No se pudo leer el progreso guardado. No se sobrescribirá.');
    return { chars: {}, daily: emptyDaily() };
  }
};

const [state, setState] = createStore<ProgressState>(load());
const serialize = (data: ProgressState) => JSON.stringify({ version: 2, chars: data.chars, daily: data.daily });

const save = (): boolean => {
  if (loadBlocked) return false;
  try {
    localStorage.setItem(STORAGE_KEY, serialize(state));
    setStorageError(null);
    return true;
  } catch {
    setStorageError('No se pudo guardar el progreso. Exporta una copia y vuelve a intentarlo.');
    return false;
  }
};

const update = (char: string, fn: (p: CharProgress) => CharProgress) => {
  setState('chars', char, fn(state.chars[char] ?? empty()));
};

/** Rolls the daily log over to today, keeping the streak if yesterday was active. */
const currentDaily = (): DailyLog => {
  const d = state.daily;
  if (d.day === today()) return d;
  return {
    day: today(),
    reviewed: 0,
    introduced: 0,
    streak: d.day === yesterday() && d.reviewed > 0 ? d.streak : 0,
  };
};

const schedule = (p: CharProgress, grade: Grade, now: number): CharProgress => {
  if (grade === 'again') {
    return {
      ...p,
      wrong: p.wrong + 1,
      reps: 0,
      lapses: p.reps > 0 || p.interval > 0 ? p.lapses + 1 : p.lapses,
      interval: 0,
      ease: Math.max(1.3, p.ease - 0.2),
      due: now,
    };
  }
  const interval =
    grade === 'hard'
      ? Math.max(1, Math.round(p.interval * 1.2))
      : p.reps === 0
        ? 1
        : p.reps === 1
          ? 3
          : Math.round(p.interval * p.ease);
  return {
    ...p,
    right: p.right + 1,
    reps: p.reps + 1,
    interval,
    ease: grade === 'hard' ? Math.max(1.3, p.ease - 0.15) : p.ease,
    due: now + interval * DAY_MS,
  };
};

export const progressStore = {
  storageError,

  exportBackup(): string {
    return serialize(state);
  },

  importBackup(raw: string): void {
    const imported = parseProgress(raw);
    // Write first so a failed import leaves both the current state and stored data intact.
    localStorage.setItem(STORAGE_KEY, serialize(imported));
    setState(reconcile(imported));
    loadBlocked = false;
    setStorageError(null);
  },

  retrySave(): boolean {
    if (loadBlocked) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw !== null) {
          const recovered = parseProgress(raw);
          // Do not discard progress made in memory while storage was unavailable.
          if (Object.keys(state.chars).length > 0) {
            setStorageError('El progreso actual y el guardado difieren. Exporta el actual antes de restaurar el guardado.');
            return false;
          }
          setState(reconcile(recovered));
        }
        loadBlocked = false;
      } catch {
        setStorageError('No se pudo leer el progreso guardado. No se sobrescribirá.');
        return false;
      }
    }
    return save();
  },

  recoverStoredProgress(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) {
        setStorageError('No se encontró progreso guardado para recuperar.');
        return false;
      }
      const recovered = parseProgress(raw);
      setState(reconcile(recovered));
      loadBlocked = false;
      setStorageError(null);
      return true;
    } catch {
      setStorageError('No se pudo leer el progreso guardado. No se sobrescribirá.');
      return false;
    }
  },
  get(char: string): CharProgress | undefined {
    return state.chars[char];
  },

  grade(char: string, grade: Grade) {
    const now = Date.now();
    const isNew = !state.chars[char] || state.chars[char].right + state.chars[char].wrong === 0;
    update(char, (p) => ({ ...schedule(p, grade, now), lastSeen: now }));
    const daily = currentDaily();
    setState('daily', {
      ...daily,
      reviewed: daily.reviewed + 1,
      introduced: daily.introduced + (isNew ? 1 : 0),
      streak: daily.reviewed === 0 ? daily.streak + 1 : daily.streak,
    });
    save();
  },

  /**
   * A first look. The character comes back tomorrow as a real question.
   * It does not count as a right or a wrong answer.
   */
  introduce(char: string) {
    if (!this.isNew(char)) return;
    const now = Date.now();
    update(char, (p) => ({
      ...p,
      interval: 1,
      due: now + DAY_MS,
      lastSeen: now,
    }));
    const daily = currentDaily();
    setState('daily', { ...daily, introduced: daily.introduced + 1 });
    save();
  },

  /** Free practice: counts the answer but leaves the schedule alone, so cramming can't inflate intervals. */
  practice(char: string, correct: boolean) {
    if (this.isDue(char)) return this.grade(char, correct ? 'good' : 'again');
    if (this.isNew(char)) return;
    update(char, (p) => ({
      ...p,
      right: p.right + (correct ? 1 : 0),
      wrong: p.wrong + (correct ? 0 : 1),
      lastSeen: Date.now(),
    }));
    save();
  },

  /** Shorthand for a binary right/wrong answer. */
  recordReview(char: string, correct: boolean) {
    this.grade(char, correct ? 'good' : 'again');
  },

  recordStrokes(char: string, mistakes: number) {
    update(char, (p) => ({
      ...p,
      strokeRuns: p.strokeRuns + 1,
      strokeBest: p.strokeBest === null ? mistakes : Math.min(p.strokeBest, mistakes),
      lastSeen: Date.now(),
    }));
    save();
  },

  isNew(char: string): boolean {
    const p = state.chars[char];
    // A first look sets a due date and still has no answers, so it is no longer new.
    return !p || (p.right + p.wrong === 0 && p.due === 0);
  },

  isDue(char: string, now = Date.now()): boolean {
    const p = state.chars[char];
    return !!p && !this.isNew(char) && p.due <= now;
  },

  /** Recognised reliably enough to be asked to write it from memory. */
  canWrite(char: string): boolean {
    return (state.chars[char]?.reps ?? 0) >= 2;
  },

  isSeen(char: string): boolean {
    return !this.isNew(char);
  },

  isMastered(char: string): boolean {
    return (state.chars[char]?.interval ?? 0) >= MASTERED_INTERVAL;
  },

  /** Missed at some point and not yet stable. */
  isWeak(char: string): boolean {
    const p = state.chars[char];
    return !!p && p.wrong > 0 && p.interval < 7;
  },

  /** Today's session: due cards first (most overdue first), then unseen ones in frequency order. */
  buildQueue<T extends { character: string }>(chars: T[], extraNew = 0): { due: T[]; fresh: T[] } {
    const now = Date.now();
    const due = chars
      .filter((c) => this.isDue(c.character, now))
      .sort((a, b) => state.chars[a.character].due - state.chars[b.character].due)
      .slice(0, SESSION_SIZE);
    const freshBudget =
      extraNew ||
      Math.max(0, Math.min(NEW_PER_DAY - this.daily.introduced, SESSION_SIZE - due.length));
    const fresh = chars.filter((c) => this.isNew(c.character)).slice(0, freshBudget);
    return { due, fresh };
  },

  get daily(): DailyLog {
    return currentDaily();
  },

  clear() {
    setState({ chars: {}, daily: emptyDaily() });
    save();
  },
};
