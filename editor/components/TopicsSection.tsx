import { Component, For, Show, createMemo, createSignal } from 'solid-js';
import { useEditor } from '../lib/store';
import { Field, Hanzi, Pinyin } from './text';

const matches = (haystack: string, query: string) => haystack.toLowerCase().includes(query.trim().toLowerCase());
const PAGE = 60;

const TopicsSection: Component = () => {
  const editor = useEditor();
  const [wordQuery, setWordQuery] = createSignal('');
  const [onlyAssigned, setOnlyAssigned] = createSignal(false);
  const [limit, setLimit] = createSignal(PAGE);
  const [charInput, setCharInput] = createSignal('');
  const topics = () => editor.snapshot().topics ?? [];
  const known = createMemo(() => new Map((editor.snapshot().characters ?? []).map((c) => [c.character, c])));
  const assignedCount = (id: string) => (editor.snapshot().vocabulary ?? []).filter((w) => w.topicIds.includes(id)).length;
  const topicWords = createMemo(() => {
    const t = editor.topic();
    if (!t) return [];
    const q = wordQuery();
    return (editor.snapshot().vocabulary ?? []).filter((w) => (!onlyAssigned() || w.topicIds.includes(t.id)) && matches(`${w.simplified} ${w.pinyin} ${w.meaning}`, q));
  });
  const changed = createMemo(() => new Set(editor.changesDeferred().filter((change) => change.kind === 'topic').map((change) => change.id)));
  const unknownChars = () => editor.topic()?.characters.filter((char) => !known().has(char)) ?? [];
  const addChars = () => {
    const t = editor.topic();
    if (!t) return;
    const chars = Array.from(charInput()).filter((char) => /\p{Script=Han}/u.test(char));
    if (chars.length) editor.setTopicCharacters([...t.characters, ...chars]);
    setCharInput('');
  };
  const index = () => topics().findIndex((t) => t.id === editor.selected());

  return (
    <div class="workspace">
      <section class="list-col" aria-label="Temas">
        <div class="list-tools">
          <p class="count">{topics().length} temas, en el orden de la app</p>
          <button type="button" class="btn btn-quiet" onClick={() => editor.addTopic()}>Nuevo tema</button>
        </div>
        <div class="list" aria-label="Lista de temas">
          <For each={topics()}>{(t) => (
            <button type="button" class="row" aria-pressed={editor.selected() === t.id} onClick={() => { editor.setSelected(t.id); setWordQuery(''); setLimit(PAGE); }}>
              <Hanzi text={t.glyph || '·'} size="md" class="row-glyph" />
              <span class="row-text">
                <span class="row-title">{t.title || 'Tema nuevo'}</span>
                <span class="row-sub">{t.characters.length} caracteres · {assignedCount(t.id)} palabras</span>
              </span>
              <span class="row-meta"><Show when={changed().has(t.id)}><span class="dot dot-changed" title="Modificado" /></Show></span>
            </button>
          )}</For>
        </div>
      </section>
      <section class="detail" aria-label="Ficha del tema">
        <Show when={editor.topic()} fallback={<div class="placeholder"><Hanzi text="题" size="xl" /><p>Elige un tema para cambiar su nombre, sus caracteres o las palabras que agrupa.</p></div>}>
          {(t) => (
            <>
              <header class="detail-head">
                <div>
                  <p class="eyebrow"><span>Tema · {t().id}</span><Show when={editor.isNewTopic(t().id)}><span class="tag tag-extra">Nuevo</span></Show></p>
                  <h2><Hanzi text={t().glyph || '·'} size="lg" /> {t().title || 'Tema nuevo'}</h2>
                </div>
                <div class="detail-actions">
                  <button type="button" class="btn btn-quiet" disabled={index() <= 0} onClick={() => editor.moveTopic(-1)} aria-label="Subir tema">↑ Subir</button>
                  <button type="button" class="btn btn-quiet" disabled={index() >= topics().length - 1} onClick={() => editor.moveTopic(1)} aria-label="Bajar tema">↓ Bajar</button>
                  <Show when={editor.isNewTopic(t().id)}><button type="button" class="btn btn-ghost" onClick={() => editor.removeTopic(t().id)}>Quitar tema</button></Show>
                </div>
              </header>
              <div class="grid-2">
                <Field label="Nombre" value={t().title} placeholder="Comida" onInput={(value) => editor.updateTopic('title', value)} hint={editor.isNewTopic(t().id) ? 'El identificador se deriva del nombre hasta que el tema se publica.' : undefined} />
                <Field label="Carácter representativo" value={t().glyph} mono lang="zh-Hans" placeholder="吃" onInput={(value) => editor.updateTopic('glyph', Array.from(value).slice(-1).join(''))} />
              </div>
              <fieldset class="chars-field">
                <legend>Caracteres del tema <span class="muted">({t().characters.length}, mínimo 5)</span></legend>
                <div class="char-chips">
                  <For each={t().characters}>{(char) => (
                    <span class="char-chip" classList={{ unknown: !known().has(char) }} title={known().get(char)?.gloss ?? known().get(char)?.definition ?? 'No está en las listas HSK'}>
                      <Hanzi text={char} size="sm" />
                      <button type="button" aria-label={`Quitar ${char}`} onClick={() => editor.setTopicCharacters(t().characters.filter((item) => item !== char))}>×</button>
                    </span>
                  )}</For>
                </div>
                <div class="add-chars">
                  <input aria-label="Añadir caracteres" class="hanzi" lang="zh-Hans" placeholder="Pega o escribe caracteres" value={charInput()} onInput={(event) => setCharInput(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addChars(); } }} />
                  <button type="button" class="btn btn-quiet" onClick={addChars}>Añadir</button>
                </div>
                <Show when={unknownChars().length}><p class="warn">Fuera de las listas HSK: {unknownChars().join(' ')}. La publicación los rechaza.</p></Show>
              </fieldset>
              <fieldset class="words-field">
                <legend>Palabras del tema <span class="muted">({assignedCount(t().id)} asignadas)</span></legend>
                <div class="list-tools">
                  <div class="search">
                    <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8" /><path d="m13 13 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
                    <input type="search" aria-label="Buscar palabras del tema" placeholder="Chino, pinyin o significado" value={wordQuery()} onInput={(event) => { setWordQuery(event.currentTarget.value); setLimit(PAGE); }} />
                  </div>
                  <label class="check compact"><input type="checkbox" checked={onlyAssigned()} onChange={(event) => { setOnlyAssigned(event.currentTarget.checked); setLimit(PAGE); }} /> Solo asignadas</label>
                </div>
                <div class="bulk">
                  <span class="count">{topicWords().length.toLocaleString('es')} palabras en el filtro</span>
                  <button type="button" class="btn btn-quiet" disabled={!wordQuery().trim() && !onlyAssigned()} onClick={() => editor.assignWords(topicWords().map((w) => w.id), t().id, true)}>Asignar resultados</button>
                  <button type="button" class="btn btn-quiet" disabled={!wordQuery().trim() && !onlyAssigned()} onClick={() => editor.assignWords(topicWords().map((w) => w.id), t().id, false)}>Quitar resultados</button>
                </div>
                <div class="list words">
                  <For each={topicWords().slice(0, limit())}>{(w) => (
                    <label class="row check-row">
                      <input type="checkbox" checked={w.topicIds.includes(t().id)} onChange={(event) => editor.toggleWordTopic(w.id, t().id, event.currentTarget.checked)} />
                      <Hanzi text={w.simplified} size="sm" class="row-glyph" />
                      <span class="row-text"><span class="row-title"><Pinyin text={w.pinyin} /></span><span class="row-sub">{w.meaning}</span></span>
                    </label>
                  )}</For>
                  <Show when={topicWords().length > limit()}>
                    <button type="button" class="btn btn-quiet more" onClick={() => setLimit((value) => value + PAGE * 2)}>Mostrar más ({(topicWords().length - limit()).toLocaleString('es')} restantes)</button>
                  </Show>
                </div>
              </fieldset>
            </>
          )}
        </Show>
      </section>
    </div>
  );
};

export default TopicsSection;
