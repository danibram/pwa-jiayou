/**
 * Every localStorage key the app uses, in one place. The strings are the ones already on
 * learners' devices; renaming one loses what is saved under it.
 */
export const KEYS = {
  myWords: 'jiayou-my-words',
  studyLists: 'jiayou-study-lists',
  /** Selected character levels and the place in Explorar. Not progress, despite the name. */
  characterDeck: 'hsk-flashcards-progress',
  installedLevels: 'hsk-installed-levels',
  /** This device's random id, made once. Stamps every progress write so two devices can be told apart. */
  deviceId: 'jiayou-device-id',
  theme: 'jiayou-theme',
  voiceMode: 'hsk-voice-mode',
  /** Older builds stored a single speaker id here. Read once, then removed. */
  legacyVoice: 'hsk-voice',
} as const;

/** What Home showed last time, per mode. */
export const homeLastKey = (mode: string) => `jiayou-home-last-${mode}`;
