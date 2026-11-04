import type { VocabularyEntry } from '../../src/data/vocabulary';
import type { Topic } from '../../src/data/topics';
import type { HSKCharacter } from '../../src/types';

/** Keep in sync with WORD_RELATION_KINDS in src/data/wordRelations.ts. Inlined so content-publish can load this file as a data URL. */
const RELATION_KINDS = new Set(['synonym', 'antonym', 'related', 'classifier', 'confused']);
const isWordRelationKind = (value: unknown): boolean => typeof value === 'string' && RELATION_KINDS.has(value);

export interface ContentSnapshot {
  schemaVersion: 1;
  vocabulary: VocabularyEntry[];
  characters: HSKCharacter[];
  topics: Topic[];
}

export interface ContentDraft {
  schemaVersion: 1;
  baseRevision: string;
  snapshot: ContentSnapshot;
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

export function validateSnapshot(value: unknown, base?: ContentSnapshot): asserts value is ContentSnapshot {
  if (!object(value) || value.schemaVersion !== 1 || !Array.isArray(value.vocabulary) || !Array.isArray(value.characters) || !Array.isArray(value.topics)) {
    return fail('Formato de contenido inválido.');
  }
  const topics = value.topics as unknown[];
  const words = value.vocabulary as unknown[];
  const chars = value.characters as unknown[];
  for (const topic of topics) {
    if (!object(topic) || !text(topic.id) || !/^[a-z]+$/.test(topic.id) || !text(topic.title) || !han(topic.glyph) || !Array.isArray(topic.characters) || !topic.characters.every(han)) fail('Tema inválido.');
  }
  const topicRows = topics as Topic[];
  unique(topicRows.map((row) => row.id), 'Tema');
  unique(topicRows.map((row) => row.title.trim().toLowerCase()), 'Título de tema');
  for (const topic of topicRows) {
    // The app lists a topic as a practice set; fewer than five characters makes no session.
    if (topic.characters.length < 5) fail(`El tema ${topic.title} necesita al menos 5 caracteres.`);
    if (new Set(topic.characters).size !== topic.characters.length) fail(`Carácter repetido en el tema ${topic.title}.`);
  }
  const topicIds = new Set(topicRows.map((row) => row.id));
  for (const word of words) {
    if (!object(word) || !text(word.id) || !text(word.simplified) || !text(word.traditional) || !text(word.pinyin) || !text(word.meaning) || !text(word.sourceId) || (word.level !== undefined && !level(word.level)) || !Array.isArray(word.characters) || !word.characters.every(han) || !strings(word.topicIds)) fail('Palabra inválida.');
    const row = word as unknown as VocabularyEntry;
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
  const wordRows = words as VocabularyEntry[];
  unique(wordRows.map((row) => row.id), 'Id de palabra');
  const wordIds = new Set(wordRows.map((row) => row.id));
  for (const row of wordRows) {
    for (const link of row.relations ?? []) {
      if (!wordIds.has(link.id)) fail(`Palabra desconocida en las relaciones de ${row.simplified}.`);
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
    // Words can move between HSK lists and Extra. The app keys progress by id, so a move keeps it.
    for (const row of wordRows) {
      if (!oldWords.has(row.id) && row.level !== undefined && !/^word-/.test(row.id)) fail(`La palabra nueva ${row.simplified} necesita un identificador de catálogo.`);
    }
    const oldChars = new Map(base.characters.map((row) => [row.character, row]));
    if (charRows.some((row) => oldChars.has(row.character) && oldChars.get(row.character)?.hsk_level !== row.hsk_level)) fail('No se puede cambiar el nivel de un carácter existente.');
  }
}

export function validateDraft(value: unknown, base: ContentSnapshot, revision: string): asserts value is ContentDraft {
  if (!object(value) || value.schemaVersion !== 1 || typeof value.baseRevision !== 'string') return fail('Formato de borrador inválido.');
  if (value.baseRevision !== revision) fail('El borrador parte de una versión anterior.');
  validateSnapshot(value.snapshot, base);
}
