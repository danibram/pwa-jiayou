import { createContext, createDeferred, createMemo, createSignal, useContext, type Accessor } from 'solid-js';
import { WORD_POS_LABELS, sensesText, type WordPos, type WordSense } from '../../src/data/wordSenses';
import { createStore, produce, unwrap } from 'solid-js/store';
import type { VocabularyEntry } from '../../src/data/vocabulary';
import type { Topic } from '../../src/data/topics';
import type { HSKCharacter } from '../../src/types';
import type { ContentDraft, ContentSnapshot } from './model';
import { validateDraft, validateSnapshot } from './model';
import { wordId } from '../../src/utils/pinyin';
import type { HskLevel } from '../../src/types';
import { formatWordRelations, SYMMETRIC_RELATION_KINDS, type WordRelationKind } from '../../src/data/wordRelations';
import legacyExamples from '../../src/data/vocabulary/examples.json';
import type { VocabularyExample } from '../../src/data/vocabulary';

export const exampleFor = (word: VocabularyEntry) => word.example === undefined
  ? (legacyExamples as Record<string, VocabularyExample>)[word.simplified] : word.example;

export const STORAGE_KEY = 'jiayou-content-draft-v1';
export type Section = 'words' | 'characters' | 'topics' | 'review';
export interface ContentVersion { version: number; date: string; notes: string }
export interface FieldChange { name: string; before: string; after: string }
export interface Change { kind: 'word' | 'character' | 'topic' | 'order'; id: string; title: string; subtitle: string; level?: HskLevel; isNew: boolean; fields: FieldChange[] }
export interface PromotionPlan { files: string[]; version: ContentVersion }
export interface PromotionResult { version: ContentVersion; files: string[]; revision: string }

export const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export const message = (error: unknown) => (error instanceof Error ? error.message : 'Ha ocurrido un error.');

/** A saved draft may hold half-typed entries; publication validation runs on filled-in placeholders instead. */
export function validateEditableDraft(value: unknown, base: ContentSnapshot, revision: string): asserts value is ContentDraft {
  if (!value || typeof value !== 'object') throw new Error('Formato de borrador inválido.');
  const candidate = copy(value) as ContentDraft;
  if (!candidate.snapshot || !Array.isArray(candidate.snapshot.vocabulary) || !Array.isArray(candidate.snapshot.characters) || !Array.isArray(candidate.snapshot.topics)) throw new Error('Formato de borrador inválido.');
  for (const w of candidate.snapshot.vocabulary) {
    if (!w || ['simplified', 'traditional', 'pinyin'].some((key) => typeof (w as unknown as Record<string, unknown>)[key] !== 'string') || !Array.isArray(w.senses)) throw new Error('Palabra inválida.');
    w.simplified ||= '字'; w.traditional ||= '字'; w.pinyin ||= 'zi'; w.characters = Array.from(w.simplified);
    // A use still being typed is filled in for validation; an empty note is simply left out.
    if (!w.senses.length) w.senses = [{ text: 'pendiente' }];
    for (const sense of w.senses) { sense.text ||= 'pendiente'; if (!sense.note) delete sense.note; }
    if (w.example) {
      if (typeof w.example.chinese !== 'string' || typeof w.example.spanish !== 'string') throw new Error('Frase inválida.');
      w.example.chinese ||= '字'; w.example.spanish ||= 'pendiente';
    }
  }
  for (const c of candidate.snapshot.characters) {
    if (!c || typeof c.definition !== 'string') throw new Error('Carácter inválido.');
    c.definition ||= 'pendiente';
    if (c.gloss === '') delete c.gloss;
    if (c.example && JSON.stringify(c.example) !== JSON.stringify(base.characters.find((row) => row.character === c.character)?.example)) {
      c.example.word ||= '字'; c.example.pinyin ||= 'zi'; c.example.es ||= 'pendiente';
    }
  }
  for (const t of candidate.snapshot.topics) {
    if (!t || typeof t.title !== 'string' || typeof t.glyph !== 'string') throw new Error('Tema inválido.');
    t.title ||= 'pendiente'; t.glyph ||= '字';
    while (t.characters.length < 5) t.characters.push(base.characters[t.characters.length]?.character ?? '字');
  }
  validateDraft(candidate, base, revision);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const show = (value: unknown): string => {
  if (value === undefined || value === null || value === '') return '';
  if (Array.isArray(value)) return value.join(' ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

/** "Verbo: comparar · Preposición: más que" for review diffs. */
const formatSenses = (senses: WordSense[] | undefined) =>
  (senses ?? []).map((sense) => `${sense.pos ? `${WORD_POS_LABELS[sense.pos]}: ` : ''}${sense.text}${sense.note ? ` (${sense.note})` : ''}`).join(' · ');

const WORD_FIELDS: [keyof VocabularyEntry, string][] = [['simplified', 'Simplificado'], ['traditional', 'Tradicional'], ['pinyin', 'Pinyin'], ['senses', 'Significados'], ['level', 'Nivel'], ['topicIds', 'Temas'], ['relations', 'Relaciones']];
const CHARACTER_FIELDS: [keyof HSKCharacter, string][] = [['gloss', 'Significado breve'], ['definition', 'Definición'], ['pinyin', 'Pinyin'], ['traditional', 'Tradicional'], ['radical', 'Radical'], ['stroke_count', 'Trazos']];
const TOPIC_FIELDS: [keyof Topic, string][] = [['title', 'Nombre'], ['glyph', 'Carácter representativo'], ['kind', 'Tipo'], ['parentId', 'Tema padre'], ['listed', 'Visible en Temas'], ['characters', 'Caracteres']];

/** Field by field differences between the draft and the published snapshot. */
export const diffSnapshots = (current: ContentSnapshot, original: ContentSnapshot): Change[] => {
  const result: Change[] = [];
  const topicTitle = new Map(current.topics.map((topic) => [topic.id, topic.title]));
  const wordTitle = new Map(current.vocabulary.map((word) => [word.id, word.simplified || word.id]));
  const titles = (ids: string[]) => ids.map((id) => topicTitle.get(id) ?? id).join(', ');
  const relationText = (value: unknown) => formatWordRelations(value as VocabularyEntry['relations'], (id) => wordTitle.get(id) ?? id);
  const oldWords = new Map(original.vocabulary.map((row) => [row.id, row]));
  for (const word of current.vocabulary) {
    const before = oldWords.get(word.id);
    if (before && same(before, word)) continue;
    const fields: FieldChange[] = [];
    for (const [key, name] of WORD_FIELDS) {
      const a = before?.[key];
      const b = word[key];
      if (before && same(a, b)) continue;
      const format = key === 'topicIds' ? (value: unknown) => titles(value as string[]) : key === 'level' ? (value: unknown) => (value ? `HSK ${String(value)}` : 'Extra') : key === 'relations' ? relationText : key === 'senses' ? (value: unknown) => formatSenses(value as WordSense[] | undefined) : show;
      fields.push({ name, before: before ? format(a) : '', after: format(b) });
    }
    const priorExample = before && exampleFor(before);
    const nextExample = exampleFor(word);
    for (const [key, name] of [['chinese', 'Frase en chino'], ['spanish', 'Traducción de la frase']] as const) {
      if (!same(priorExample?.[key], nextExample?.[key])) fields.push({ name, before: priorExample?.[key] ?? '', after: nextExample?.[key] ?? '' });
    }
    if (fields.length) result.push({ kind: 'word', id: word.id, title: word.simplified || 'Palabra nueva', subtitle: `${word.pinyin} · ${sensesText(word.senses ?? [])}`, level: word.level, isNew: !before, fields });
  }
  const oldChars = new Map(original.characters.map((row) => [row.character, row]));
  for (const char of current.characters) {
    const before = oldChars.get(char.character);
    if (before && same(before, char)) continue;
    const fields: FieldChange[] = [];
    for (const [key, name] of CHARACTER_FIELDS) {
      if (before && same(before[key], char[key])) continue;
      fields.push({ name, before: before ? show(before[key]) : '', after: show(char[key]) });
    }
    if (!before || !same(before.example, char.example)) {
      const example = (value: HSKCharacter['example']) => (value ? `${value.word} · ${value.pinyin} · ${value.es}` : '');
      fields.push({ name: 'Ejemplo', before: before ? example(before.example) : '', after: example(char.example) });
    }
    if (fields.length) result.push({ kind: 'character', id: char.character, title: char.character, subtitle: `${char.pinyin} · ${char.gloss || char.definition}`, level: char.hsk_level, isNew: !before, fields });
  }
  const oldTopics = new Map(original.topics.map((row) => [row.id, row]));
  for (const topic of current.topics) {
    const before = oldTopics.get(topic.id);
    if (before && same(before, topic)) continue;
    const fields: FieldChange[] = [];
    for (const [key, name] of TOPIC_FIELDS) {
      if (before && same(before[key], topic[key])) continue;
      fields.push({ name, before: before ? show(before[key]) : '', after: show(topic[key]) });
    }
    if (fields.length) result.push({ kind: 'topic', id: topic.id, title: topic.title || 'Tema nuevo', subtitle: topic.glyph, isNew: !before, fields });
  }
  // Adding a topic is its own change; the order entry only reports published topics that moved.
  const originalIds = new Set(original.topics.map((topic) => topic.id));
  if (!same(current.topics.map((topic) => topic.id).filter((id) => originalIds.has(id)), original.topics.map((topic) => topic.id))) {
    result.unshift({ kind: 'order', id: 'order', title: 'Orden de los temas', subtitle: '', isNew: false, fields: [{ name: 'Orden', before: original.topics.map((topic) => topic.title).join(' → '), after: current.topics.map((topic) => topic.title).join(' → ') }] });
  }
  return result;
};

const asciiSlug = (title: string) => title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');

export type ServerState = 'unknown' | 'available' | 'missing';

export function createEditorStore() {
  const [base, setBase] = createSignal<ContentSnapshot>();
  const empty = (): ContentSnapshot => ({ schemaVersion: 1, vocabulary: [], characters: [], topics: [] });
  const [state, setState] = createStore<{ snapshot: ContentSnapshot }>({ snapshot: empty() });
  const [loaded, setLoaded] = createSignal(false);
  const [tick, setTick] = createSignal(0);
  const [revision, setRevision] = createSignal('');
  const [version, setVersion] = createSignal<ContentVersion>({ version: 0, date: '', notes: '' });
  const [section, setSection] = createSignal<Section>('words');
  const [selected, setSelected] = createSignal('');
  const [status, setStatus] = createSignal('Cargando contenido...');
  const [error, setError] = createSignal('');
  const [storageBlocked, setStorageBlocked] = createSignal(false);
  const [dirty, setDirty] = createSignal(false);
  const [rawStored, setRawStored] = createSignal<string | null>(null);
  const [server, setServer] = createSignal<ServerState>('unknown');
  const [promotion, setPromotion] = createSignal<PromotionResult>();
  const [references, setReferences] = createSignal<ContentDraft['references']>({});

  const snapshot = () => state.snapshot;
  const ready = loaded;

  const load = async () => {
    try {
      const root = `${import.meta.env.BASE_URL}base/`;
      const [snapshotResponse, manifestResponse, versionResponse] = await Promise.all([fetch(`${root}snapshot.json`), fetch(`${root}revision.json`), fetch(`${root}version.json`)]);
      if (!snapshotResponse.ok || !manifestResponse.ok) throw new Error('No se pudo cargar el contenido publicado.');
      const data: unknown = await snapshotResponse.json();
      validateSnapshot(data);
      const manifest = (await manifestResponse.json()) as { revision: string };
      if (typeof manifest.revision !== 'string') throw new Error('La revisión del contenido no es válida.');
      if (versionResponse.ok) {
        const row = (await versionResponse.json().catch(() => null)) as Partial<ContentVersion> | null;
        if (row && typeof row.version === 'number') setVersion({ version: row.version, date: typeof row.date === 'string' ? row.date : '', notes: typeof row.notes === 'string' ? row.notes : '' });
      }
      setBase(copy(data));
      setRevision(manifest.revision);
      setState('snapshot', copy(data));
      setLoaded(true);
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        setRawStored(stored);
        if (stored) {
          const draft: unknown = JSON.parse(stored);
          validateEditableDraft(draft, data, manifest.revision);
          setState('snapshot', copy(draft.snapshot));
          setReferences(copy(draft.references ?? {}));
          setTick((value) => value + 1);
          setStatus('Borrador guardado en este dispositivo');
        } else setStatus('Contenido publicado cargado');
      } catch (err) {
        setStorageBlocked(true);
        setError(`No se pudo leer el borrador guardado. ${message(err)} Exporta o revisa la copia antes de reemplazarla.`);
        setStatus('Contenido publicado cargado');
      }
    } catch (err) {
      setError(message(err));
      setStatus('No se pudo cargar el editor');
    }
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}__content/status`.replace(/^\.\//, '/'));
      setServer(response.ok ? 'available' : 'missing');
    } catch {
      setServer('missing');
    }
  };

  let autosave: ReturnType<typeof setTimeout> | undefined;
  const edit = (fn: (next: ContentSnapshot) => void) => {
    if (!loaded()) return;
    setState('snapshot', produce(fn));
    setTick((value) => value + 1);
    setDirty(true);
    setStatus('Cambios sin guardar');
    setError('');
    // A closed tab or a stray reload must not lose a new word, so drafts save themselves shortly after typing stops.
    clearTimeout(autosave);
    if (!storageBlocked()) autosave = setTimeout(() => { if (dirty()) save(); }, 800);
  };

  const draft = (): ContentDraft => ({ schemaVersion: 1, baseRevision: revision(), snapshot: copy(unwrap(state.snapshot)), references: copy(references()) });

  const save = () => {
    try {
      if (storageBlocked()) throw new Error('El borrador guardado no se puede leer. Importa una copia válida para reemplazarlo.');
      const serialized = JSON.stringify(draft());
      localStorage.setItem(STORAGE_KEY, serialized);
      setRawStored(serialized);
      setDirty(false);
      setStatus('Borrador guardado en este dispositivo');
      setError('');
    } catch (err) {
      setError(`No se pudo guardar. ${message(err)}`);
      setStatus('Cambios sin guardar');
    }
  };

  const download = (name: string, body: string) => {
    const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = name; link.click();
    URL.revokeObjectURL(url);
  };
  const exportDraft = () => download('jiayou-borrador.json', JSON.stringify(draft(), null, 2));
  const downloadStored = () => { const raw = rawStored(); if (raw !== null) download('jiayou-borrador-guardado.json', raw); };
  const publication = () => {
    try {
      validateSnapshot(unwrap(state.snapshot), base());
      download('jiayou-publicacion.json', JSON.stringify(draft(), null, 2));
      setError('');
      setStatus('Archivo de publicación descargado');
      return true;
    } catch (err) {
      setError(`Revisa el contenido antes de publicarlo. ${message(err)}`);
      return false;
    }
  };

  const importDraft = async (file: File) => {
    const original = base();
    if (!original) return;
    try {
      const value: unknown = JSON.parse(await file.text());
      validateEditableDraft(value, original, revision());
      setState('snapshot', copy(value.snapshot));
      setReferences(copy(value.references ?? {}));
      setTick((v) => v + 1);
      setStorageBlocked(false); setDirty(true); setError('');
      setStatus('Borrador importado. Guarda los cambios.');
    } catch (err) {
      setError(`No se pudo importar. ${message(err)}`);
    }
  };

  const resetDraft = () => {
    if (!window.confirm('¿Descartar los cambios y el borrador guardado en este dispositivo?')) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
      setRawStored(null); setStorageBlocked(false);
      setState('snapshot', copy(base()!));
      setReferences({});
      setTick((v) => v + 1);
      setSelected(''); setDirty(false); setError('');
      setStatus('Contenido publicado cargado');
    } catch (err) {
      setError(`No se pudo borrar el borrador. ${message(err)}`);
    }
  };

  const changes = createMemo(() => {
    const original = base();
    if (!original || !loaded()) return [];
    tick();
    return diffSnapshots(unwrap(state.snapshot), original);
  });
  // The badge and the review list can lag a keystroke; the forms cannot.
  const changesDeferred = createDeferred(changes, { timeoutMs: 250 });

  const api = async <T,>(path: string, body: unknown): Promise<T> => {
    const response = await fetch(`/__content/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? 'El servidor rechazó la petición.');
    return payload;
  };
  const plan = () => api<PromotionPlan>('plan', { draft: draft() });
  const promote = async (notes: string) => {
    validateSnapshot(unwrap(state.snapshot), base());
    const result = await api<PromotionResult>('promote', { draft: draft(), notes });
    const next = copy(unwrap(state.snapshot));
    setBase(next);
    setState('snapshot', copy(next));
    setRevision(result.revision);
    setVersion(result.version);
    setTick((v) => v + 1);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* the draft is already promoted */ }
    setRawStored(null); setStorageBlocked(false); setDirty(false); setError('');
    setPromotion(result);
    setReferences({});
    setStatus(`Contenido promovido a la versión ${result.version.version}`);
    return result;
  };

  const switchSection = (next: Section) => { setSection(next); setSelected(''); };

  const word = createMemo(() => state.snapshot.vocabulary.find((w) => w.id === selected()));
  const character = createMemo(() => state.snapshot.characters.find((c) => c.character === selected()));
  const topic = createMemo(() => state.snapshot.topics.find((t) => t.id === selected()));
  const isNewTopic = (id: string) => !base()?.topics.some((t) => t.id === id);
  const isNewWord = (id: string) => !base()?.vocabulary.some((w) => w.id === id);

  /** A new word takes the catalog id rule (hanzi then reading) until it is promoted; a published id never moves. */
  const catalogId = (s: ContentSnapshot, item: VocabularyEntry) => {
    if (!item.simplified || !item.pinyin.trim()) return item.id;
    const stem = wordId(item.simplified, item.pinyin);
    const taken = new Set(s.vocabulary.filter((w) => w !== item).map((w) => w.id));
    let id = stem;
    for (let n = 2; taken.has(id); n++) id = `${stem}-${n}`;
    return id;
  };
  const updateWord = (field: keyof VocabularyEntry, value: string) => edit((s) => {
    const item = s.vocabulary.find((w) => w.id === selected());
    if (!item) return;
    if (field === 'simplified') { item.simplified = value; item.characters = Array.from(value); }
    else Object.assign(item, { [field]: value });
    if ((field === 'simplified' || field === 'pinyin') && isNewWord(item.id)) {
      const next = catalogId(s, item);
      if (next !== item.id) { item.id = next; setSelected(next); }
    }
  });
  /** One use of the selected word: its part of speech, text or note. An empty note is removed. */
  const updateSense = (index: number, field: keyof WordSense, value: string) => edit((s) => {
    const sense = s.vocabulary.find((w) => w.id === selected())?.senses[index];
    if (!sense) return;
    if (field === 'pos') { if (value) sense.pos = value as WordPos; else delete sense.pos; }
    else if (field === 'note') { if (value.trim()) sense.note = value; else delete sense.note; }
    else sense.text = value;
  });
  /** A new use takes the part of speech of the last one, as dictionaries group them. */
  const addSense = () => edit((s) => {
    const item = s.vocabulary.find((w) => w.id === selected());
    if (!item) return;
    const pos = item.senses[item.senses.length - 1]?.pos;
    item.senses.push({ ...(pos ? { pos } : {}), text: '' });
  });
  const removeSense = (index: number) => edit((s) => {
    const item = s.vocabulary.find((w) => w.id === selected());
    if (item && item.senses.length > 1) item.senses.splice(index, 1);
  });
  /** The first use is the one cards teach, so order matters. */
  const moveSense = (index: number, step: -1 | 1) => edit((s) => {
    const item = s.vocabulary.find((w) => w.id === selected());
    const to = index + step;
    if (!item || to < 0 || to >= item.senses.length) return;
    [item.senses[index], item.senses[to]] = [item.senses[to], item.senses[index]];
  });
  const updateWordExample = (field: keyof VocabularyExample, value: string) => edit((s) => {
    const item = s.vocabulary.find((word) => word.id === selected());
    if (!item) return;
    item.example = { chinese: '', spanish: '', ...exampleFor(item), [field]: value };
  });
  const removeWordExample = () => edit((s) => {
    const item = s.vocabulary.find((word) => word.id === selected());
    if (item) item.example = null;
  });
  const setWordLevel = (id: string, level: HskLevel | undefined) => edit((s) => {
    const item = s.vocabulary.find((w) => w.id === id);
    if (!item) return;
    if (level === undefined) delete item.level;
    else item.level = level;
  });
  const toggleWordTopic = (wordId: string, topicId: string, on: boolean) => edit((s) => {
    const item = s.vocabulary.find((w) => w.id === wordId);
    if (item) item.topicIds = on ? [...new Set([...item.topicIds, topicId])] : item.topicIds.filter((id) => id !== topicId);
  });
  /** Add or remove a curated link. Symmetric kinds mirror on the other word; classifier stays one-way. */
  const setWordRelation = (wordId: string, kind: WordRelationKind, targetId: string, on: boolean) => edit((s) => {
    if (wordId === targetId) return;
    if (!s.vocabulary.some((w) => w.id === targetId)) return;
    const apply = (fromId: string, toId: string) => {
      const item = s.vocabulary.find((w) => w.id === fromId);
      if (!item) return;
      const list = item.relations ?? [];
      const exists = list.some((row) => row.kind === kind && row.id === toId);
      if (on && !exists) item.relations = [...list, { kind, id: toId }];
      if (!on && exists) {
        const next = list.filter((row) => !(row.kind === kind && row.id === toId));
        if (next.length) item.relations = next;
        else delete item.relations;
      }
    };
    apply(wordId, targetId);
    if (SYMMETRIC_RELATION_KINDS.has(kind)) apply(targetId, wordId);
  });
  const addWord = (level?: HskLevel) => {
    const id = `nueva-${crypto.randomUUID()}`;
    edit((s) => s.vocabulary.push({ id, simplified: '', traditional: '', pinyin: '', senses: [{ text: '' }], ...(level ? { level } : {}), characters: [], topicIds: [], sourceId: 'curated-extra' }));
    setSelected(id);
    return id;
  };
  const removeWord = (id: string) => {
    if (!isNewWord(id)) return;
    edit((s) => {
      s.vocabulary = s.vocabulary.filter((w) => w.id !== id);
      for (const word of s.vocabulary) {
        if (!word.relations?.length) continue;
        const next = word.relations.filter((row) => row.id !== id);
        if (next.length) word.relations = next;
        else delete word.relations;
      }
    });
    if (selected() === id) setSelected('');
  };

  const updateCharacter = (field: keyof HSKCharacter, value: string) => edit((s) => {
    const item = s.characters.find((c) => c.character === selected());
    if (!item) return;
    if (field === 'gloss' && !value) delete item.gloss;
    else Object.assign(item, { [field]: value });
  });
  const updateExample = (field: 'word' | 'pinyin' | 'es', value: string) => edit((s) => {
    const item = s.characters.find((c) => c.character === selected());
    if (item) item.example = { word: '', pinyin: '', es: '', ...item.example, [field]: value };
  });

  const uniqueTopicId = (title: string, except: string) => {
    const taken = new Set(state.snapshot.topics.filter((t) => t.id !== except).map((t) => t.id));
    let id = asciiSlug(title) || 'tema';
    let n = 2;
    const stem = id;
    while (taken.has(id)) id = `${stem}${'bcdefghijklmnopqrstuvwxyz'[(n++ - 2) % 25]}`;
    return id;
  };
  const addTopic = () => {
    const id = uniqueTopicId('tema', '');
    edit((s) => s.topics.push({ id, title: '', glyph: '', kind: 'theme', characters: [] }));
    setSelected(id);
    return id;
  };
  /** A new topic's id follows its title until it is promoted; a published id never moves. */
  const updateTopic = (field: 'title' | 'glyph' | 'kind' | 'parentId' | 'listed', value: string | boolean) => edit((s) => {
    const item = s.topics.find((t) => t.id === selected());
    if (!item) return;
    if (field === 'kind') {
      item.kind = value as Topic['kind'];
      if (item.kind !== 'subtopic') delete item.parentId;
      if (item.kind !== 'theme') delete item.listed;
      return;
    }
    if (field === 'parentId') {
      if (!value) delete item.parentId;
      else item.parentId = String(value);
      return;
    }
    if (field === 'listed') {
      if (value === false) item.listed = false;
      else delete item.listed;
      return;
    }
    item[field] = value as string;
    if (field === 'title' && isNewTopic(item.id)) {
      const next = uniqueTopicId(String(value), item.id);
      if (next !== item.id) {
        const previous = item.id;
        item.id = next;
        for (const w of s.vocabulary) w.topicIds = w.topicIds.map((id) => (id === previous ? next : id));
        setSelected(next);
      }
    }
  });
  const setTopicCharacters = (chars: string[]) => edit((s) => {
    const item = s.topics.find((t) => t.id === selected());
    if (item) item.characters = [...new Set(chars)];
  });
  const removeTopic = (id: string) => {
    if (!isNewTopic(id)) return;
    edit((s) => {
      s.topics = s.topics.filter((t) => t.id !== id);
      for (const w of s.vocabulary) w.topicIds = w.topicIds.filter((topicId) => topicId !== id);
    });
    if (selected() === id) setSelected('');
  };
  const moveTopic = (direction: number) => edit((s) => {
    const index = s.topics.findIndex((t) => t.id === selected());
    const target = index + direction;
    if (index >= 0 && target >= 0 && target < s.topics.length) [s.topics[index], s.topics[target]] = [s.topics[target], s.topics[index]];
  });
  const assignWords = (ids: string[], topicId: string, on: boolean) => edit((s) => {
    const set = new Set(ids);
    for (const w of s.vocabulary) if (set.has(w.id)) w.topicIds = on ? [...new Set([...w.topicIds, topicId])] : w.topicIds.filter((id) => id !== topicId);
  });

  return {
    base, snapshot, ready, revision, version, section, selected, setSelected, status, error, setError, storageBlocked, dirty, rawStored, server, promotion, references, updateWordExample, removeWordExample,
    load, edit, draft, save, exportDraft, downloadStored, publication, importDraft, resetDraft, changes, changesDeferred, plan, promote, switchSection,
    word, character, topic, isNewTopic, isNewWord, updateWord, updateSense, addSense, removeSense, moveSense, setWordLevel, toggleWordTopic, setWordRelation, addWord, removeWord, updateCharacter, updateExample,
    addTopic, updateTopic, setTopicCharacters, removeTopic, moveTopic, assignWords,
  };
}

export type EditorStore = ReturnType<typeof createEditorStore>;
export const EditorContext = createContext<EditorStore>();
export const useEditor = (): EditorStore => {
  const store = useContext(EditorContext);
  if (!store) throw new Error('El editor no está montado.');
  return store;
};
export type { Accessor };
