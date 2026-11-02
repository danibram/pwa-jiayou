import { Component, createMemo, createSignal, For, onCleanup, Show } from 'solid-js';
import Icon from '../components/Icon';
import Drawer from '../components/Drawer';
import MyWordForm, { seedFromWord, type MyWordFormSeed } from '../components/MyWordForm';
import Pinyin from '../components/Pinyin';
import Toast from '../components/Toast';
import TopBar from '../components/TopBar';
import { MY_WORDS_LIST } from '../data/lists';
import { topicById } from '../data/topics';
import { findWord, myWordsStore, type MyWordInput } from '../stores/myWordsStore';
import { vocabularyStore } from '../stores/vocabularyStore';
import { saveStudyMedia } from '../utils/levelPacks';
import { formatMyWordsList, parseWordList, shareWordListText, wordKind, type WordLine } from '../utils/wordListImport';

const topicLabel = (ids: readonly string[]): string =>
  ids.map((id) => topicById(id)?.title).filter((title): title is string => !!title).join(' · ');

interface MisPalabrasProps {
  onBack: () => void;
  onOpenWord: (id: string) => void;
}

/** The learner's own list: words from class, a book or a series, with or without HSK. */
const MisPalabras: Component<MisPalabrasProps> = (props) => {
  const [drawer, setDrawer] = createSignal(false);
  const [formSeed, setFormSeed] = createSignal<MyWordFormSeed | undefined>();
  let dismissDrawer = () => {};
  const [notice, setNotice] = createSignal('');
  const [toast, setToast] = createSignal<{ title: string; description?: string } | null>(null);
  const [shareDone, setShareDone] = createSignal(false);
  let shareDoneTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(shareDoneTimer));
  const [error, setError] = createSignal('');

  const studying = () => vocabularyStore.isSelected(MY_WORDS_LIST);
  /** Temas and Hoy need the list checked; adding a word turns it on if it was off. */
  const ensureStudyingMine = () => {
    if (studying()) return;
    vocabularyStore.selectLists([...vocabularyStore.state.selectedLists, MY_WORDS_LIST]);
  };
  const [pasting, setPasting] = createSignal(false);
  const [pasted, setPasted] = createSignal('');
  const [review, setReview] = createSignal<WordLine[] | null>(null);

  /** What adding the reviewed lines would do. A word repeated in the paste counts once. */
  const plan = createMemo(() => {
    const seen = new Set<string>();
    const fresh: Required<MyWordInput>[] = [];
    let hsk = 0, listed = 0, repeated = 0;
    const errors: Extract<WordLine, { ok: false }>[] = [];
    for (const row of review() ?? []) {
      if (!row.ok) { errors.push(row); continue; }
      const { id, inCatalog } = wordKind(row.value);
      if (seen.has(id)) { repeated += 1; continue; }
      seen.add(id);
      if (myWordsStore.has(id)) listed += 1;
      else { fresh.push(row.value); if (inCatalog) hsk += 1; }
    }
    return { fresh, hsk, listed, repeated, errors };
  });

  const clear = () => {
    setFormSeed(undefined);
    setError('');
    setPasting(false);
    setPasted('');
    setReview(null);
  };

  const openAdd = () => {
    clear();
    setFormSeed({});
    setDrawer(true);
  };

  const openPaste = () => {
    clear();
    setPasting(true);
    setNotice('');
    setDrawer(true);
  };

  const openEdit = (id: string) => {
    const word = findWord(id);
    if (!word) return;
    clear();
    setFormSeed(seedFromWord(word, true));
    setNotice('');
    setDrawer(true);
  };

  const closeDrawer = () => {
    setDrawer(false);
    clear();
  };

  const finishDrawer = (message: string) => {
    setNotice(message);
    setError('');
    dismissDrawer();
    ensureStudyingMine();
    void saveStudyMedia();
  };

  const addAll = () => {
    const { fresh, listed } = plan();
    setNotice('');
    let done = 0, hsk = 0;
    for (const word of fresh) {
      try {
        const result = myWordsStore.add(word);
        if (!result.alreadyListed) { done += 1; if (result.inCatalog) hsk += 1; }
      } catch {
        // The review already checked every word.
      }
    }
    const parts = [done === 1 ? '1 palabra añadida' : `${done} palabras añadidas`];
    if (hsk) parts.push(hsk === 1 ? '1 es de HSK y comparte tu progreso' : `${hsk} son de HSK y comparten tu progreso`);
    if (listed) parts.push(listed === 1 ? '1 ya estaba en tu lista' : `${listed} ya estaban en tu lista`);
    setNotice(`${parts.join('. ')}.`);
    setError('');
    dismissDrawer();
    if (done > 0) {
      ensureStudyingMine();
      void saveStudyMedia();
    }
  };

  const markShareDone = () => {
    setShareDone(true);
    clearTimeout(shareDoneTimer);
    shareDoneTimer = setTimeout(() => setShareDone(false), 1600);
  };

  const shareList = async () => {
    const text = formatMyWordsList();
    if (!text) return;
    setNotice('');
    setError('');
    setToast(null);
    try {
      const result = await shareWordListText(text);
      markShareDone();
      if (result === 'shared') {
        setToast({ title: 'Lista compartida' });
      } else {
        setToast({
          title: 'Lista copiada',
          description: 'Pégala donde quieras, o en «Pegar una lista» en otro móvil.',
        });
      }
    } catch (failure) {
      if (failure instanceof Error && failure.name === 'AbortError') return;
      setError(failure instanceof Error ? failure.message : 'No se pudo compartir la lista.');
    }
  };

  return (
    <div class="screen">
      <div class="animate-rise">
        <TopBar title="Mis palabras" onBack={props.onBack} backLabel="Volver" />
      </div>
      <Toast
        open={!!toast()}
        type="success"
        title={toast()?.title ?? ''}
        description={toast()?.description}
        onClose={() => setToast(null)}
      />
      <div class="min-h-0 flex-1 overflow-y-auto no-scrollbar pb-6 pt-3">
        <p class="animate-rise text-sm leading-relaxed text-ink-soft [animation-delay:60ms]">
          Palabras de clase, de un libro o de una serie, estén o no en HSK. Si ya está en HSK, se precarga; puedes corregirla y el progreso se comparte.
        </p>

        <div class="mt-4 flex items-center gap-2 animate-rise [animation-delay:90ms]">
          <button type="button" class="btn-ink h-12 flex-1 px-5 text-base" onClick={openAdd}>Añadir palabra</button>
          <button type="button" class="btn-quiet h-12 w-12 shrink-0" aria-label="Pegar una lista" onClick={openPaste}>
            <Icon name="paste" size={20} />
          </button>
          <Show when={myWordsStore.ids.length > 0}>
            <button
              type="button"
              class="btn-quiet h-12 w-12 shrink-0"
              classList={{ 'border-jade text-jade': shareDone() }}
              aria-label="Compartir lista"
              onClick={() => void shareList()}
            >
              <Show when={shareDone()} fallback={<Icon name="share" size={20} />}>
                <Icon name="check" size={20} class="animate-tick" />
              </Show>
            </button>
          </Show>
        </div>
        <Show when={drawer()}>
          <Drawer onClose={closeDrawer} dismissRef={(dismiss) => { dismissDrawer = dismiss; }} aria-labelledby="word-drawer-title">
            <div class="px-4 pb-6">
              <Show when={pasting()}>
                <h2 id="word-drawer-title" class="font-display text-lg font-semibold">Pegar una lista</h2>
                <div class="mt-4 grid gap-3">
                  <div class="grid gap-1">
                    <label class="grid gap-1">
                      <span class="text-sm font-medium">Lista</span>
                      <textarea
                        class="min-h-32 w-full rounded-tile border border-line bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-faint"
                        rows={6}
                        autocomplete="off"
                        autocapitalize="off"
                        spellcheck={false}
                        aria-describedby="paste-hint"
                        value={pasted()}
                        placeholder={'奶茶\tnai3 cha2\tté con leche'}
                        onInput={(e) => { setPasted(e.currentTarget.value); setReview(null); }}
                      />
                    </label>
                    <span id="paste-hint" class="text-xs text-ink-soft">
                      Una palabra por línea, separada por tabulador, «;» o « / ». Fuera de HSK: palabra, pinyin y significado. En HSK basta la palabra, o la palabra y el significado. Los temas se ajustan luego en cada palabra.
                    </span>
                  </div>
                  <button type="button" class="btn-quiet h-12 text-base" disabled={!pasted().trim()} onClick={() => setReview(parseWordList(pasted()))}>Revisar</button>
                  <Show when={review()}>
                    <div class="grid gap-2 text-sm">
                      <p>
                        {plan().fresh.length === 1 ? 'Se añadirá 1 palabra.' : `Se añadirán ${plan().fresh.length} palabras.`}
                        {plan().hsk > 0 ? ` De ellas, ${plan().hsk} ya están en HSK y comparten tu progreso.` : ''}
                      </p>
                      <Show when={plan().listed > 0}>
                        <p class="text-ink-soft">{plan().listed === 1 ? '1 ya está en tu lista.' : `${plan().listed} ya están en tu lista.`}</p>
                      </Show>
                      <Show when={plan().repeated > 0}>
                        <p class="text-ink-soft">{plan().repeated === 1 ? '1 línea repite otra.' : `${plan().repeated} líneas repiten otra.`}</p>
                      </Show>
                      <Show when={plan().errors.length > 0}>
                        <div>
                          <p class="font-medium text-seal">{plan().errors.length === 1 ? '1 línea con error, no se añadirá:' : `${plan().errors.length} líneas con error, no se añadirán:`}</p>
                          <ul class="mt-1 grid gap-1">
                            <For each={plan().errors}>{(row) => (
                              <li class="text-ink-soft">
                                <span class="text-seal">Línea {row.line}:</span> {row.error} <span class="font-hanzi" lang="zh-CN">{row.input}</span>
                              </li>
                            )}</For>
                          </ul>
                        </div>
                      </Show>
                      <Show when={(review() ?? []).length === 0}>
                        <p class="text-ink-soft">No hay ninguna línea que leer.</p>
                      </Show>
                    </div>
                    <Show when={plan().fresh.length > 0}>
                      <button type="button" class="btn-ink h-12 text-base" onClick={addAll}>
                        {plan().fresh.length === 1 ? 'Añadir 1 palabra' : `Añadir ${plan().fresh.length} palabras`}
                      </button>
                    </Show>
                  </Show>
                </div>
              </Show>
              <Show when={!pasting() && formSeed() !== undefined}>
                <MyWordForm
                  seed={formSeed()}
                  titleId="word-drawer-title"
                  onDone={finishDrawer}
                  onOpenWord={(id) => {
                    dismissDrawer();
                    props.onOpenWord(id);
                  }}
                />
              </Show>
            </div>
          </Drawer>
        </Show>
        <Show when={notice()}>
          <p role="status" class="mt-3 text-sm text-ink-soft">{notice()}</p>
        </Show>

        <Show when={error() && !drawer()}>
          <p role="alert" class="mt-3 text-sm text-seal">{error()}</p>
        </Show>

        <section class="mt-6 animate-rise [animation-delay:140ms]">
          <div class="flex items-center justify-between gap-3">
            <h2 class="font-display text-lg font-semibold">
              {myWordsStore.ids.length === 1 ? '1 palabra' : `${myWordsStore.ids.length} palabras`}
            </h2>
            <button
              type="button"
              role="checkbox"
              aria-checked={studying()}
              class="flex min-h-11 items-center gap-2 text-sm"
              onClick={() => {
                const adding = !studying();
                vocabularyStore.toggleList(MY_WORDS_LIST);
                if (adding) void saveStudyMedia();
              }}
            >
              <span
                class="flex h-5 w-5 items-center justify-center rounded border-2"
                classList={{ 'border-ink bg-ink text-paper': studying(), 'border-line bg-surface': !studying() }}
                aria-hidden="true"
              >
                <Show when={studying()}><Icon name="check" size={12} /></Show>
              </span>
              Estudiar cada día
            </button>
          </div>
          <Show when={myWordsStore.ids.length > 0} fallback={<p class="mt-2 text-sm text-ink-soft">Todavía no has añadido ninguna.</p>}>
            <ul class="mt-2" aria-label="Mis palabras">
              <For each={[...myWordsStore.words()].reverse()}>{(word) => (
                <li class="flex min-h-14 items-center gap-3 border-b border-line py-2">
                  <button type="button" class="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left" onClick={() => openEdit(word.id)}>
                  <span class="font-hanzi text-2xl" lang="zh-CN">{word.simplified}</span>
                  <span class="min-w-0 flex-1">
                    <Pinyin word text={word.pinyin} class="block text-sm" />
                    <span class="block truncate text-sm text-ink-soft">{word.meaning}</span>
                  </span>
                  <Show when={myWordsStore.isCorrection(word.id) ? 'Corregida' : word.level ? `HSK ${word.level}` : topicLabel(word.topicIds)}>
                    {(label) => <span class="max-w-[40%] truncate text-right text-xs text-ink-faint">{label()}</span>}
                  </Show>
                  </button>
                  <button
                    type="button"
                    class="flex h-11 w-11 items-center justify-center rounded-full text-ink-faint hover:text-ink"
                    aria-label={`Quitar ${word.simplified} de tu lista`}
                    onClick={() => myWordsStore.remove(word.id)}
                  >
                    <Icon name="close" size={16} />
                  </button>
                </li>
              )}</For>
            </ul>
          </Show>
        </section>
      </div>
    </div>
  );
};

export default MisPalabras;
