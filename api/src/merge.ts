import type {
  CharacterProvenance,
  DraftEntry,
  ExampleProvenance,
  ExampleWord,
  FieldSource,
  HSKCharacter,
  LockedFields,
  OverrideEntry,
} from './types';

const firstSense = (text: string) => text.split(/[;；]/)[0]?.trim() ?? '';

export const lockedFromOverride = (entry: OverrideEntry | undefined): LockedFields => ({
  gloss: entry?.gloss !== undefined,
  'example.word': entry?.example?.word !== undefined,
  'example.pinyin': entry?.example?.pinyin !== undefined,
  'example.es': entry?.example?.es !== undefined,
});

export const parseBaseRow = (raw: Record<string, unknown>): HSKCharacter => {
  const strokes = raw.stroke_count ?? raw.strokes;
  const level = raw.hsk_level as HSKCharacter['hsk_level'];
  return {
    character: String(raw.character),
    traditional: typeof raw.traditional === 'string' && raw.traditional ? raw.traditional : String(raw.character),
    pinyin: String(raw.pinyin ?? ''),
    definition: String(raw.definition ?? ''),
    radical: String(raw.radical ?? ''),
    stroke_count: typeof strokes === 'number' && strokes >= 0 ? strokes : 0,
    hsk_level: level,
    general_standard: typeof raw.general_standard === 'number' ? raw.general_standard : 0,
    frequency_rank: typeof raw.frequency_rank === 'number' ? raw.frequency_rank : 0,
    gloss: typeof raw.gloss === 'string' ? raw.gloss : undefined,
    example:
      raw.example && typeof raw.example === 'object'
        ? {
            word: String((raw.example as ExampleWord).word ?? ''),
            pinyin: String((raw.example as ExampleWord).pinyin ?? ''),
            es: String((raw.example as ExampleWord).es ?? ''),
          }
        : undefined,
  };
};

const pickExample = (
  base: ExampleWord | undefined,
  draft: DraftEntry | undefined,
  override: OverrideEntry | undefined,
): { example: ExampleWord | undefined; provenance: ExampleProvenance | undefined } => {
  const word =
    override?.example?.word ?? draft?.example?.word ?? base?.word;
  const pinyin =
    override?.example?.pinyin ?? draft?.example?.pinyin ?? base?.pinyin;
  const es = override?.example?.es ?? draft?.example?.es ?? base?.es;

  if (!word && !pinyin && !es) return { example: undefined, provenance: undefined };

  const provWord: FieldSource = override?.example?.word !== undefined
    ? 'override'
    : draft?.example?.word !== undefined
      ? 'draft'
      : 'base';
  const provPinyin: FieldSource = override?.example?.pinyin !== undefined
    ? 'override'
    : draft?.example?.pinyin !== undefined
      ? 'draft'
      : 'base';
  const provEs: FieldSource = override?.example?.es !== undefined
    ? 'override'
    : draft?.example?.es !== undefined
      ? 'draft'
      : 'base';

  return {
    example: {
      word: word ?? '',
      pinyin: pinyin ?? '',
      es: es ?? '',
    },
    provenance: { word: provWord, pinyin: provPinyin, es: provEs },
  };
};

export const mergeCharacter = (
  base: HSKCharacter,
  draft: DraftEntry | undefined,
  override: OverrideEntry | undefined,
  sidecar?: { gloss?: string; example?: ExampleWord },
): { character: HSKCharacter; provenance: CharacterProvenance; locked: LockedFields } => {
  const locked = lockedFromOverride(override);

  const baseGloss = base.gloss ?? sidecar?.gloss;
  const baseExample = base.example ?? sidecar?.example;

  let glossSource: FieldSource = 'base';
  let gloss: string | undefined = baseGloss;
  if (override?.gloss !== undefined) {
    gloss = override.gloss;
    glossSource = 'override';
  } else if (draft?.gloss !== undefined) {
    gloss = draft.gloss;
    glossSource = 'draft';
  }

  let definition = base.definition;
  if (override?.definition !== undefined) definition = override.definition;
  else if (draft?.definition !== undefined) definition = draft.definition;
  else if (gloss && /^[a-zA-Z]/.test(firstSense(base.definition))) definition = gloss;

  const { example, provenance: exampleProv } = pickExample(baseExample, draft, override);

  let stroke_count = base.stroke_count;
  if (draft?.stroke_count !== undefined && draft.stroke_count > 0) stroke_count = draft.stroke_count;

  const character: HSKCharacter = {
    ...base,
    traditional: draft?.traditional ?? base.traditional,
    definition,
    stroke_count,
    gloss,
    example,
  };

  const provenance: CharacterProvenance = {
    gloss: gloss !== undefined ? glossSource : undefined,
    example: exampleProv,
  };

  return { character, provenance, locked };
};

/** Published row for packs: merged character fields. */
export const mergeForPublish = (
  base: HSKCharacter,
  draft: DraftEntry | undefined,
  override: OverrideEntry | undefined,
  sidecar?: { gloss?: string; example?: ExampleWord },
): HSKCharacter => mergeCharacter(base, draft, override, sidecar).character;
