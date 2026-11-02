import { Component, createEffect, createSignal, Match, on, onMount, Show, Switch } from 'solid-js';
import Acerca from './pages/Acerca';
import Opciones from './pages/Opciones';
import Home from './pages/Home';
import Listas from './pages/Listas';
import MisPalabras from './pages/MisPalabras';
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
import { characterStore } from './stores/characterStore';
import { BUNDLED_LEVEL, catalogLevels } from './data/catalog';
import { hasUsedApp, loadInstalledPacks, readInstalledLevels, saveStudyMedia, writeInstalledLevels } from './utils/levelPacks';

const installedChoice = () => readInstalledLevels();

const initialGate = (): 'choose' | 'load' | 'app' => {
  const saved = installedChoice();
  if (saved === null) return hasUsedApp() ? 'load' : 'choose';
  const ready = saved.every((level) => level === BUNDLED_LEVEL || characterStore.hasLevel(level));
  return ready ? 'app' : 'load';
};

const App: Component = () => {
  const [browse, setBrowse] = createSignal<VocabularyBrowseState>({ query: '', topic: '', scroll: 0, choosingTopic: false });
  const [screen, setScreen] = createSignal<Screen>(homeScreen);
  const { goHome } = createScreenHistory(screen, setScreen);
  const [gate, setGate] = createSignal(initialGate());
  const [canCancelLists, setCanCancelLists] = createSignal(false);
  const openStrokes = (char: string) =>
    setScreen((current) => ({ page: 'trazos', focus: { kind: 'character', char }, from: current }));

  let openedFromHome = false;
  let openedFromMyWords = false;
  const navigate = (target: HomeTarget) => {
    if (target.page === 'vocabulario') {
      openedFromHome = target.wordId !== undefined;
      setBrowse({ query: '', topic: '', scroll: 0, choosingTopic: target.topic === true });
    }
    if (target.page === 'trazos') {
      setScreen({ page: 'trazos', focus: target.focus, from: homeScreen });
      return;
    }
    setScreen(target);
  };

  const openLists = () => {
    setCanCancelLists(true);
    setGate('choose');
  };

  // Once the app is open, fetch whatever the studied words still lack (lists added by an update, a failed file).
  createEffect(on(gate, (current) => { if (current === 'app') void saveStudyMedia(); }));

  onMount(() => {
    if (gate() !== 'load') return;
    const saved = installedChoice();
    const levels = saved ?? catalogLevels.filter((row) => row.available).map((row) => row.level);
    void loadInstalledPacks(levels)
      .then(() => {
        if (saved === null) writeInstalledLevels(levels);
        setGate('app');
      })
      .catch(() => {
        setCanCancelLists(false);
        setGate('choose');
      });
  });

  return (
    <div class="app w-full">
      <Show
        when={gate() === 'app'}
        fallback={
          <Show
            when={gate() === 'choose'}
            fallback={
              <div class="screen">
                <p class="m-auto text-sm text-ink-soft">Preparando las listas…</p>
              </div>
            }
          >
            <Listas
              onDone={() => setGate('app')}
              onCancel={canCancelLists() ? () => setGate('app') : undefined}
            />
          </Show>
        }
      >
      <Switch>
        <Match when={screen().page === 'home'}>
          <Home onNavigate={navigate} />
        </Match>
        <Match when={screen().page === 'vocabulario'}>
          <Vocabulario onBack={goHome} onStrokes={openStrokes} browse={browse()} onBrowse={setBrowse} wordId={(() => { const s = screen(); return s.page === 'vocabulario' ? s.wordId : undefined; })()} onSelect={(wordId) => {
            // A word opened straight from Home (palabra del día) closes back to Home, not to the list.
            if (!wordId && openedFromMyWords) { openedFromMyWords = false; setScreen({ page: 'mis-palabras' }); return; }
            if (!wordId && openedFromHome) { openedFromHome = false; setScreen(homeScreen); return; }
            openedFromHome = false;
            setScreen({ page: 'vocabulario', wordId });
          }} onPractice={(practiceId) => setScreen({ page: 'vocabulary-review', resume: false, practiceId })} />
        </Match>
        <Match when={screen().page === 'vocabulary-review'}>
          {/* Keyed so "Aprender 10 palabras" from an ended session starts a fresh one. */}
          <Show when={(() => { const s = screen(); return s.page === 'vocabulary-review' ? s.practiceId ?? 'today' : undefined; })()} keyed>
          {(_key: string) => <VocabularyReview onPractice={(practiceId) => setScreen({ page: 'vocabulary-review', resume: false, practiceId })} practiceId={(() => { const s = screen(); return s.page === 'vocabulary-review' ? s.practiceId : undefined; })()} resume={(() => { const s = screen(); return s.page === 'vocabulary-review' && s.resume; })()} onBack={() => {
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
        <Match when={screen().page === 'acerca'}>
          <Acerca onBack={goHome} />
        </Match>
        <Match when={screen().page === 'opciones'}>
          <Opciones onBack={goHome} onManageLists={openLists} />
        </Match>
        <Match when={screen().page === 'mis-palabras'}>
          <MisPalabras onBack={goHome} onOpenWord={(wordId) => { openedFromMyWords = true; setScreen({ page: 'vocabulario', wordId }); }} />
        </Match>
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
      </Switch>
      </Show>
    </div>
  );
};

export default App;
