import { createEffect, onCleanup, onMount, type Accessor, type Setter } from 'solid-js';
import { allWords, findWord } from './stores/myWordsStore';
import { loadVocabularySession } from './utils/vocabularySession';
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
      if (savedScreen?.page === 'vocabulary-review') {
        const session = loadVocabularySession(allWords(), savedScreen.practiceId);
        if (session) {
          showFromHistory({ ...savedScreen, resume: true });
          return;
        }
        const fallback: Screen = savedScreen.practiceId && findWord(savedScreen.practiceId)
          ? { page: 'vocabulario', wordId: savedScreen.practiceId }
          : homeScreen;
        history.replaceState({ jiayou: true, screen: fallback }, '');
        showFromHistory(fallback);
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
  return { goHome };
}
