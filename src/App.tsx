import { Component, createSignal, Match, onMount, Show, Switch } from 'solid-js';
import { charactersInTopic } from './data/topics';
import Acerca from './pages/Acerca';
import Entrenamiento from './pages/Entrenamiento';
import Home from './pages/Home';
import Listas from './pages/Listas';
import Tarjetas from './pages/Tarjetas';
import Tema from './pages/Tema';
import Temas from './pages/Temas';
import Trazos from './pages/Trazos';
import {
  entrenamientoScreen,
  homeScreen,
  temaScreen,
  trazosScreen,
  type HomeTarget,
  type Screen,
} from './screen';
import { createScreenHistory } from './createScreenHistory';
import { characterStore } from './stores/characterStore';
import { BUNDLED_LEVEL, catalogLevels } from './data/catalog';
import { hasUsedApp, loadInstalledPacks, readInstalledLevels, writeInstalledLevels } from './utils/levelPacks';

const installedChoice = () => readInstalledLevels();

const initialGate = (): 'choose' | 'load' | 'app' => {
  const saved = installedChoice();
  if (saved === null) return hasUsedApp() ? 'load' : 'choose';
  const ready = saved.every((level) => level === BUNDLED_LEVEL || characterStore.hasLevel(level));
  return ready ? 'app' : 'load';
};

const App: Component = () => {
  const [screen, setScreen] = createSignal<Screen>(homeScreen);
  const { goHome, leaveFinishedSession } = createScreenHistory(screen, setScreen);
  const [gate, setGate] = createSignal(initialGate());
  const [canCancelLists, setCanCancelLists] = createSignal(false);
  const openStrokes = (char: string) =>
    setScreen((current) => ({ page: 'trazos', focus: { kind: 'character', char }, from: current }));

  const navigate = (target: HomeTarget) => {
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
        <Match when={screen().page === 'acerca'}>
          <Acerca onBack={goHome} onManageLists={openLists} />
        </Match>
        <Match when={screen().page === 'temas'}>
          <Temas
            onBack={goHome}
            onReview={(topicId) => setScreen({ page: 'tema', topicId, index: 0 })}
          />
        </Match>
        <Match when={temaScreen(screen())} keyed>
          {(s) => (
            <Tema
              topicId={s.topicId}
              initialIndex={s.index}
              onBack={() => setScreen({ page: 'temas' })}
              onOpenStrokes={(char, index) =>
                setScreen({
                  page: 'trazos',
                  focus: { kind: 'topic', char, topicId: s.topicId },
                  from: { page: 'tema', topicId: s.topicId, index },
                })
              }
            />
          )}
        </Match>
        <Match when={screen().page === 'tarjetas'}>
          <Tarjetas onGoHome={goHome} onOpenStrokes={openStrokes} />
        </Match>
        <Match when={entrenamientoScreen(screen())} keyed>
          {(s) => (
            <Entrenamiento
              pool={s.pool}
              resume={s.resume}
              onGoHome={goHome}
              onLeaveFinished={leaveFinishedSession}
              backLabel="Volver"
              onOpenStrokes={openStrokes}
            />
          )}
        </Match>
        <Match when={trazosScreen(screen())} keyed>
          {(s) => (
            <Trazos
              focus={s.focus}
              // A topic returns to the character you were writing. A review returns home.
              onBack={(char) => {
                const from = s.from;
                if (from.page === 'tema') {
                  const list = charactersInTopic(from.topicId, characterStore.state.characters);
                  const found = char ? list.findIndex((item) => item.character === char) : -1;
                  setScreen({
                    page: 'tema',
                    topicId: from.topicId,
                    index: found >= 0 ? found : from.index,
                  });
                  return;
                }
                setScreen(from.page === 'entrenamiento' ? { page: 'home' } : from);
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
