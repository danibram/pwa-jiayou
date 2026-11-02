import { Component, For, Show, createMemo, createSignal } from 'solid-js';
import { vocabulary, type CatalogEntry, type VocabularyEntry } from '../data/vocabulary';
import { topics } from '../data/topics';
import { characterStore } from '../stores/characterStore';
import { inputFromWord, myWordsStore, type MyWordInput } from '../stores/myWordsStore';
import { characterRecord } from '../utils/characterSearch';
import Pinyin from './Pinyin';
import PinyinEditor from './PinyinEditor';

const field = 'h-11 w-full rounded-tile border border-line bg-surface px-3 text-base text-ink placeholder:text-ink-faint';

/** Keeps only Han characters. Latin from an IME session is dropped once composition ends. */
const onlyHan = (value: string): string => [...value].filter((ch) => /\p{Script=Han}/u.test(ch)).join('');

/** Each character's first listed reading, as a hint for the pinyin field. Empty when one is unknown. */
const suggestedPinyin = (hanzi: string): string => {
  const readings = [...hanzi].map((char) => characterRecord(char, characterStore.state.characters)?.pinyin.split(/[\s,;/]+/).find(Boolean));
  return readings.every(Boolean) ? readings.join(' ') : '';
};

export interface MyWordFormSeed {
  /** Listed id when editing; omit when adding. */
  id?: string;
  /** Prefill fields. */
  input?: MyWordInput;
  /** Catalog id when correcting a specific HSK row (keeps progress even if the reading changes). */
  catalogId?: string;
}

/** Build a form seed from a vocabulary card (HSK or own). */
export const seedFromWord = (word: VocabularyEntry, editing = false): MyWordFormSeed => ({
  id: editing ? word.id : undefined,
  input: inputFromWord(word),
  catalogId: word.level ? word.id : myWordsStore.catalog(word.id)?.id,
});

interface MyWordFormProps {
  seed?: MyWordFormSeed;
  onDone: (message: string) => void;
  /** Opens the vocabulary card of a catalog word. */
  onOpenWord?: (id: string) => void;
  titleId?: string;
}

/** Add / edit / correct a word for Mis palabras. */
const MyWordForm: Component<MyWordFormProps> = (props) => {
  const startInput = (): MyWordInput => props.seed?.input ?? { simplified: '', pinyin: '', meaning: '', topicIds: [] };

  const [hanzi, setHanzi] = createSignal(startInput().simplified);
  const [traditional, setTraditional] = createSignal(startInput().traditional ?? '');
  const [pinyin, setPinyin] = createSignal(startInput().pinyin);
  const [meaning, setMeaning] = createSignal(startInput().meaning);
  const [topicIds, setTopicIds] = createSignal<string[]>([...(startInput().topicIds ?? [])]);
  const [editingId] = createSignal<string | null>(props.seed?.id ?? null);
  const [catalogId, setCatalogId] = createSignal<string | null>(props.seed?.catalogId ?? null);
  const [error, setError] = createSignal('');
  const [composing, setComposing] = createSignal(false);

  const typed = () => hanzi().replace(/\s+/g, '');
  const hint = createMemo(() => (typed() ? suggestedPinyin(typed()) : ''));
  const editing = () => editingId() !== null;

  /** HSK words already spelled this way. Picking one preloads its fields for a possible correction. */
  const matches = createMemo(() => (
    !editing() && typed() ? vocabulary.filter((word) => word.simplified === typed()) : []
  ));

  const catalog = createMemo((): CatalogEntry | undefined => {
    const id = catalogId() ?? editingId();
    return id ? myWordsStore.catalog(id) : undefined;
  });

  const applyHanzi = (raw: string) => {
    const next = onlyHan(raw);
    if ([...typed()].length !== [...next].length) {
      setPinyin('');
      setCatalogId(null);
      setTraditional('');
    }
    setHanzi(next);
    setError('');
  };

  const toggleTopic = (id: string) => {
    setTopicIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
    setError('');
  };

  const preload = (word: CatalogEntry) => {
    const input = inputFromWord(word);
    setCatalogId(word.id);
    setHanzi(input.simplified);
    setTraditional(input.traditional ?? word.traditional);
    setPinyin(input.pinyin);
    setMeaning(input.meaning);
    setTopicIds([...(input.topicIds ?? [])]);
    setError('');
  };

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    setError('');
    const id = editingId();
    const input = {
      simplified: hanzi(),
      traditional: traditional() || catalog()?.traditional || undefined,
      pinyin: pinyin() || hint(),
      meaning: meaning(),
      topicIds: topicIds(),
    };
    try {
      if (id) {
        myWordsStore.update(id, input);
        const corrected = myWordsStore.isCorrection(id);
        props.onDone(corrected ? `${typed()} corregida.` : `${typed()} guardada.`);
      } else {
        const result = myWordsStore.add(input, catalogId() ?? undefined);
        if (result.alreadyListed && !result.corrected) props.onDone(`${typed()} ya estaba en tu lista.`);
        else if (result.corrected) props.onDone(result.alreadyListed ? `${typed()} corregida.` : `${typed()} añadida con tu corrección.`);
        else if (result.word.level) props.onDone(`${typed()} es de HSK ${result.word.level}: se añade con su significado y comparte tu progreso.`);
        else props.onDone(`${typed()} añadida.`);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : id ? 'No se pudo guardar la palabra.' : 'No se pudo añadir la palabra.');
    }
  };

  const title = () => {
    if (editing() && catalog()) return myWordsStore.own(editingId()!) ? 'Corregir palabra HSK' : 'Palabra de HSK';
    if (editing()) return 'Editar palabra';
    if (catalog()) return 'Añadir palabra de HSK';
    return 'Añadir palabra';
  };

  const warn = 'mt-2 rounded-tile border border-gold/35 bg-gold/10 px-3 py-2 text-sm text-ink';

  return (
    <div>
      <h2 id={props.titleId ?? 'word-form-title'} class="font-display text-lg font-semibold">{title()}</h2>
      <Show when={catalog()}>
        {(word) => (
          <p class={warn}>
            Ya está en HSK {word().level}. Se precargan sus datos; puedes corregir pinyin, significado o temas. El progreso se mantiene.
          </p>
        )}
      </Show>
      <Show when={!catalog() && matches().length > 0}>
        <p class={warn}>
          Ya está en HSK. Toca una lectura para cargar sus datos; puedes corregirlos antes de añadir.
        </p>
      </Show>
      <form class="mt-4 grid gap-3" onSubmit={submit} novalidate>
        <div class="grid gap-1">
          <label class="grid gap-1">
            <span class="text-sm font-medium">Palabra</span>
            <input
              class={`${field} font-hanzi text-xl`}
              classList={{ 'opacity-70': !!catalog() && editing() }}
              lang="zh-CN"
              inputmode="text"
              autocomplete="off"
              autocapitalize="off"
              spellcheck={false}
              aria-describedby="hanzi-hint"
              readOnly={!!catalog() && editing()}
              value={hanzi()}
              placeholder="奶茶"
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={(e) => {
                setComposing(false);
                applyHanzi(e.currentTarget.value);
              }}
              onInput={(e) => {
                if (catalog() && editing()) return;
                if (composing()) {
                  setHanzi(e.currentTarget.value);
                  return;
                }
                applyHanzi(e.currentTarget.value);
              }}
            />
          </label>
          <span id="hanzi-hint" class="text-xs text-ink-soft">En caracteres chinos. Abajo va el pinyin, sílaba a sílaba.</span>
        </div>
        <Show when={matches().length > 0}>
          <div class="grid gap-1" role="group" aria-label="Ya está en HSK">
            <For each={matches()}>{(word) => (
              <button
                type="button"
                class="flex min-h-11 items-center gap-3 rounded-tile border border-line px-3 text-left hover:bg-ink/5"
                classList={{ 'border-ink bg-ink/5': catalogId() === word.id }}
                onClick={() => preload(word)}
              >
                <span class="font-hanzi text-lg" lang="zh-CN">{word.simplified}</span>
                <Pinyin word text={word.pinyin} class="text-sm" />
                <span class="min-w-0 flex-1 truncate text-sm text-ink-soft">{word.meaning}</span>
                <span class="text-xs text-ink-faint">HSK {word.level}</span>
              </button>
            )}</For>
          </div>
        </Show>
        <div class="grid gap-1">
          <PinyinEditor
            hanzi={typed()}
            value={pinyin()}
            hint={hint()}
            onChange={(value) => {
              setPinyin(value);
              setError('');
            }}
          />
          <span id="pinyin-hint" class="text-xs text-ink-soft">
            Letras de la sílaba y tono (1–4, · neutro). También vale escribir el número al final, como «nai3».
            {hint() && !pinyin() ? ` Si no tocas nada se usa «${hint()}».` : ''}
          </span>
        </div>
        <label class="grid gap-1">
          <span class="text-sm font-medium">Significado</span>
          <input
            class={field}
            autocomplete="off"
            value={meaning()}
            placeholder="té con leche"
            onInput={(e) => {
              setMeaning(e.currentTarget.value);
              setError('');
            }}
          />
        </label>
        <div class="grid gap-1">
          <span id="topics-label" class="text-sm font-medium">Temas</span>
          <div class="flex flex-wrap gap-2" role="group" aria-labelledby="topics-label">
            <For each={topics}>{(topic) => {
              const on = () => topicIds().includes(topic.id);
              return (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on()}
                  class="flex min-h-11 items-center gap-1.5 rounded-tile border-2 px-3 text-sm transition-colors"
                  classList={{
                    'border-ink bg-ink text-paper': on(),
                    'border-line bg-surface text-ink-soft': !on(),
                  }}
                  onClick={() => toggleTopic(topic.id)}
                >
                  <span class="font-hanzi text-base" lang="zh-CN" aria-hidden="true">{topic.glyph}</span>
                  {topic.title}
                </button>
              );
            }}</For>
          </div>
          <span class="text-xs text-ink-soft">Opcional. Así sale en Temas.</span>
        </div>
        <Show when={error()}>
          <p role="alert" class="text-sm text-seal">{error()}</p>
        </Show>
        <button type="submit" class="btn-ink h-12 text-base" disabled={!typed()}>
          {editing() ? 'Guardar' : 'Añadir'}
        </button>
        <Show when={editing() && catalog() && props.onOpenWord}>
          <button
            type="button"
            class="btn-quiet h-12 text-base"
            onClick={() => {
              const id = editingId();
              if (id) props.onOpenWord?.(id);
            }}
          >
            Ver ficha
          </button>
        </Show>
      </form>
    </div>
  );
};

export default MyWordForm;
