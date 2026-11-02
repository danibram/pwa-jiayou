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
  gloss?: string;
  example?: ExampleWord;
}

export type FieldSource = 'base' | 'draft' | 'override';

export interface ExampleProvenance {
  word: FieldSource;
  pinyin: FieldSource;
  es: FieldSource;
}

export interface CharacterProvenance {
  gloss?: FieldSource;
  example?: ExampleProvenance;
}

export type ReviewFlag =
  | 'stroke_count_zero_with_strokes'
  | 'definition_english'
  | 'gloss_trailing_comma'
  | 'gloss_trailing_ellipsis'
  | 'example_es_equals_gloss'
  | 'example_word_missing_char'
  | 'stroke_file_missing'
  | 'citation_audio_missing';

export interface LockedFields {
  gloss: boolean;
  'example.word': boolean;
  'example.pinyin': boolean;
  'example.es': boolean;
}

export interface DraftEntry {
  gloss?: string;
  definition?: string;
  example?: Partial<ExampleWord>;
  traditional?: string;
  stroke_count?: number;
}

export interface OverrideEntry {
  gloss?: string;
  definition?: string;
  example?: Partial<ExampleWord>;
}

export interface AssembledCharacter {
  character: HSKCharacter;
  provenance: CharacterProvenance;
  locked: LockedFields;
  flags: ReviewFlag[];
  media: {
    strokeFile: boolean;
    strokeCountFromFile: number | null;
    citationSyllable: string | null;
    audio: { f: boolean; m: boolean; c: boolean };
  };
}
