import { Component, For, Show, createMemo, createSignal } from 'solid-js';
import PinyinEditor from '../../src/components/PinyinEditor';
import SegmentedPicker from '../../src/components/SegmentedPicker';
import type { HskLevel } from '../../src/types';
import type { VocabularyEntry } from '../../src/data/vocabulary';
import {
  SYMMETRIC_RELATION_KINDS,
  WORD_RELATION_HINTS,
  WORD_RELATION_KINDS,
  WORD_RELATION_LABELS,
  type WordRelationKind,
} from '../../src/data/wordRelations';
import { exampleFor, useEditor } from '../lib/store';
import { WORD_POS, WORD_POS_LABELS, leadSense, sensesText } from '../../src/data/wordSenses';
import { Field, Hanzi, Pinyin } from './text';

/** Keeps only Han characters, as the app's word form does. Latin left by an IME is dropped after composition. */
const onlyHan = (value: string): string => [...value].filter((ch) => /\p{Script=Han}/u.test(ch)).join('');

/** Proper nouns keep their capital (Běi jīng) when a syllable is edited through the per-syllable editor. */
const keepCapitals = (previous: string, next: string): string => {
  const before = previous.trim().split(/\s+/);
  return next.split(' ').map((syllable, i) => (/^\p{Lu}/u.test(before[i] ?? '') ? syllable.charAt(0).toUpperCase() + syllable.slice(1) : syllable)).join(' ');
};

const syllableCount = (pinyin: string) => (pinyin.trim() ? pinyin.trim().split(/\s+/).length : 0);

/**
 * The word form. Pinyin uses the app's PinyinEditor (one row per character with a tone picker),
 * hanzi input and topic chips follow the app's former word form.
 */
const matchesWord = (word: VocabularyEntry, query: string) =>
  `${word.simplified} ${word.traditional} ${word.pinyin} ${sensesText(word.senses)}`.toLowerCase().includes(query.trim().toLowerCase());

const WordForm: Component<{ word: VocabularyEntry }> = (props) => {
  const editor = useEditor();
  const [composing, setComposing] = createSignal(false);
  const [asText, setAsText] = createSignal(false);
  const [relationKind, setRelationKind] = createSignal<WordRelationKind>('synonym');
  const [relationQuery, setRelationQuery] = createSignal('');
  const isNew = () => editor.isNewWord(props.word.id);
  const chars = () => [...props.word.simplified];
  const readings = createMemo(() => new Map(editor.snapshot().characters.map((c) => [c.character, c.pinyin.split(/[\s,;/]+/).find(Boolean) ?? ''])));
  /** Each character's first reading, the same hint the app gives. */
  const hint = createMemo(() => {
    const parts = chars().map((char) => readings().get(char));
    return parts.length && parts.every(Boolean) ? parts.join(' ') : '';
  });
  /** Erhua (一会儿 yí huìr) and similar readings do not split one syllable per character. */
  // Judged on the published reading, not on what is being typed: half-typed syllables must not flip the editor to text.
  const aligned = () => {
    const published = editor.base()?.vocabulary.find((w) => w.id === props.word.id)?.pinyin;
    return !published || syllableCount(published) === chars().length;
  };
  const duplicates = createMemo(() => (isNew() && props.word.simplified ? editor.snapshot().vocabulary.filter((w) => w.id !== props.word.id && w.simplified === props.word.simplified) : []));
  const byId = createMemo(() => new Map(editor.snapshot().vocabulary.map((w) => [w.id, w])));
  const linked = (kind: WordRelationKind) => {
    const map = byId();
    const ids = new Set<string>();
    for (const row of props.word.relations ?? []) {
      if (row.kind === kind) ids.add(row.id);
    }
    if (SYMMETRIC_RELATION_KINDS.has(kind)) {
      for (const other of editor.snapshot().vocabulary) {
        if (other.id === props.word.id) continue;
        if ((other.relations ?? []).some((row) => row.kind === kind && row.id === props.word.id)) ids.add(other.id);
      }
    }
    return [...ids].map((id) => map.get(id)).filter((w): w is VocabularyEntry => !!w);
  };
  const relationHits = createMemo(() => {
    const q = relationQuery().trim();
    if (q.length < 1) return [];
    const kind = relationKind();
    const taken = new Set(linked(kind).map((w) => w.id));
    return editor.snapshot().vocabulary
      .filter((w) => w.id !== props.word.id && !taken.has(w.id) && matchesWord(w, q))
      .slice(0, 8);
  });
  const addRelation = (targetId: string) => {
    editor.setWordRelation(props.word.id, relationKind(), targetId, true);
    setRelationQuery('');
  };

  const applyHanzi = (raw: string) => {
    const next = onlyHan(raw);
    if (chars().length !== [...next].length) editor.updateWord('pinyin', '');
    editor.updateWord('simplified', next);
    if (!props.word.traditional || props.word.traditional === props.word.simplified) editor.updateWord('traditional', next);
  };

  const LEVELS = [{ value: 'extra', label: 'Extra' }, ...[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))];
  const published = () => editor.base()?.vocabulary.find((w) => w.id === props.word.id)?.level;
  const moved = () => !isNew() && published() !== props.word.level;
  const label = (level?: number) => (level ? `HSK ${level}` : 'Extra');

  return (
    <>
      <div class="field">
        <span id="word-level" class="label">Lista (Extra o nivel HSK)</span>
        <SegmentedPicker
          label="Lista"
          class="level-picker"
          value={props.word.level ? String(props.word.level) : 'extra'}
          options={LEVELS}
          onChange={(value) => editor.setWordLevel(props.word.id, value === 'extra' ? undefined : (Number(value) as HskLevel))}
        />
        <p class="hint">
          <Show when={moved()} fallback={props.word.level ? `Sale en la lista HSK ${props.word.level} de la app.` : 'Extra es una lista de estudio de la app, junto a HSK 1 a 6. Se guarda en src/data/vocabulary/extra.json.'}>
            Pasa de {label(published())} a {label(props.word.level)}. Conserva su identificador, así que el progreso de quien ya la estudia se mantiene.
            <Show when={!props.word.level}> Pasa a la lista Extra de la app.</Show>
          </Show>
        </p>
      </div>
      <div class="grid-2">
        <div class="field">
          <label for="word-simplified">Simplificado</label>
          <Show when={isNew()} fallback={<input id="word-simplified" class="hanzi" lang="zh-Hans" value={props.word.simplified} disabled />}>
            <input
              id="word-simplified"
              class="hanzi"
              lang="zh-Hans"
              autocomplete="off"
              spellcheck={false}
              placeholder="奶茶"
              value={props.word.simplified}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={(event) => { setComposing(false); applyHanzi(event.currentTarget.value); }}
              onInput={(event) => { if (!composing()) applyHanzi(event.currentTarget.value); }}
            />
          </Show>
          <p class="hint">{isNew() ? 'Solo caracteres chinos. El pinyin sale abajo, una sílaba por carácter.' : 'La escritura de una palabra HSK no cambia.'}</p>
        </div>
        <Field label="Tradicional" value={props.word.traditional} disabled={!isNew()} mono lang="zh-Hant" onInput={(value) => editor.updateWord('traditional', onlyHan(value))} />
      </div>

      <Show when={duplicates().length}>
        <div class="dup-box" role="alert">
          <p><strong>{props.word.simplified} ya existe.</strong> {duplicates().length === 1 ? 'Estos son sus datos; edítala en vez de crear otra.' : 'Tiene varias lecturas; elige la que quieras editar.'}</p>
          <For each={duplicates()}>{(w) => {
            const titles = () => editor.snapshot().topics.filter((t) => w.topicIds.includes(t.id)).map((t) => t.title).join(', ');
            return (
              <div class="dup">
                <div class="dup-head">
                  <Hanzi text={w.simplified} size="md" />
                  <Pinyin text={w.pinyin} />
                  <span class="tag">{w.level ? `HSK ${w.level}` : 'Extra'}</span>
                </div>
                <dl class="dup-data">
                  <dt>Tradicional</dt><dd><Hanzi text={w.traditional} size="sm" /></dd>
                  <dt>Significados</dt><dd>{sensesText(w.senses)}</dd>
                  <dt>Temas</dt><dd>{titles() || <span class="muted">ninguno</span>}</dd>
                </dl>
                <button type="button" class="btn btn-ink" onClick={() => { editor.removeWord(props.word.id); editor.setSelected(w.id); }}>Editar esta palabra</button>
              </div>
            );
          }}</For>
          <p class="hint">Si es otra palabra con la misma escritura, sigue rellenando esta ficha con su lectura.</p>
        </div>
      </Show>

      <div class="field pinyin-field">
        <Show
          when={aligned() && !asText()}
          fallback={<Field label="Pinyin" value={props.word.pinyin} placeholder="yí huìr" onInput={(value) => editor.updateWord('pinyin', value)} hint={aligned() ? undefined : 'Esta lectura no tiene una sílaba por carácter, así que se edita como texto.'} />}
        >
          <PinyinEditor hanzi={props.word.simplified} value={props.word.pinyin} hint={hint()} onChange={(value) => editor.updateWord('pinyin', keepCapitals(props.word.pinyin, value))} />
          <p class="hint">
            Letras de la sílaba y tono (1 a 4, · neutro). También vale escribir el número al final, como «nai3». Tonos de diccionario: la app aplica el sandhi de 一 y 不.
            <Show when={hint() && !props.word.pinyin}> Sin tocar nada se propone «{hint()}».</Show>
          </p>
        </Show>
        <Show when={aligned()}>
          <button type="button" class="link" onClick={() => setAsText(!asText())}>{asText() ? 'Editar por sílabas' : 'Editar como texto'}</button>
        </Show>
      </div>

      <fieldset class="word-senses">
        <legend>Significados</legend>
        <p class="hint">Un uso por fila, con su categoría. El primero es el que enseñan las tarjetas de repaso. La nota dice cómo se usa y solo sale en la página de la palabra.</p>
        <ol>
          <For each={props.word.senses}>{(sense, index) => (
            <li class="word-sense">
              <label class="field">
                <span>Categoría</span>
                <select value={sense.pos ?? ''} onChange={(event) => editor.updateSense(index(), 'pos', event.currentTarget.value)}>
                  <option value="">Sin categoría</option>
                  <For each={WORD_POS}>{(pos) => <option value={pos}>{WORD_POS_LABELS[pos]}</option>}</For>
                </select>
              </label>
              <Field label={index() === 0 ? 'Significado (el de la tarjeta)' : 'Significado'} value={sense.text} placeholder="comparar" onInput={(value) => editor.updateSense(index(), 'text', value)} />
              <Field label="Nota de uso" value={sense.note ?? ''} placeholder="usado con 都/也" onInput={(value) => editor.updateSense(index(), 'note', value)} />
              <div class="word-sense-actions">
                <button type="button" class="btn btn-ghost" aria-label="Subir este uso" disabled={index() === 0} onClick={() => editor.moveSense(index(), -1)}>↑</button>
                <button type="button" class="btn btn-ghost" aria-label="Bajar este uso" disabled={index() === props.word.senses.length - 1} onClick={() => editor.moveSense(index(), 1)}>↓</button>
                <button type="button" class="btn btn-ghost" disabled={props.word.senses.length === 1} onClick={() => editor.removeSense(index())}>Quitar</button>
              </div>
            </li>
          )}</For>
        </ol>
        <button type="button" class="btn btn-ghost" onClick={editor.addSense}>Añadir uso</button>
      </fieldset>

      <fieldset class="word-example">
        <legend>Frase de ejemplo</legend>
        <Field label="Frase en chino" value={exampleFor(props.word)?.chinese ?? ''} multiline lang="zh-Hans" onInput={(value) => editor.updateWordExample('chinese', value)} />
        <Field label="Traducción de la frase" value={exampleFor(props.word)?.spanish ?? ''} multiline onInput={(value) => editor.updateWordExample('spanish', value)} />
        <Show when={exampleFor(props.word)}><button type="button" class="btn btn-ghost" onClick={editor.removeWordExample}>Quitar frase</button></Show>
      </fieldset>

      <div class="field">
        <span id="word-topics" class="label">Temas y etiquetas</span>
        <For each={['theme', 'tag'] as const}>{(kind) => {
          const roots = () => editor.snapshot().topics.filter((topic) => topic.kind === kind);
          return (
            <Show when={roots().length}>
              <p class="hint" style={{ 'margin-bottom': '0.35rem' }}>{kind === 'theme' ? 'Temas y subtemas' : 'Etiquetas (se combinan con cualquier tema)'}</p>
              <div class="flex flex-wrap gap-2" role="group" aria-labelledby="word-topics" style={{ 'margin-bottom': '0.75rem' }}>
                <For each={roots()}>{(topic) => {
                  const children = () => editor.snapshot().topics.filter((row) => row.parentId === topic.id);
                  const chip = (row: typeof topic, nested = false) => {
                    const on = () => props.word.topicIds.includes(row.id);
                    return (
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on()}
                        class="flex min-h-10 items-center gap-1.5 rounded-tile border-2 px-3 text-sm transition-colors"
                        classList={{ 'border-ink bg-ink text-paper': on(), 'border-line bg-surface text-ink-soft hover:text-ink': !on(), 'opacity-90': nested }}
                        onClick={() => editor.toggleWordTopic(props.word.id, row.id, !on())}
                      >
                        <span class="font-hanzi text-base" lang="zh-Hans" aria-hidden="true">{row.glyph || '·'}</span>
                        {nested ? `↳ ${row.title || row.id}` : row.title || 'Tema nuevo'}
                      </button>
                    );
                  };
                  return (
                    <>
                      {chip(topic)}
                      <For each={children()}>{(child) => chip(child, true)}</For>
                    </>
                  );
                }}</For>
              </div>
            </Show>
          );
        }}</For>
        <p class="hint">Una palabra puede estar en varios temas. Las etiquetas (verbos, preguntas…) se cruzan con ellos.</p>
      </div>

      <fieldset class="relations-field">
        <legend>Relaciones entre palabras</legend>
        <p class="hint" style={{ 'margin-top': 0 }}>
          Curadas a mano. La app también enseña caracteres compartidos y vecinos de tono sin guardarlos aquí.
        </p>
        <For each={[...WORD_RELATION_KINDS]}>{(kind) => (
          <div class="relation-kind">
            <div class="relation-kind-head">
              <span class="label">{WORD_RELATION_LABELS[kind]}</span>
              <span class="hint" style={{ margin: 0 }}>{WORD_RELATION_HINTS[kind]}</span>
            </div>
            <div class="char-chips">
              <For each={linked(kind)} fallback={<span class="muted">Ninguna</span>}>{(other) => (
                <span class="char-chip relation-chip">
                  <Hanzi text={other.simplified} size="sm" />
                  <Pinyin text={other.pinyin} />
                  <button
                    type="button"
                    aria-label={`Quitar ${other.simplified} de ${WORD_RELATION_LABELS[kind].toLowerCase()}`}
                    onClick={() => editor.setWordRelation(props.word.id, kind, other.id, false)}
                  >
                    ×
                  </button>
                </span>
              )}</For>
            </div>
          </div>
        )}</For>
        <div class="relation-add">
          <div class="chips" role="group" aria-label="Tipo de relación a añadir" style={{ padding: 0 }}>
            <For each={[...WORD_RELATION_KINDS]}>{(kind) => (
              <button
                type="button"
                class="chip"
                aria-pressed={relationKind() === kind}
                onClick={() => setRelationKind(kind)}
              >
                {WORD_RELATION_LABELS[kind]}
              </button>
            )}</For>
          </div>
          <div class="search" style={{ 'margin-top': '.5rem' }}>
            <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8" /><path d="m13 13 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
            <input
              type="search"
              aria-label={`Buscar ${WORD_RELATION_LABELS[relationKind()].toLowerCase()}`}
              placeholder={`Añadir a ${WORD_RELATION_LABELS[relationKind()].toLowerCase()}…`}
              value={relationQuery()}
              onInput={(event) => setRelationQuery(event.currentTarget.value)}
            />
          </div>
          <Show when={relationHits().length}>
            <ul class="relation-hits" role="listbox" aria-label="Resultados">
              <For each={relationHits()}>{(hit) => (
                <li>
                  <button type="button" class="relation-hit" onClick={() => addRelation(hit.id)}>
                    <Hanzi text={hit.simplified} size="sm" />
                    <span class="row-text">
                      <span class="row-title"><Pinyin text={hit.pinyin} /></span>
                      <span class="row-sub">{leadSense(hit.senses)}</span>
                    </span>
                    <span class="tag">{hit.level ? `HSK ${hit.level}` : 'Extra'}</span>
                  </button>
                </li>
              )}</For>
            </ul>
          </Show>
        </div>
      </fieldset>
    </>
  );
};

export default WordForm;
