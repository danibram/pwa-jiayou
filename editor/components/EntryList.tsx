import { For, Show, createEffect, createMemo, createSignal, type JSX } from 'solid-js';

interface EntryListProps<T> {
  label: string;
  items: T[];
  key: (item: T) => string;
  selected: string;
  onSelect: (id: string) => void;
  row: (item: T) => JSX.Element;
  query: string;
  onQuery: (value: string) => void;
  placeholder?: string;
  levels?: boolean;
  /** Adds an Extra chip, sent as level -1, for words outside the HSK lists. */
  extra?: boolean;
  level: number;
  onLevel: (level: number) => void;
  action?: JSX.Element;
  empty?: string;
}

const PAGE = 80;

/** Search box, level chips and a keyboard-navigable list that grows in pages. */
export function EntryList<T>(props: EntryListProps<T>) {
  const [limit, setLimit] = createSignal(PAGE);
  createEffect(() => { props.query; props.level; setLimit(PAGE); });
  const visible = createMemo(() => props.items.slice(0, limit()));
  const noun = () => props.label.toLowerCase();
  let list: HTMLDivElement | undefined;

  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const ids = visible().map(props.key);
    const index = ids.indexOf(props.selected);
    const next = ids[event.key === 'ArrowDown' ? Math.min(ids.length - 1, index + 1) : Math.max(0, index - 1)];
    if (next === undefined || next === props.selected) return;
    event.preventDefault();
    props.onSelect(next);
    list?.querySelector<HTMLElement>(`[data-id="${CSS.escape(next)}"]`)?.scrollIntoView({ block: 'nearest' });
  };

  return (
    <section class="list-col" aria-label={props.label}>
      <div class="list-tools">
        <div class="search">
          <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8" /><path d="m13 13 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
          <input type="search" aria-label={`Buscar ${noun()}`} placeholder={props.placeholder ?? 'Chino, pinyin o significado'} value={props.query} onInput={(event) => props.onQuery(event.currentTarget.value)} />
        </div>
        {props.action}
      </div>
      <Show when={props.levels}>
        <div class="chips" role="group" aria-label="Nivel">
          <For each={[0, 1, 2, 3, 4, 5, 6, ...(props.extra ? [-1] : [])]}>{(level) => (
            <button type="button" class="chip" aria-pressed={props.level === level} onClick={() => props.onLevel(level)}>{level === 0 ? 'Todos' : level === -1 ? 'Extra' : `HSK ${level}`}</button>
          )}</For>
        </div>
      </Show>
      <p class="count" aria-live="polite">{props.items.length.toLocaleString('es')} {props.items.length === 1 ? noun().replace(/s$/, '') : noun()}</p>
      <div class="list" ref={list} tabIndex={0} onKeyDown={onKey} aria-label={`Lista de ${noun()}`}>
        <Show when={props.items.length} fallback={<p class="empty">{props.empty ?? 'Sin resultados.'}</p>}>
          <For each={visible()}>{(item) => (
            <button type="button" class="row" data-id={props.key(item)} aria-pressed={props.selected === props.key(item)} onClick={() => props.onSelect(props.key(item))}>
              {props.row(item)}
            </button>
          )}</For>
          <Show when={props.items.length > limit()}>
            <button type="button" class="btn btn-quiet more" onClick={() => setLimit((value) => value + PAGE * 2)}>
              Mostrar más ({(props.items.length - limit()).toLocaleString('es')} restantes)
            </button>
          </Show>
        </Show>
      </div>
    </section>
  );
}
