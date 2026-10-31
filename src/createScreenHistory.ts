import { createEffect, onCleanup, onMount, type Accessor, type Setter } from 'solid-js';
import { characterStore } from './stores/characterStore';
import { loadSession } from './utils/sessionStore';
import { homeScreen, parseScreen, type Screen } from './screen';

/** Keeps the browser history in step with the screen. Call it from the app setup. */
export function createScreenHistory(screen: Accessor<Screen>, setScreen: Setter<Screen>) {
  let restoringHistory = false;
  let historyReady = false;
  let lastScreen = screen();

  const showFromHistory = (next: Screen) => {
    if (next === screen()) {
      lastScreen = screen();
      return;
    }
    restoringHistory = true;
    lastScreen = next;
    setScreen(next);
  };

  onMount(() => {
    history.replaceState({ jiayou: true, screen: screen() }, '');
    historyReady = true;
    const onPopState = (event: PopStateEvent) => {
      const savedScreen = event.state?.jiayou ? parseScreen(event.state.screen) : undefined;
      if (savedScreen?.page === 'entrenamiento') {
        const session = loadSession(characterStore.state.characters);
        if (session?.pool === savedScreen.pool) {
          showFromHistory({ ...savedScreen, resume: true });
          return;
        }
        history.replaceState({ jiayou: true, screen: homeScreen }, '');
        if (screen().page === 'home') {
          history.back();
          return;
        }
        showFromHistory(homeScreen);
        return;
      }
      showFromHistory(savedScreen ?? homeScreen);
    };
    window.addEventListener('popstate', onPopState);
    onCleanup(() => window.removeEventListener('popstate', onPopState));
  });

  createEffect(() => {
    const value = screen();
    if (!historyReady) return;
    if (restoringHistory) { restoringHistory = false; lastScreen = value; return; }
    if (value === lastScreen) return;
    lastScreen = value;
    history.pushState({ jiayou: true, screen: value }, '');
  });

  const goHome = () => setScreen(homeScreen);
  const leaveFinishedSession = () => {
    history.replaceState({ jiayou: true, screen: homeScreen }, '');
    restoringHistory = true;
    lastScreen = homeScreen;
    setScreen(homeScreen);
    history.back();
  };

  return { goHome, leaveFinishedSession };
}
