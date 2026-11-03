import { Component, createEffect, createSignal, Match, onCleanup, onMount, Show, Switch } from 'solid-js';
import { captureScreen } from './analytics';
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
import { catalogLevels } from './data/catalog';
import { hasUsedApp, loadInstalledPacks, readInstalledLevels, saveStudyMedia, writeInstalledLevels } from './utils/levelPacks';

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
    const levels = saved ?? catalogLevels.filter((row) => row.available).map((row) => row.level);
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
        <Match when={screen().page === 'home'}>
          <Home onNavigate={navigate} />
        </Match>
        <Match when={screen().page === 'vocabulario'}>
          <Vocabulario onBack={goHome} onStrokes={openStrokes} browse={browse()} onBrowse={setBrowse} wordId={(() => { const s = screen(); return s.page === 'vocabulario' ? s.wordId : undefined; })()} onSelect={(wordId) => {
            const current = screen();
            if (!wordId && current.page === 'vocabulario' && current.returnTo) {
              setScreen(current.returnTo === 'home' ? homeScreen : { page: 'mis-palabras' });
              return;
            }
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
          <MisPalabras onBack={goHome} onOpenWord={(wordId) => setScreen({ page: 'vocabulario', wordId, returnTo: 'mis-palabras' })} />
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
