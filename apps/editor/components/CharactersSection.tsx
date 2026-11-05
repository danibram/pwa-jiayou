import { Component, Show, createMemo, createSignal } from 'solid-js';
import { leadSense } from '../../web/src/data/wordSenses';
import { useEditor } from '../lib/store';
import { EntryList } from './EntryList';
import { Field, Hanzi, LevelTag, Pinyin } from './text';

const matches = (haystack: string, query: string) => haystack.toLowerCase().includes(query.trim().toLowerCase());

const CharactersSection: Component = () => {
  const editor = useEditor();
  const [query, setQuery] = createSignal('');
  const [level, setLevel] = createSignal(0);
  const characters = createMemo(() => (editor.snapshot().characters ?? []).filter((c) => (level() === 0 || c.hsk_level === level()) && matches(`${c.character} ${c.traditional} ${c.pinyin} ${c.gloss ?? ''} ${c.definition}`, query())));
  const changed = createMemo(() => new Set(editor.changesDeferred().filter((change) => change.kind === 'character').map((change) => change.id)));
  const wordsWith = createMemo(() => {
    const char = editor.character();
    if (!char) return [];
    return (editor.snapshot().vocabulary ?? []).filter((w) => w.characters.includes(char.character)).slice(0, 12);
  });

  return (
    <div class="workspace">
      <EntryList
        label="Caracteres"
        items={characters()}
        key={(c) => c.character}
        selected={editor.selected()}
        onSelect={editor.setSelected}
        query={query()}
        onQuery={setQuery}
        placeholder="Carácter, pinyin o significado"
        levels
        level={level()}
        onLevel={setLevel}
        row={(c) => (
          <>
            <Hanzi text={c.character} size="md" class="row-glyph" />
            <span class="row-text">
              <span class="row-title"><Pinyin text={c.pinyin} /></span>
              <span class="row-sub">{c.gloss || c.definition}</span>
            </span>
            <span class="row-meta"><Show when={changed().has(c.character)}><span class="dot dot-changed" title="Modificado" /></Show><LevelTag level={c.hsk_level} /></span>
          </>
        )}
      />
      <section class="detail" aria-label="Ficha del carácter">
        <Show when={editor.character()} fallback={<div class="placeholder"><Hanzi text="字" size="xl" /><p>Elige un carácter para corregir su significado breve, su definición o su ejemplo.</p></div>}>
          {(c) => (
            <>
              <header class="detail-head">
                <div>
                  <p class="eyebrow"><LevelTag level={c().hsk_level} /> <span>Radical {c().radical} · {c().stroke_count} trazos</span></p>
                  <h2><Hanzi text={c().character} size="lg" /> <Pinyin text={c().pinyin} class="detail-pinyin" /><Show when={c().traditional !== c().character}><span class="muted"> · trad. <Hanzi text={c().traditional} size="sm" /></span></Show></h2>
                </div>
              </header>
              <Field label="Significado breve" value={c().gloss ?? ''} placeholder="el sentido que enseña el HSK" onInput={(value) => editor.updateCharacter('gloss', value)} hint="Lo que ve el alumno en la ficha. Si queda vacío, la app usa la primera acepción de la definición." />
              <Field label="Definición" value={c().definition} multiline onInput={(value) => editor.updateCharacter('definition', value)} />
              <fieldset class="example-field">
                <legend>Ejemplo</legend>
                <div class="grid-3">
                  <Field label="Palabra" value={c().example?.word ?? ''} mono lang="zh-Hans" onInput={(value) => editor.updateExample('word', value)} />
                  <Field label="Pinyin del ejemplo" value={c().example?.pinyin ?? ''} onInput={(value) => editor.updateExample('pinyin', value)} />
                  <Field label="Traducción del ejemplo" value={c().example?.es ?? ''} onInput={(value) => editor.updateExample('es', value)} />
                </div>
                <p class="hint">Los tres campos van juntos. Un ejemplo a medias no se publica.</p>
              </fieldset>
              <Show when={wordsWith().length}>
                <section class="related">
                  <h3>Palabras con {c().character}</h3>
                  <ul>{wordsWith().map((w) => <li><Hanzi text={w.simplified} size="sm" /> <Pinyin text={w.pinyin} /> <span class="muted">{leadSense(w.senses)}</span></li>)}</ul>
                </section>
              </Show>
            </>
          )}
        </Show>
      </section>
    </div>
  );
};

export default CharactersSection;
