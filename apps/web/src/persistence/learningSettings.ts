import { createSignal, type Accessor } from 'solid-js';
import { DEFAULT_SESSION_SETTINGS, type SessionSettings } from '@jiayou/learning/sessions';
import { storage, type KeyValueStore } from './keyValue';

/** Where the study settings live. Not in `KEYS` because the learning system owns it. */
export const LEARNING_SETTINGS_KEY = 'jiayou-learning-settings-v1';

/**
 * The study budgets the learner can change, for words. Character budgets, Already-known checks and
 * requeue limits keep their defaults.
 */
export interface StudySettings {
  /** New words taught per local day across every mode. */
  newPerDay: number;
  /** Hoy's share of `newPerDay`. */
  todayNewPerDay: number;
  /** New words one session may introduce. */
  newPerSession: number;
  /** Cards a session starts with. */
  workLimit: number;
  /** Practice cards a session starts with, inside `workLimit`. */
  practiceLimit: number;
}

export const DEFAULT_STUDY_SETTINGS: StudySettings = {
  newPerDay: DEFAULT_SESSION_SETTINGS.newPerDay['word-meaning'],
  todayNewPerDay: DEFAULT_SESSION_SETTINGS.todayNewPerDay['word-meaning'],
  newPerSession: DEFAULT_SESSION_SETTINGS.newPerSession,
  workLimit: DEFAULT_SESSION_SETTINGS.workLimit,
  practiceLimit: DEFAULT_SESSION_SETTINGS.practiceLimit,
};

/** Accepted range per field. A stored value outside it falls back to the default for that field. */
export const STUDY_SETTING_RANGES: Record<keyof StudySettings, { min: number; max: number }> = {
  newPerDay: { min: 0, max: 100 },
  todayNewPerDay: { min: 0, max: 100 },
  newPerSession: { min: 1, max: 50 },
  workLimit: { min: 5, max: 200 },
  practiceLimit: { min: 0, max: 200 },
};

const FIELDS = Object.keys(DEFAULT_STUDY_SETTINGS) as (keyof StudySettings)[];

const inRange = (field: keyof StudySettings, value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= STUDY_SETTING_RANGES[field].min &&
  value <= STUDY_SETTING_RANGES[field].max;

/** Hoy cannot exceed the daily budget, and practice fits inside the session. */
const clampRelations = (settings: StudySettings): StudySettings => ({
  ...settings,
  todayNewPerDay: Math.min(settings.todayNewPerDay, settings.newPerDay),
  practiceLimit: Math.min(settings.practiceLimit, settings.workLimit),
});

/** Reads any value into valid settings, field by field. Anything unreadable gives the defaults. */
export const parseStudySettings = (value: unknown): StudySettings => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return DEFAULT_STUDY_SETTINGS;
  const record = value as Record<string, unknown>;
  if (record.version !== 1) return DEFAULT_STUDY_SETTINGS;
  const settings = { ...DEFAULT_STUDY_SETTINGS };
  for (const field of FIELDS) {
    if (inRange(field, record[field])) settings[field] = record[field];
  }
  return clampRelations(settings);
};

/** The full settings the session planner takes. */
export const toSessionSettings = (study: StudySettings): SessionSettings => ({
  ...DEFAULT_SESSION_SETTINGS,
  newPerDay: { ...DEFAULT_SESSION_SETTINGS.newPerDay, 'word-meaning': study.newPerDay },
  todayNewPerDay: { ...DEFAULT_SESSION_SETTINGS.todayNewPerDay, 'word-meaning': study.todayNewPerDay },
  newPerSession: study.newPerSession,
  workLimit: study.workLimit,
  practiceLimit: study.practiceLimit,
});

export interface LearningSettingsStore {
  settings: Accessor<StudySettings>;
  sessionSettings: Accessor<SessionSettings>;
  /**
   * Merges a patch, ignoring fields outside `STUDY_SETTING_RANGES`, then applies the caps. False when
   * storage refused the write; the new values still apply until the app closes.
   */
  update(patch: Partial<StudySettings>): boolean;
  reset(): boolean;
}

export const createLearningSettings = (kv: KeyValueStore = storage): LearningSettingsStore => {
  const read = (): StudySettings => {
    try {
      const raw = kv.read(LEARNING_SETTINGS_KEY);
      return raw === null ? DEFAULT_STUDY_SETTINGS : parseStudySettings(JSON.parse(raw));
    } catch {
      // Blocked storage or broken JSON: the defaults are a safe study plan.
      return DEFAULT_STUDY_SETTINGS;
    }
  };
  const [settings, setSettings] = createSignal<StudySettings>(read());
  const save = (next: StudySettings): boolean => {
    setSettings(next);
    try {
      kv.write(LEARNING_SETTINGS_KEY, JSON.stringify({ version: 1, ...next }));
      return true;
    } catch {
      return false;
    }
  };
  return {
    settings,
    sessionSettings: () => toSessionSettings(settings()),
    update: (patch) => {
      const next = { ...settings() };
      for (const field of FIELDS) {
        if (inRange(field, patch[field])) next[field] = patch[field];
      }
      return save(clampRelations(next));
    },
    reset: () => {
      setSettings(DEFAULT_STUDY_SETTINGS);
      try {
        kv.remove(LEARNING_SETTINGS_KEY);
        return true;
      } catch {
        return false;
      }
    },
  };
};

/** The app's settings, read from localStorage once at startup. */
export const learningSettings = createLearningSettings();
