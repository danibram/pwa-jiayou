export interface HSKCharacter {
  character: string;
  traditional: string;
  pinyin: string;
  definition: string;
  radical: string;
  stroke_count: number;
  hsk_level: 1 | 2 | 3 | 4 | 5 | 6;
  general_standard: number;
  frequency_rank: number;
  /** Short learner gloss in the sense HSK uses; falls back to the first definition clause. */
  gloss?: string;
  example?: ExampleWord;
}

export interface ExampleWord {
  word: string;
  pinyin: string;
  es: string;
}

export interface TrainingResult {
  correct: number;
  incorrect: number;
  total: number;
  percentage: number;
}

export type SwipeDirection = 'left' | 'right' | null;
