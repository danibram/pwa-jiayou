import { Component, createSignal, Match, Switch } from 'solid-js';
import { charactersInTopic } from './data/topics';
import Acerca from './pages/Acerca';
import Entrenamiento, { ReviewPool } from './pages/Entrenamiento';
import Home, { HomeTarget } from './pages/Home';
import Tarjetas from './pages/Tarjetas';
import Tema from './pages/Tema';
import Temas from './pages/Temas';
import Trazos from './pages/Trazos';
import { characterStore } from './stores/characterStore';

type Screen =
  | { page: 'home' }
  | { page: 'acerca' }
  | { page: 'temas' }
  | { page: 'tema'; topicId: string; index: number }
  | { page: 'tarjetas' }
  | { page: 'entrenamiento'; pool: ReviewPool; resume?: boolean }
  | { page: 'trazos'; char?: string; topicId?: string; from: Screen };

const asPage = <P extends Screen['page']>(screen: Screen, page: P) =>
  screen.page === page ? (screen as Extract<Screen, { page: P }>) : undefined;

const App: Component = () => {
  const [screen, setScreen] = createSignal<Screen>({ page: 'home' });

  const goHome = () => setScreen({ page: 'home' });
  const openStrokes = (char: string) => setScreen((s) => ({ page: 'trazos', char, from: s }));

  const navigate = (target: HomeTarget) =>
    setScreen(target.page === 'trazos' ? { ...target, from: { page: 'home' } } : target);

  return (
    <div class="app w-full">
      <Switch>
        <Match when={screen().page === 'home'}>
          <Home onNavigate={navigate} />
        </Match>
        <Match when={screen().page === 'acerca'}>
          <Acerca onBack={goHome} />
        </Match>
        <Match when={screen().page === 'temas'}>
          <Temas
            onBack={goHome}
            onReview={(topicId) => setScreen({ page: 'tema', topicId, index: 0 })}
          />
        </Match>
        <Match when={asPage(screen(), 'tema')} keyed>
          {(s) => (
            <Tema
              topicId={s.topicId}
              initialIndex={s.index}
              onBack={() => setScreen({ page: 'temas' })}
              onOpenStrokes={(char, index) =>
                setScreen({
                  page: 'trazos',
                  char,
                  topicId: s.topicId,
                  from: { page: 'tema', topicId: s.topicId, index },
                })
              }
            />
          )}
        </Match>
        <Match when={screen().page === 'tarjetas'}>
          <Tarjetas onGoHome={goHome} onOpenStrokes={openStrokes} />
        </Match>
        <Match when={asPage(screen(), 'entrenamiento')} keyed>
          {(s) => (
            <Entrenamiento
              pool={s.pool}
              resume={s.resume}
              onGoHome={goHome}
              backLabel="Volver"
              onOpenStrokes={openStrokes}
            />
          )}
        </Match>
        <Match when={asPage(screen(), 'trazos')} keyed>
          {(s) => (
            <Trazos
              initialChar={s.char}
              topicId={s.topicId}
              // A review session can't be resumed, so leaving strokes from its summary
              // returns home. A topic returns to the character you were writing.
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
    </div>
  );
};

export default App;
