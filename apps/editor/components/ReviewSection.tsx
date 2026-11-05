import { Component, For, Show, createMemo, createResource, createSignal } from 'solid-js';
import { sensesText } from '../../web/src/data/wordSenses';
import { exampleFor, message, useEditor, type Change } from '../lib/store';
import { formatWordRelations } from '../../web/src/data/wordRelations';
import { EntryList } from './EntryList';
import { Hanzi, LevelTag } from './text';

const KIND: Record<Change['kind'], string> = { word: 'Palabra', character: 'Carácter', topic: 'Tema', order: 'Orden' };
const changeKey = (change: Change) => `${change.kind}:${change.id}`;
const searchable = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const ReviewSection: Component = () => {
  const editor = useEditor();
  const [notes, setNotes] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [query, setQuery] = createSignal('');
  const [level, setLevel] = createSignal(0);
  const [kind, setKind] = createSignal('all');
  const [selected, setSelected] = createSignal('');
  const reviewEntries = createMemo(() => {
    const changes = editor.changes();
    const changed = new Set(changes.filter((change) => change.kind === 'word').map((change) => change.id));
    const references = editor.references() ?? {};
    return [...changes, ...editor.snapshot().vocabulary.filter((word) => references[word.id] && !changed.has(word.id)).map((word): Change => ({
      kind: 'word', id: word.id, title: word.simplified, subtitle: `${word.pinyin} · ${sensesText(word.senses)}`, level: word.level, isNew: false, fields: [],
    }))];
  });
  const filtered = createMemo(() => {
    const terms = searchable(query()).trim().split(/\s+/).filter(Boolean);
    return reviewEntries().filter((change) => {
      if (kind() !== 'all' && change.kind !== kind()) return false;
      if (level() === -1 && !(change.kind === 'word' && change.level === undefined)) return false;
      if (level() > 0 && change.level !== level()) return false;
      const content = searchable([change.title, change.subtitle, ...change.fields.flatMap((field) => [field.before, field.after])].join(' '));
      return terms.every((term) => content.includes(term));
    });
  });
  const current = createMemo(() => filtered().find((change) => changeKey(change) === selected()) ?? filtered()[0]);
  const context = createMemo(() => {
    const change = current();
    if (!change || change.kind !== 'word') return [];
    const word = editor.snapshot().vocabulary.find((word) => word.id === change.id);
    if (!word) return [];
    const fields: { name: string; value: string }[] = [];
    const example = exampleFor(word);
    if (example && !change.fields.some((field) => ['Frase en chino', 'Traducción de la frase'].includes(field.name))) {
      fields.push({ name: 'Frase de ejemplo', value: `${example.chinese}\n${example.spanish}` });
    }
    if (!change.fields.some((field) => field.name === 'Relaciones')) {
      const words = new Map(editor.snapshot().vocabulary.map((word) => [word.id, word.simplified]));
      const relations = formatWordRelations(word.relations, (id) => words.get(id) ?? id);
      if (relations) fields.push({ name: 'Relaciones', value: relations });
    }
    return fields;
  });
  const position = () => filtered().findIndex((change) => change === current());
  const move = (offset: number) => {
    const change = filtered()[position() + offset];
    if (change) setSelected(changeKey(change));
  };
  const editCurrent = () => {
    const change = current();
    if (!change || change.kind === 'order') return;
    editor.switchSection(change.kind === 'word' ? 'words' : change.kind === 'character' ? 'characters' : 'topics');
    editor.setSelected(change.id);
  };
  const [plan] = createResource(
    () => (editor.server() === 'available' ? editor.changes() : undefined),
    async (changes) => {
      if (!changes.length) return undefined;
      try { return { ok: true as const, ...(await editor.plan()) }; }
      catch (err) { return { ok: false as const, error: message(err) }; }
    },
  );
  const next = () => editor.version().version + 1;
  const promote = async () => {
    if (busy()) return;
    const count = editor.changes().length;
    if (!window.confirm(`Promover ${count} ${count === 1 ? 'cambio' : 'cambios'} a la versión ${next()} del contenido. Los archivos del repo se sobrescriben; git conserva la versión anterior.`)) return;
    setBusy(true);
    try { await editor.promote(notes()); setNotes(''); }
    catch (err) { editor.setError(`No se pudo promover. ${message(err)}`); }
    finally { setBusy(false); }
  };

  return (
    <div class="review">
      <div class="review-browser">
        <div class="review-kind">
          <label for="review-kind">Tipo de entrada</label>
          <select id="review-kind" value={kind()} onChange={(event) => setKind(event.currentTarget.value)}>
            <option value="all">Todas las entradas</option>
            <option value="word">Palabras</option>
            <option value="character">Caracteres</option>
            <option value="topic">Temas</option>
            <option value="order">Orden de temas</option>
          </select>
        </div>
        <EntryList
          label="Cambios" items={filtered()} key={changeKey}
          selected={current() ? changeKey(current()!) : ''} onSelect={setSelected}
          query={query()} onQuery={setQuery} placeholder="Palabra, pinyin o traducción"
          levels extra level={level()} onLevel={setLevel}
          empty={reviewEntries().length ? 'No hay cambios con estos filtros.' : 'No hay cambios pendientes.'}
          row={(change) => <>
            <Show when={change.kind === 'word' || change.kind === 'character'} fallback={<span class="review-kind-label">{KIND[change.kind]}</span>}>
              <Hanzi text={change.title} size="md" class="row-glyph" />
            </Show>
            <span class="row-text">
              <span class="row-title">{change.kind === 'word' || change.kind === 'character' ? change.subtitle.split(' · ')[0] : change.title}</span>
              <span class="row-sub">{KIND[change.kind]} · {change.fields.length ? change.fields.map((field) => field.name).join(', ') : 'Referencias para redactar'}</span>
            </span>
            <Show when={change.kind === 'word' || change.kind === 'character'}><LevelTag level={change.level} /></Show>
          </>}
        />
        <p class="review-filter-hint">El filtro usa el nivel propuesto. Los temas aparecen en Todos.</p>
      </div>
      <div class="review-main">
      <section class="changes" aria-label="Cambios del borrador">
        <header class="section-head">
          <h2>Cambios respecto a la versión {editor.version().version || '?'}</h2>
          <p class="muted">{editor.changes().length === 0 ? 'El borrador coincide con el contenido publicado.' : `${editor.changes().length} ${editor.changes().length === 1 ? 'elemento modificado' : 'elementos modificados'}.`}</p>
        </header>
        <Show when={editor.promotion()}>{(result) => (
          <div class="done">
            <p><strong>Contenido v{result().version.version} escrito en el repo.</strong> {result().files.length} archivos. Revisa el diff con git, haz commit y despliega: la app ofrecerá la actualización a quien la tenga instalada.</p>
            <ul class="files"><For each={result().files}>{(file) => <li><code>{file}</code></li>}</For></ul>
          </div>
        )}</Show>
        <Show when={current()} fallback={
          <Show when={reviewEntries().length > 0}>
            <p class="empty">No hay entradas para comparar. Cambia los filtros o la búsqueda.</p>
            <button type="button" class="btn btn-quiet" onClick={() => { setLevel(0); setKind('all'); setQuery(''); }}>Limpiar filtros</button>
          </Show>
        }>{(change) => (
          <article class="review-entry" aria-label={`Cambios de ${change().title}`}>
            <nav class="review-navigation" aria-label="Recorrer cambios">
              <p aria-live="polite">{position() + 1} de {filtered().length} entradas</p>
              <div>
                <button type="button" class="btn btn-quiet" disabled={position() <= 0} onClick={() => move(-1)}>Anterior</button>
                <button type="button" class="btn btn-quiet" disabled={position() >= filtered().length - 1} onClick={() => move(1)}>Siguiente</button>
              </div>
            </nav>
            <header class="review-entry-head">
              <div>
                <p class="eyebrow"><span>{KIND[change().kind]}{change().isNew ? ' nuevo' : ''}</span>
                  <Show when={change().kind === 'word' || change().kind === 'character'}><LevelTag level={change().level} /></Show>
                </p>
                <h3><Show when={change().kind === 'word' || change().kind === 'character'} fallback={change().title}>
                  <Hanzi text={change().title} size="lg" />
                  <span class="review-reading">{change().subtitle.split(' · ')[0]}</span>
                </Show></h3>
              </div>
              <Show when={change().kind !== 'order'}><button type="button" class="btn btn-quiet" onClick={editCurrent}>Editar ficha</button></Show>
            </header>
            <Show when={change().fields.length} fallback={<p class="muted">Esta entrada conserva el contenido publicado. Tiene referencias para preparar una propuesta.</p>}><table class="diff">
              <caption>{change().fields.length} {change().fields.length === 1 ? 'campo modificado' : 'campos modificados'}</caption>
              <thead><tr><th scope="col">Campo</th><th scope="col">Publicado</th><th scope="col">Propuesta</th></tr></thead>
              <tbody>
                <For each={change().fields}>{(field) => (
                  <tr>
                    <th scope="row">{field.name}</th>
                    <td class="before" data-label="Publicado"><Show when={field.before} fallback={<span class="muted">Sin valor</span>}>{field.before}</Show></td>
                    <td class="after" data-label="Propuesta"><Show when={field.after} fallback={<span class="muted">Sin valor</span>}>{field.after}</Show></td>
                  </tr>
                )}</For>
              </tbody>
            </table></Show>
            <Show when={context().length}>
              <section class="review-context" aria-label="Contenido que se conserva">
                <h4>Se conserva</h4>
                <dl><For each={context()}>{(field) => <div><dt>{field.name}</dt><dd>{field.value}</dd></div>}</For></dl>
              </section>
            </Show>
            <Show when={change().kind === 'word' && editor.references()?.[change().id]}>{(reference) => (
              <details class="review-references">
                <summary>Frases de referencia · {reference().examples.length}</summary>
                <p class="hint">Estas frases son de la fuente. No se publican con el borrador. Redacta un ejemplo propio en Editar ficha.</p>
                <a href={reference().url} target="_blank" rel="noreferrer">Consultar la ficha de origen</a>
                <ul><For each={reference().examples}>{(example) => <li>
                  <p lang="zh-Hans" class="hanzi">{example.chinese}</p>
                  <p lang="zh-Latn-pinyin" class="muted">{example.pinyin}</p>
                  <p>{example.spanish}</p>
                </li>}</For></ul>
              </details>
            )}</Show>
          </article>
        )}</Show>
      </section>
      <aside class="promote" aria-label="Promover">
        <h2>Siguiente versión</h2>
        <p class="review-publish-scope">La publicación incluye el borrador completo, con {editor.changes().length} {editor.changes().length === 1 ? 'cambio' : 'cambios'}. Los filtros solo afectan a la revisión.</p>
        <p class="version-line"><span class="tag">v{editor.version().version || '?'}</span> <span aria-hidden="true">→</span> <span class="tag tag-next">v{next()}</span></p>
        <Show when={editor.server() === 'available'} fallback={
          <div class="offline-promote">
            <p class="muted">{editor.server() === 'unknown' ? 'Comprobando el servidor del editor…' : 'Este editor se sirve sin el servidor de desarrollo, así que no puede escribir en el repo. Descarga el archivo y promuévelo desde la terminal:'}</p>
            <Show when={editor.server() === 'missing'}>
              <pre><code>npm --prefix editor run promote -- ~/Downloads/jiayou-publicacion.json</code></pre>
              <button type="button" class="btn btn-ink" disabled={editor.changes().length === 0} onClick={() => editor.publication()}>Descargar para publicar</button>
            </Show>
          </div>
        }>
          <div class="field">
            <label for="promote-notes">Qué cambia en esta versión</label>
            <textarea id="promote-notes" rows={3} value={notes()} placeholder="Corrige la glosa de 的 y renombra el tema Familia." onInput={(event) => setNotes(event.currentTarget.value)} />
            <p class="hint">Queda en content/version.json. Si lo dejas vacío, se escribe un texto genérico.</p>
          </div>
          <Show when={plan.loading}><p class="muted">Calculando los archivos…</p></Show>
          <Show when={plan()}>{(result) => (
            <Show when={result().ok} fallback={<p class="warn" role="alert">{(result() as { error: string }).error}</p>}>
              <p class="muted">Se escribirán {(result() as { files: string[] }).files.length} archivos:</p>
              <ul class="files"><For each={(result() as { files: string[] }).files}>{(file) => <li><code>{file}</code></li>}</For></ul>
            </Show>
          )}</Show>
          <button type="button" class="btn btn-seal promote-btn" disabled={busy() || editor.changes().length === 0 || !(plan()?.ok ?? false)} onClick={() => void promote()}>
            {busy() ? 'Promoviendo…' : `Promover a la versión ${next()}`}
          </button>
          <p class="hint">Escribe los archivos en el repo, sube la versión del contenido y regenera el índice de búsqueda. El borrador local se vacía al terminar.</p>
          <details class="alt">
            <summary>Prefiero descargar el archivo</summary>
            <button type="button" class="btn btn-quiet" disabled={editor.changes().length === 0} onClick={() => editor.publication()}>Descargar para publicar</button>
          </details>
        </Show>
      </aside>
      </div>
    </div>
  );
};

export default ReviewSection;
