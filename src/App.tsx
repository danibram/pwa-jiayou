import { Component, createSignal, Match, Switch } from 'solid-js';
import { charactersInTopic } from './data/topics';
import Acerca from './pages/Acerca';
import Entrenamiento from './pages/Entrenamiento';
import Home from './pages/Home';
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

const App: Component = () => {
  const [screen, setScreen] = createSignal<Screen>(homeScreen);
  const { goHome, leaveFinishedSession } = createScreenHistory(screen, setScreen);
  const openStrokes = (char: string) =>
    setScreen((current) => ({ page: 'trazos', focus: { kind: 'character', char }, from: current }));

  const navigate = (target: HomeTarget) => {
    if (target.page === 'trazos') {
      setScreen({ page: 'trazos', focus: target.focus, from: homeScreen });
      return;
    }
    setScreen(target);
  };

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
    </div>
  );
};

export default App;
