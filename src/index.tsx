/* @refresh reload */
import { render } from 'solid-js/web';
import './index.css';
import App from './App';
import UpdateNotice from './components/UpdateNotice';
import { ProgressStorageNotice } from './components/ProgressBackup';

document.documentElement.addEventListener('pointerdown', () => {
  document.documentElement.dataset.pointer = '';
});
document.documentElement.addEventListener('keydown', (event) => {
  if (event.key === 'Tab') delete document.documentElement.dataset.pointer;
});

const root = document.getElementById('root');

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    'Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?'
  );
}

render(() => <><App /><UpdateNotice /><ProgressStorageNotice /></>, root!);
