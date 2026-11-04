import { Component, For, Show, createResource, createSignal } from 'solid-js';
import { message, useEditor, type Change } from '../lib/store';
import { Hanzi } from './text';

const KIND: Record<Change['kind'], string> = { word: 'Palabra', character: 'Carácter', topic: 'Tema', order: 'Orden' };

const ReviewSection: Component = () => {
  const editor = useEditor();
  const [notes, setNotes] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [plan] = createResource(
    () => (editor.server() === 'available' ? editor.changes().length : -1),
    async (count) => {
      if (count <= 0) return undefined;
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
        <ul class="change-list">
          <For each={editor.changes()}>{(change) => (
            <li class="change">
              <div class="change-head">
                <span class="tag">{KIND[change.kind]}{change.isNew ? ' nuevo' : ''}</span>
                <Show when={change.kind !== 'order'} fallback={<strong>{change.title}</strong>}>
                  <strong><Hanzi text={change.title} size="sm" /></strong>
                  <span class="muted">{change.subtitle}</span>
                </Show>
              </div>
              <table class="diff">
                <tbody>
                  <For each={change.fields}>{(field) => (
                    <tr>
                      <th scope="row">{field.name}</th>
                      <td class="before"><Show when={field.before} fallback={<span class="muted">vacío</span>}>{field.before}</Show></td>
                      <td class="after"><Show when={field.after} fallback={<span class="muted">vacío</span>}>{field.after}</Show></td>
                    </tr>
                  )}</For>
                </tbody>
              </table>
            </li>
          )}</For>
        </ul>
      </section>
      <aside class="promote" aria-label="Promover">
        <h2>Siguiente versión</h2>
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
  );
};

export default ReviewSection;
