// Content shapes that the app reads and api/ writes. One definition, so a field added for the
// editor cannot silently go missing in the app, or the other way round.

export type HskLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface ExampleWord {
  word: string;
  pinyin: string;
  es: string;
}

export interface HSKCharacter {
  character: string;
  traditional: string;
  pinyin: string;
  definition: string;
  radical: string;
  stroke_count: number;
  hsk_level: HskLevel;
  general_standard: number;
  frequency_rank: number;
  /** Short learner gloss in the sense HSK uses; falls back to the first definition clause. */
  gloss?: string;
  example?: ExampleWord;
}
