import { Component, createEffect, createSignal, Match, onCleanup, onMount, Show, Switch, type JSX } from 'solid-js';
import { captureScreen } from './analytics';
import Acerca from './pages/Acerca';
import Opciones from './pages/Opciones';
import Home from './pages/Home';
import Listas from './pages/Listas';
import Trazos from './pages/Trazos';
import Vocabulario, { type VocabularyBrowseState } from './pages/Vocabulario';
import VocabularyReview from './pages/VocabularyReview';
import {
  homeScreen,
  trazosScreen,
  type HomeTarget,
  type Screen,
} from './screen';
import { createScreenHistory } from './createScreenHistory';
import { BUNDLED_LEVEL } from './data/catalog';
import { hasUsedApp, loadInstalledPacks, readInstalledLevels, saveStudyMedia, writeInstalledLevels } from './utils/levelPacks';
import RiceGrid from './components/RiceGrid';
import { useLearningStore } from './components/LearningStoreContext';

/**
 * Word screens read the learning log from IndexedDB. Until it is open they show a quiet loading
 * state, and if it cannot open, a way to try again. Character screens work meanwhile.
 */
const LearningGate: Component<{ children: JSX.Element }> = (props) => {
  const store = useLearningStore();
  const [retrying, setRetrying] = createSignal(false);
  const start = () => store.init().catch(() => {});
  onMount(() => void start());
  const retry = () => {
    setRetrying(true);
    void start().finally(() => setRetrying(false));
  };
  return (
    <Show when={store.ready()} fallback={
      <div class="screen">
        <Show when={store.error() && !retrying()} fallback={
          <div class="m-auto text-center" role="status">
            <RiceGrid class="mx-auto h-16 w-16 text-ink-faint" />
            <p class="mt-3 text-sm text-ink-soft">Abriendo tu progreso…</p>
          </div>
        }>
          <div class="m-auto max-w-[18rem] text-center" role="alert">
            <p class="font-display text-xl font-semibold">No se puede abrir tu progreso</p>
            <p class="mt-2 text-sm text-ink-soft">Este navegador no deja usar el almacenamiento de la app. Si estás en una ventana privada, prueba en una normal.</p>
            <button type="button" class="btn-ink mt-6 h-12 w-full px-8" onClick={retry}>Reintentar</button>
          </div>
        </Show>
      </div>
    }>
      {props.children}
    </Show>
  );
};

const installedChoice = () => readInstalledLevels();

const initialGate = (): 'choose' | 'app' => {
  const saved = installedChoice();
  return saved === null && !hasUsedApp() ? 'choose' : 'app';
};

const App: Component = () => {
  const [browse, setBrowse] = createSignal<VocabularyBrowseState>({ query: '', topic: '', scroll: 0, choosingTopic: false });
  const [screen, setScreen] = createSignal<Screen>(homeScreen);
  const { goHome } = createScreenHistory(screen, setScreen);
  const [gate, setGate] = createSignal(initialGate());
  const [canCancelLists, setCanCancelLists] = createSignal(false);
  createEffect(() => captureScreen(gate() === 'choose' ? 'listas' : screen().page));
  const openStrokes = (char: string) =>
    setScreen((current) => ({ page: 'trazos', focus: { kind: 'character', char }, from: current }));

  const navigate = (target: HomeTarget) => {
    if (target.page === 'vocabulario') {
      setBrowse({ query: '', topic: '', scroll: 0, choosingTopic: target.topic === true });
    }
    if (target.page === 'trazos') {
      setScreen({ page: 'trazos', focus: target.focus, from: homeScreen });
      return;
    }
    setScreen(target.page === 'vocabulario' && target.wordId ? { ...target, returnTo: 'home' } : target);
  };

  const openLists = () => {
    setCanCancelLists(true);
    setGate('choose');
  };

  onMount(() => {
    const retry = () => { if (gate() === 'app') void saveStudyMedia(); };
    window.addEventListener('online', retry);
    onCleanup(() => window.removeEventListener('online', retry));
    if (gate() !== 'app') return;
    const saved = installedChoice();
    // Without a saved choice only HSK 1 is here; saveStudyMedia then fetches the packs the lists need.
    const levels = saved ?? [BUNDLED_LEVEL];
    void loadInstalledPacks(levels)
      .then(() => {
        if (saved === null) writeInstalledLevels(levels);
      })
      .catch(() => {})
      .finally(retry);
  });

  return (
    <div class="app w-full">
      <Show
        when={gate() === 'app'}
        fallback={
            <Listas
              onDone={() => setGate('app')}
              onCancel={canCancelLists() ? () => setGate('app') : undefined}
            />
        }
      >
      <Switch>
        <Match when={trazosScreen(screen())} keyed>
          {(s) => (
            <Trazos
              focus={s.focus}
              // A word session returns to its card; anything else goes back where it came from.
              onBack={() => {
                const from = s.from;
                setScreen(from.page === 'vocabulary-review' ? { ...from, resume: true } : from);
              }}
              backLabel="Volver"
            />
          )}
        </Match>
        <Match when={screen().page === 'acerca'}>
          <Acerca onBack={goHome} />
        </Match>
        {/* Outside the gate: the development reset closes the store and must not unmount the page. */}
        <Match when={screen().page === 'opciones'}>
          <Opciones onBack={goHome} onManageLists={openLists} />
        </Match>
        <Match when={true}>
        <LearningGate>
        <Switch>
        <Match when={screen().page === 'home'}>
          <Home onNavigate={navigate} />
        </Match>
        <Match when={screen().page === 'vocabulario'}>
          <Vocabulario onBack={goHome} onStrokes={openStrokes} browse={browse()} onBrowse={setBrowse} wordId={(() => { const s = screen(); return s.page === 'vocabulario' ? s.wordId : undefined; })()} onSelect={(wordId) => {
            const current = screen();
            if (!wordId && current.page === 'vocabulario' && current.returnTo) {
              setScreen(homeScreen);
              return;
            }
            setScreen({ page: 'vocabulario', wordId });
          }} onPractice={(practiceId) => setScreen({ page: 'vocabulary-review', resume: false, practiceId })} />
        </Match>
        <Match when={screen().page === 'vocabulary-review'}>
          {/* Keyed so "Aprender 10 palabras" from an ended session starts a fresh one. */}
          <Show when={(() => { const s = screen(); return s.page === 'vocabulary-review' ? s.practiceId ?? 'today' : undefined; })()} keyed>
          {(_key: string) => <VocabularyReview onPractice={(practiceId) => setScreen({ page: 'vocabulary-review', resume: false, ...(practiceId ? { practiceId } : {}) })} practiceId={(() => { const s = screen(); return s.page === 'vocabulary-review' ? s.practiceId : undefined; })()} resume={(() => { const s = screen(); return s.page === 'vocabulary-review' && s.resume; })()} onBack={() => {
            const s = screen();
            const practiceId = s.page === 'vocabulary-review' ? s.practiceId : undefined;
            // `__all__`, `__more__` and `__weak__` are Home's sessions, not a word.
            if (!practiceId || practiceId.startsWith('__')) {
              setBrowse({ query: '', topic: '', scroll: 0, choosingTopic: false });
              setScreen(homeScreen);
            }
            // A topic session returns to the topic's word list, which `browse` still holds.
            else if (practiceId.startsWith('topic:')) setScreen({ page: 'vocabulario' });
            else setScreen({ page: 'vocabulario', wordId: practiceId });
          }} onStrokes={openStrokes} />}
          </Show>
        </Match>
        </Switch>
        </LearningGate>
        </Match>
      </Switch>
      </Show>
    </div>
  );
};

export default App;
