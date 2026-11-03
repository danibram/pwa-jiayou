/**
 * Every localStorage key the app uses, in one place. The strings are the ones already on
 * learners' devices; renaming one loses what is saved under it.
 */
export const KEYS = {
  /** Character and word progress, daily counts and activity. */
  progress: 'hsk-flashcards-stats',
  myWords: 'jiayou-my-words',
  studyLists: 'jiayou-study-lists',
  /** Selected character levels and the place in Explorar. Not progress, despite the name. */
  characterDeck: 'hsk-flashcards-progress',
  installedLevels: 'hsk-installed-levels',
  /** Today's word session. Practice sessions append `:practice:<id>`. */
  wordSession: 'jiayou-vocabulary-session-v1',
  theme: 'jiayou-theme',
  voiceMode: 'hsk-voice-mode',
  /** Older builds stored a single speaker id here. Read once, then removed. */
  legacyVoice: 'hsk-voice',
} as const;

export const PRACTICE_SESSION_PREFIX = `${KEYS.wordSession}:practice:`;

export const practiceSessionKey = (practiceId: string) => `${PRACTICE_SESSION_PREFIX}${practiceId}`;

/** What Home showed last time, per mode. */
export const homeLastKey = (mode: string) => `jiayou-home-last-${mode}`;
