import { createEffect, onCleanup, onMount, type Accessor, type Setter } from 'solid-js';
import { screenToUrl, urlToScreen } from './navigation';
import { homeScreen, parseScreen, type Screen } from './screen';

/**
 * A review in the URL or in history continues its stored session when the learning store still has
 * one for that mode and scope; otherwise the page plans a new one. Either way nothing is lost.
 */
const reviewOrFallback = (screen: Screen): Screen =>
  screen.page === 'vocabulary-review' ? { ...screen, resume: true } : screen;

/**
 * A reload keeps history.state and the URL, so the saved screen wins when both agree: it still knows
 * `from` and `returnTo`. A typed or shared URL arrives without state and is read from the path alone.
 */
const startScreen = (): Screen => {
  const fromUrl = urlToScreen(location.href);
  const saved = history.state?.jiayou ? parseScreen(history.state.screen) : undefined;
  const screen = saved && fromUrl && screenToUrl(saved) === screenToUrl(fromUrl) ? saved : fromUrl ?? homeScreen;
  return reviewOrFallback(screen);
};

/** Keeps the browser history and URL in step with the screen. Call it from the app setup. */
export function createScreenHistory(screen: Accessor<Screen>, setScreen: Setter<Screen>) {
  let restoringHistory = false;
  let historyReady = false;
  setScreen(startScreen());
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
    history.replaceState({ jiayou: true, screen: screen() }, '', screenToUrl(screen()));
    historyReady = true;
    const onPopState = (event: PopStateEvent) => {
      const savedScreen = event.state?.jiayou ? parseScreen(event.state.screen) : urlToScreen(location.href);
      if (!savedScreen) {
        showFromHistory(homeScreen);
        return;
      }
      const next = reviewOrFallback(savedScreen);
      if (next.page !== savedScreen.page) history.replaceState({ jiayou: true, screen: next }, '', screenToUrl(next));
      showFromHistory(next);
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
    history.pushState({ jiayou: true, screen: value }, '', screenToUrl(value));
  });

  const goHome = () => setScreen(homeScreen);
  return { goHome };
}
