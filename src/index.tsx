/* @refresh reload */
import posthog from 'posthog-js';
import { render } from 'solid-js/web';
import App from './App';
import './index.css';

posthog.init('phc_GqGrQPR6MqG8o4cq8Pw5QnJQrdno4xOZyS66O7duKM8',
  {
    api_host: 'https://eu.i.posthog.com',
    person_profiles: 'identified_only' // or 'always' to create profiles for anonymous users as well
  }
)

const root = document.getElementById('root');

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    'Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?',
  );
}

render(() => <App />, root!);

// Registrar el Service Worker para PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.log('Service Worker registration failed:', error);
    });
  });
}

