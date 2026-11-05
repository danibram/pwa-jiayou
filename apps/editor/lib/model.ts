import type { VocabularyEntry } from '../../web/src/data/vocabulary';
import type { Topic } from '../../web/src/data/topics';
import type { HSKCharacter } from '../../web/src/types';

/** Keep in sync with WORD_RELATION_KINDS in src/data/wordRelations.ts. Inlined so content-publish can load this file as a data URL. */
const RELATION_KINDS = new Set(['synonym', 'antonym', 'related', 'classifier', 'confused']);
const isWordRelationKind = (value: unknown): boolean => typeof value === 'string' && RELATION_KINDS.has(value);
/** Keep in sync with WORD_POS in src/data/wordSenses.ts, inlined for the same reason. */
const WORD_POS = new Set(['sustantivo', 'verbo', 'adjetivo', 'adverbio', 'clasificador', 'pronombre', 'numeral', 'preposición', 'conjunción', 'partícula', 'interjección', 'expresión']);

/**
 * A retired word keeps its row, so its id stays taken and its history readable, but publication leaves
 * it out of the lists the app reads. Clearing the flag publishes the same entry again under its id.
 */
export type SnapshotWord = VocabularyEntry & { retired?: true };

export interface ContentSnapshot {
  schemaVersion: 1;
  vocabulary: SnapshotWord[];
  characters: HSKCharacter[];
  topics: Topic[];
}

export interface ContentDraft {
  schemaVersion: 1;
  baseRevision: string;
  snapshot: ContentSnapshot;
  references?: Record<string, { url: string; retrieved: string; examples: { chinese: string; pinyin: string; spanish: string }[] }>;
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const han = (value: unknown): value is string => typeof value === 'string' && /^\p{Script=Han}$/u.test(value);
const level = (value: unknown): boolean => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 6;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(text);
const fail = (message: string): never => { throw new Error(message); };
const unique = (ids: string[], label: string) => {
  if (new Set(ids).size !== ids.length) fail(`${label} duplicado.`);
};

/**
 * `published` is every word id the registry has ever published. A word that is new to `base` may not
 * take one of them: the id would start pointing at another entry and inherit its saved progress.
 */
export function validateSnapshot(value: unknown, base?: ContentSnapshot, published: Iterable<string> = []): asserts value is ContentSnapshot {
  if (!object(value) || value.schemaVersion !== 1 || !Array.isArray(value.vocabulary) || !Array.isArray(value.characters) || !Array.isArray(value.topics)) {
    return fail('Formato de contenido inválido.');
  }
  const topics = value.topics as unknown[];
  const words = value.vocabulary as unknown[];
  const chars = value.characters as unknown[];
  const kinds = new Set(['theme', 'subtopic', 'tag']);
  for (const topic of topics) {
    if (!object(topic)) return fail('Tema inválido.');
    if (!text(topic.id) || !/^[a-z]+$/.test(topic.id) || !text(topic.title) || !han(topic.glyph) || !Array.isArray(topic.characters) || !topic.characters.every(han)) fail('Tema inválido.');
    // Published bases before the theme/subtopic split omit kind; treat them as themes.
    if (topic.kind === undefined) topic.kind = 'theme';
    if (!kinds.has(topic.kind as string)) fail(`Tipo de tema inválido en ${(topic as { title?: string }).title ?? topic.id}.`);
    if (topic.listed !== undefined && typeof topic.listed !== 'boolean') fail('listed inválido.');
    if (topic.parentId !== undefined && !text(topic.parentId)) fail('parentId inválido.');
  }
  const topicRows = topics as Topic[];
  unique(topicRows.map((row) => row.id), 'Tema');
  unique(topicRows.map((row) => row.title.trim().toLowerCase()), 'Título de tema');
  const topicIds = new Set(topicRows.map((row) => row.id));
  for (const topic of topicRows) {
    // The app lists a topic as a practice set; fewer than five characters makes no session.
    if (topic.characters.length < 5) fail(`El tema ${topic.title} necesita al menos 5 caracteres.`);
    if (new Set(topic.characters).size !== topic.characters.length) fail(`Carácter repetido en el tema ${topic.title}.`);
    if (topic.kind === 'subtopic') {
      if (!topic.parentId || !topicIds.has(topic.parentId)) fail(`Subtema sin padre: ${topic.title}.`);
      const parent = topicRows.find((row) => row.id === topic.parentId);
      if (!parent || (parent.kind ?? 'theme') !== 'theme') fail(`El padre de ${topic.title} debe ser un tema.`);
    } else if (topic.parentId) {
      fail(`Solo un subtema puede tener padre (${topic.title}).`);
    }
  }
  for (const word of words) {
    if (!object(word) || !text(word.id) || !text(word.simplified) || !text(word.traditional) || !text(word.pinyin) || !(Array.isArray(word.senses) || (!base && text(word.meaning))) || !text(word.sourceId) || (word.level !== undefined && !level(word.level)) || !Array.isArray(word.characters) || !word.characters.every(han) || !strings(word.topicIds)) fail('Palabra inválida.');
    const row = word as unknown as SnapshotWord;
    if (row.retired !== undefined && row.retired !== true) fail(`Estado de retirada inválido en ${row.simplified}.`);
    if (row.example !== undefined && row.example !== null && (!object(row.example) || !text(row.example.chinese) || !text(row.example.spanish))) fail(`Frase incompleta en ${row.simplified}.`);
    // Published bases before senses carry a single meaning string; a draft always has senses.
    if (Array.isArray(row.senses)) {
      if (!row.senses.length) fail(`${row.simplified} necesita al menos un significado.`);
      for (const sense of row.senses as unknown[]) {
        if (!object(sense) || !text(sense.text)) fail(`Significado vacío en ${row.simplified}.`);
        const use = sense as Record<string, unknown>;
        if (use.pos !== undefined && !WORD_POS.has(use.pos as string)) fail(`Categoría desconocida en ${row.simplified}.`);
        if (use.note !== undefined && !text(use.note)) fail(`Nota vacía en ${row.simplified}.`);
      }
    }
    if (!row.characters.length || JSON.stringify(row.characters) !== JSON.stringify(Array.from(row.simplified))) fail(`Caracteres incorrectos en ${row.simplified}.`);
    if (new Set(row.topicIds).size !== row.topicIds.length) fail(`Tema duplicado en ${row.simplified}.`);
    if (row.topicIds.some((id) => !topicIds.has(id))) fail(`Tema desconocido en ${row.simplified}.`);
    if (row.relations !== undefined) {
      if (!Array.isArray(row.relations)) fail(`Relaciones inválidas en ${row.simplified}.`);
      const seen = new Set<string>();
      for (const link of row.relations) {
        if (!object(link) || !isWordRelationKind(link.kind) || !text(link.id)) fail(`Relación inválida en ${row.simplified}.`);
        const key = `${link.kind}:${link.id}`;
        if (seen.has(key)) fail(`Relación duplicada en ${row.simplified}.`);
        seen.add(key);
        if (link.id === row.id) fail(`Una palabra no puede relacionarse consigo misma (${row.simplified}).`);
      }
    }
  }
  const wordRows = words as SnapshotWord[];
  unique(wordRows.map((row) => row.id), 'Id de palabra');
  const wordIds = new Set(wordRows.map((row) => row.id));
  const retiredIds = new Set(wordRows.filter((row) => row.retired).map((row) => row.id));
  for (const row of wordRows) {
    for (const link of row.relations ?? []) {
      if (!wordIds.has(link.id)) fail(`Palabra desconocida en las relaciones de ${row.simplified}.`);
      // The app never loads a retired word, so a live word cannot point at one.
      if (!row.retired && retiredIds.has(link.id)) fail(`${row.simplified} se relaciona con una palabra retirada.`);
    }
  }
  for (const char of chars) {
    if (object(char) && char.gloss !== undefined && !text(char.gloss)) fail('Glosa inválida.');
    if (object(char) && char.example !== undefined && (!object(char.example) || typeof char.example.word !== 'string' || typeof char.example.pinyin !== 'string' || typeof char.example.es !== 'string')) fail('Ejemplo inválido.');
    if (base && object(char) && object(char.example) && (!text(char.example.word) || !text(char.example.pinyin) || !text(char.example.es))) {
      const original = base.characters.find((row) => row.character === char.character);
      if (JSON.stringify(original?.example) !== JSON.stringify(char.example)) fail('Ejemplo incompleto.');
    }
    if (!object(char) || !han(char.character) || !text(char.traditional) || !text(char.pinyin) || !text(char.definition) || !text(char.radical) || !level(char.hsk_level) || !Number.isFinite(char.stroke_count) || (char.general_standard !== undefined && !Number.isFinite(char.general_standard)) || (char.frequency_rank !== undefined && !Number.isFinite(char.frequency_rank))) fail('Carácter inválido.');
  }
  const charRows = chars as HSKCharacter[];
  const knownChars = new Set(charRows.map((row) => row.character));
  if (topicRows.some((topic) => topic.characters.some((char) => !knownChars.has(char)))) fail('Carácter desconocido en un tema.');
  unique(charRows.map((row) => row.character), 'Carácter');
  if (base) {
    const preserve = (before: string[], after: string[], label: string) => {
      const ids = new Set(after);
      if (before.some((id) => !ids.has(id))) fail(`No se puede borrar ni cambiar el identificador de ${label}.`);
    };
    preserve(base.vocabulary.map((row) => row.id), wordRows.map((row) => row.id), 'una palabra');
    preserve(base.characters.map((row) => row.character), charRows.map((row) => row.character), 'un carácter');
    preserve(base.topics.map((row) => row.id), topicRows.map((row) => row.id), 'un tema');
    const oldWords = new Map(base.vocabulary.map((row) => [row.id, row]));
    const publishedIds = new Set(published);
    // Words can move between HSK lists and Extra. The app keys progress by id, so a move keeps it.
    for (const row of wordRows) {
      if (!oldWords.has(row.id) && publishedIds.has(row.id)) fail(`El identificador ${row.id} ya se publicó para otra palabra.`);
      if (!oldWords.has(row.id) && row.level !== undefined && !/^word-/.test(row.id)) fail(`La palabra nueva ${row.simplified} necesita un identificador de catálogo.`);
    }
    const oldChars = new Map(base.characters.map((row) => [row.character, row]));
    if (charRows.some((row) => oldChars.has(row.character) && oldChars.get(row.character)?.hsk_level !== row.hsk_level)) fail('No se puede cambiar el nivel de un carácter existente.');
  }
}

export function validateDraft(value: unknown, base: ContentSnapshot, revision: string, published: Iterable<string> = []): asserts value is ContentDraft {
  if (!object(value) || value.schemaVersion !== 1 || typeof value.baseRevision !== 'string') return fail('Formato de borrador inválido.');
  if (value.baseRevision !== revision) fail('El borrador parte de una versión anterior.');
  validateSnapshot(value.snapshot, base, published);
  if (value.references !== undefined) {
    if (!object(value.references)) return fail('Referencias inválidas.');
    const ids = new Set(value.snapshot.vocabulary.map((word) => word.id));
    for (const [id, reference] of Object.entries(value.references)) {
      if (!ids.has(id) || !object(reference) || !text(reference.url) || !/^https:\/\//.test(reference.url) || !text(reference.retrieved) || !Array.isArray(reference.examples)) return fail('Referencia inválida.');
      for (const example of reference.examples) {
        if (!object(example) || !text(example.chinese) || !text(example.pinyin) || !text(example.spanish)) fail('Frase de referencia inválida.');
      }
    }
  }
}
