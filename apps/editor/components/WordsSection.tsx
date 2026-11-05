import { Component, Show, createMemo, createSignal } from 'solid-js';
import { leadSense, sensesText } from '@jiayou/content';
import type { VocabularyEntry } from '../../web/src/data/vocabulary';
import type { HskLevel } from '../../web/src/types';
import { useEditor } from '../lib/store';
import { EntryList } from './EntryList';
import { Hanzi, LevelTag, Pinyin } from './text';
import WordForm from './WordForm';

const matches = (haystack: string, query: string) => haystack.toLowerCase().includes(query.trim().toLowerCase());

const WordsSection: Component = () => {
  const editor = useEditor();
  const [query, setQuery] = createSignal('');
  const [level, setLevel] = createSignal(0);
  const inLevel = (w: VocabularyEntry) => level() === 0 || (level() === -1 ? w.level === undefined : w.level === level());
  /** Words added in this draft come first, so a new entry is never lost at the end of 5000 rows. */
  const words = createMemo(() => {
    const rows = editor.snapshot().vocabulary.filter((w) => inLevel(w) && matches(`${w.simplified} ${w.traditional} ${w.pinyin} ${sensesText(w.senses)}`, query()));
    const fresh = rows.filter((w) => editor.isNewWord(w.id));
    return fresh.length ? [...fresh, ...rows.filter((w) => !editor.isNewWord(w.id))] : rows;
  });
  const changed = createMemo(() => new Set(editor.changesDeferred().filter((change) => change.kind === 'word').map((change) => change.id)));

  return (
    <div class="workspace">
      <EntryList
        label="Palabras"
        items={words()}
        key={(w) => w.id}
        selected={editor.selected()}
        onSelect={editor.setSelected}
        query={query()}
        onQuery={setQuery}
        levels
        extra
        level={level()}
        onLevel={setLevel}
        action={<button type="button" class="btn btn-quiet" title="Se crea en el nivel del filtro activo" onClick={() => { setQuery(''); editor.addWord(level() > 0 ? (level() as HskLevel) : undefined); }}>Nueva palabra</button>}
        row={(w) => (
          <>
            <Hanzi text={w.simplified || '…'} size="md" class="row-glyph" />
            <span class="row-text">
              <span class="row-title"><Pinyin text={w.pinyin} /></span>
              <span class="row-sub">{leadSense(w.senses) || 'Sin significado'}</span>
            </span>
            <span class="row-meta"><Show when={editor.isNewWord(w.id)}><span class="tag tag-next">Nueva</span></Show><Show when={changed().has(w.id)}><span class="dot dot-changed" title="Modificada" /></Show><LevelTag level={w.level} /></span>
          </>
        )}
      />
      <section class="detail" aria-label="Ficha de la palabra">
          <Show when={editor.word()} fallback={<div class="placeholder"><Hanzi text="词" size="xl" /><p>Elige una palabra de la lista para corregir su lectura, su traducción, sus temas o sus relaciones.</p><p class="hint">Flechas arriba y abajo recorren la lista. Cmd+S guarda el borrador.</p></div>}>
          {(w) => (
            <>
              <header class="detail-head">
                <div>
                  <p class="eyebrow"><LevelTag level={w().level} /> <span>{w().sourceId}</span></p>
                  <h2><Hanzi text={w().simplified || 'Palabra nueva'} size="lg" /> <Pinyin text={w().pinyin} class="detail-pinyin" /></h2>
                </div>
                <Show when={editor.isNewWord(w().id)}>
                  <button type="button" class="btn btn-ghost" onClick={() => editor.removeWord(w().id)}>Quitar palabra</button>
                </Show>
              </header>
              <WordForm word={w()} />
            </>
          )}
        </Show>
      </section>
    </div>
  );
};

export default WordsSection;
