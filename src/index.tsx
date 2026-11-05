/* @refresh reload */
import { render } from 'solid-js/web';
import './index.css';
import App from './App';
import UpdateNotice from './components/UpdateNotice';
import { initTheme } from './utils/theme';
import { initAnalytics } from './analytics';
import { loadSelectedWords } from './utils/levelPacks';
import { learningStore } from './stores/learningStore';
import { removeObsoleteKeys } from './persistence/obsoleteKeys';
import { storage } from './persistence/keyValue';

initAnalytics();
initTheme();
removeObsoleteKeys(storage);

document.documentElement.addEventListener('pointerdown', () => {
  document.documentElement.dataset.pointer = '';
});
document.documentElement.addEventListener('keydown', (event) => {
  if (event.key === 'Tab') delete document.documentElement.dataset.pointer;
});

// The learning log opens in the background. No top-level await: the FSRS-7 model loads with a
// dynamic import that imports this entry chunk back, so awaiting here would never settle. Word
// screens wait for `learningStore.ready()` and show a retry if IndexedDB fails.
void learningStore.init().catch(() => {});

const root = document.getElementById('root');

if (!(root instanceof HTMLElement)) {
  throw new Error(
    'Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?'
  );
}

// The words of the lists being studied come from their packs (the cache once saved), so the first
// screen, a shared word link or a resumed session already finds them. A slow network does not hold
// the first screen back: after a moment the app opens and the words fill in as they arrive.
const FIRST_PAINT_WAIT_MS = 1500;
void Promise.race([loadSelectedWords(), new Promise((resolve) => setTimeout(resolve, FIRST_PAINT_WAIT_MS))])
  .catch(() => {})
  .finally(() => render(() => <><App /><UpdateNotice /></>, root));
