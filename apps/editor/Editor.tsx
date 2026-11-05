import { Component, For, Match, Show, Switch, onCleanup, onMount } from 'solid-js';
import { EditorContext, createEditorStore, type Section } from './lib/store';
import WordsSection from './components/WordsSection';
import CharactersSection from './components/CharactersSection';
import TopicsSection from './components/TopicsSection';
import ReviewSection from './components/ReviewSection';
import './content-editor.css';

const SECTIONS: { id: Section; label: string; glyph: string }[] = [
  { id: 'words', label: 'Palabras', glyph: '词' },
  { id: 'characters', label: 'Caracteres', glyph: '字' },
  { id: 'topics', label: 'Temas', glyph: '题' },
  { id: 'review', label: 'Revisar', glyph: '审' },
];

const shortDate = (iso: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [year, month, day] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(year, month - 1, day));
};

const ContentEditor: Component<{ onBack?: () => void }> = (props) => {
  const editor = createEditorStore();
  const beforeUnload = (event: BeforeUnloadEvent) => { if (editor.dirty()) { event.preventDefault(); event.returnValue = ''; } };
  const onKey = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (editor.ready()) editor.save(); }
  };
  window.addEventListener('beforeunload', beforeUnload);
  window.addEventListener('keydown', onKey);
  onCleanup(() => { window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('keydown', onKey); });
  onMount(() => void editor.load());
  const counts = () => ({ words: editor.snapshot()?.vocabulary.length ?? 0, characters: editor.snapshot()?.characters.length ?? 0, topics: editor.snapshot()?.topics.length ?? 0, review: editor.changesDeferred().length });

  return (
    <EditorContext.Provider value={editor}>
      <div class="ed">
        <header class="top">
          <div class="brand">
            <Show when={props.onBack}><button type="button" class="btn btn-ghost" onClick={() => props.onBack?.()}>← Volver</button></Show>
            <span class="seal" aria-hidden="true">文</span>
            <div>
              <h1>Editor de contenidos</h1>
              <p class="muted">Jiāyóu · <Show when={editor.version().version} fallback="sin versión">contenido v{editor.version().version}, {shortDate(editor.version().date)}</Show></p>
            </div>
          </div>
          <p class="status" role="status"><span class="dot" classList={{ 'dot-dirty': editor.dirty(), 'dot-saved': !editor.dirty() }} /><span class="status-text">{editor.status()}</span></p>
          <div class="top-actions">
            <Show when={editor.ready()}>
              <label class="btn btn-ghost file">Importar<input type="file" accept="application/json,.json" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void editor.importDraft(file); event.currentTarget.value = ''; }} /></label>
              <button type="button" class="btn btn-ghost" onClick={editor.exportDraft}>Exportar borrador</button>
              <button type="button" class="btn btn-ghost" onClick={editor.resetDraft}>Descartar borrador</button>
              <button type="button" class="btn btn-ink" onClick={editor.save} title="Cmd+S">Guardar borrador</button>
            </Show>
          </div>
        </header>
        <Show when={editor.error()}>
          <div class="alert" role="alert">
            <span>{editor.error()}</span>
            <Show when={editor.storageBlocked() && editor.rawStored() !== null}><button type="button" class="btn btn-quiet" onClick={editor.downloadStored}>Descargar copia guardada</button></Show>
            <button type="button" class="btn btn-ghost" aria-label="Cerrar aviso" onClick={() => editor.setError('')}>×</button>
          </div>
        </Show>
        <Show when={editor.ready()} fallback={<p class="loading muted">{editor.status()}</p>}>
          <div class="body">
            <nav class="rail" aria-label="Secciones del editor">
              <For each={SECTIONS}>{(item) => (
                <button type="button" aria-current={editor.section() === item.id ? 'page' : undefined} onClick={() => editor.switchSection(item.id)}>
                  <span class="hanzi rail-glyph" aria-hidden="true">{item.glyph}</span>
                  <span class="rail-label">{item.label}</span>
                  <span class="rail-count" aria-hidden="true" classList={{ 'rail-changes': item.id === 'review' && counts().review > 0 }}>{counts()[item.id].toLocaleString('es')}</span>
                </button>
              )}</For>
              <p class="rail-help">El borrador vive en este navegador. Promover escribe en el repo; git y el despliegue hacen el resto.</p>
            </nav>
            <main class="main">
              <Switch>
                <Match when={editor.section() === 'words'}><WordsSection /></Match>
                <Match when={editor.section() === 'characters'}><CharactersSection /></Match>
                <Match when={editor.section() === 'topics'}><TopicsSection /></Match>
                <Match when={editor.section() === 'review'}><ReviewSection /></Match>
              </Switch>
            </main>
          </div>
        </Show>
      </div>
    </EditorContext.Provider>
  );
};

export default ContentEditor;
