import { describe, expect, it } from 'vitest';
import { validateDraft, validateSnapshot, type ContentSnapshot } from '../lib/model';

const base: ContentSnapshot = {
  schemaVersion: 1,
  vocabulary: [{ id: 'one', simplified: '一', traditional: '一', pinyin: 'yī', senses: [{ text: 'uno' }], level: 1, characters: ['一'], topicIds: ['numbers'], sourceId: 'hsk-2-0' }],
  characters: ['一', '二', '三', '四', '五'].map((character, index) => ({ character, traditional: character, pinyin: 'yī', definition: 'número', radical: '一', stroke_count: index + 1, hsk_level: 1 as const, general_standard: index + 1, frequency_rank: index + 1 })),
  topics: [{ id: 'numbers', title: 'Números', glyph: '一', kind: 'tag', characters: ['一', '二', '三', '四', '五'] }],
};
const copy = () => structuredClone(base);

describe('content validation', () => {
  it('validates authored examples and rejects malformed or unsafe references', () => {
    const snapshot = copy();
    snapshot.vocabulary[0].example = { chinese: '我有一个。', spanish: '' };
    expect(() => validateSnapshot(snapshot)).toThrow(/Frase incompleta/);
    snapshot.vocabulary[0].example.spanish = 'Tengo uno.';
    expect(() => validateSnapshot(snapshot)).not.toThrow();
    snapshot.vocabulary[0].example = null;
    expect(() => validateSnapshot(snapshot)).not.toThrow();
    const draft = { schemaVersion: 1, baseRevision: 'same', snapshot, references: { one: { url: 'javascript:alert(1)', retrieved: 'today', examples: [] } } };
    expect(() => validateDraft(draft, base, 'same')).toThrow(/Referencia inválida/);
    draft.references.one.url = 'https://www.tongtong.app/es/dictionary/一-yi';
    expect(() => validateDraft(draft, base, 'same')).not.toThrow();
  });
  it('accepts corrected dictionary pinyin and words without a level', () => {
    const next = copy();
    next.vocabulary[0].pinyin = 'yí';
    next.vocabulary.push({ ...next.vocabulary[0], id: 'extra', level: undefined });
    expect(() => validateSnapshot(next, base)).not.toThrow();
  });
  it('rejects duplicate ids, missing topics and invalid characters', () => {
    const duplicate = copy();
    duplicate.vocabulary.push({ ...duplicate.vocabulary[0] });
    expect(() => validateSnapshot(duplicate)).toThrow(/duplicado/);
    const missing = copy();
    missing.vocabulary[0].topicIds = ['unknown'];
    expect(() => validateSnapshot(missing)).toThrow(/Tema desconocido/);
    const invalid = copy();
    invalid.characters[0].character = 'abc';
    expect(() => validateSnapshot(invalid)).toThrow(/Carácter inválido/);
    const small = copy();
    small.topics[0].characters = ['一', '二'];
    expect(() => validateSnapshot(small)).toThrow(/al menos 5/);
    const sameTitle = copy();
    sameTitle.topics.push({ id: 'numeros', title: 'números', glyph: '一', kind: 'tag', characters: ['一', '二', '三', '四', '五'] });
    expect(() => validateSnapshot(sameTitle)).toThrow(/Título de tema duplicado/);
  });
  it('rejects inconsistent characters, duplicate topic tags and HSK membership changes', () => {
    const chars = copy();
    chars.vocabulary[0].characters = ['二'];
    expect(() => validateSnapshot(chars)).toThrow(/Caracteres incorrectos/);
    const topics = copy();
    topics.vocabulary[0].topicIds = ['numbers', 'numbers'];
    expect(() => validateSnapshot(topics)).toThrow(/Tema duplicado/);
    const moved = copy();
    moved.vocabulary[0].level = 2;
    expect(() => validateSnapshot(moved, base)).not.toThrow();
    const toExtra = copy();
    delete toExtra.vocabulary[0].level;
    expect(() => validateSnapshot(toExtra, base)).not.toThrow();
    const filed = copy();
    filed.vocabulary.push({ ...filed.vocabulary[0], id: 'nueva-1', level: 1 });
    expect(() => validateSnapshot(filed, base)).toThrow(/identificador de catálogo/);
  });
  it('rejects changed identifiers and stale drafts', () => {
    const edited = copy();
    edited.vocabulary[0].id = 'changed';
    expect(() => validateSnapshot(edited, base)).toThrow(/identificador/);
    expect(() => validateDraft({ schemaVersion: 1, baseRevision: 'old', snapshot: base }, base, 'new')).toThrow(/versión anterior/);
    expect(() => validateDraft({ schemaVersion: 2, baseRevision: 'new', snapshot: base }, base, 'new')).toThrow(/inválido/);
  });
  it('accepts curated word relations and rejects unknown or self links', () => {
    const next = copy();
    next.vocabulary.push({
      ...next.vocabulary[0],
      id: 'word-4e8c-er4',
      simplified: '二',
      traditional: '二',
      pinyin: 'èr',
      senses: [{ text: 'dos' }],
      characters: ['二'],
      relations: [{ kind: 'antonym', id: 'one' }],
    });
    next.vocabulary[0].relations = [{ kind: 'antonym', id: 'word-4e8c-er4' }];
    expect(() => validateSnapshot(next, base)).not.toThrow();
    const unknown = copy();
    unknown.vocabulary[0].relations = [{ kind: 'synonym', id: 'missing' }];
    expect(() => validateSnapshot(unknown)).toThrow(/Palabra desconocida/);
    const self = copy();
    self.vocabulary[0].relations = [{ kind: 'related', id: 'one' }];
    expect(() => validateSnapshot(self)).toThrow(/consigo misma/);
    const badKind = copy();
    badKind.vocabulary[0].relations = [{ kind: 'cousin' as 'synonym', id: 'one' }];
    expect(() => validateSnapshot(badKind)).toThrow(/Relación inválida/);
  });
});
