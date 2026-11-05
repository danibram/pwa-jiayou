import { createSignal } from 'solid-js';
import { KEYS } from '../persistence/keys';
import { storage } from '../persistence/keyValue';

/** Preference: follow the OS, or lock light / dark. */
export type ThemePreference = 'system' | 'dark' | 'light';

const ORDER: ThemePreference[] = ['system', 'dark', 'light'];

const THEME_COLOR = { light: '#f4efe6', dark: '#14110f' } as const;

const isPreference = (value: unknown): value is ThemePreference =>
  value === 'system' || value === 'dark' || value === 'light';

const readPreference = (): ThemePreference => {
  try {
    const stored = storage.read(KEYS.theme);
    if (isPreference(stored)) return stored;
  } catch {
    // Private mode can block storage.
  }
  return 'system';
};

const systemDark = (): boolean => {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
};

/** Whether the UI should paint dark tokens for the given preference. */
export const resolvesDark = (preference: ThemePreference): boolean =>
  preference === 'dark' || (preference === 'system' && systemDark());

const syncDocument = (preference: ThemePreference): void => {
  const dark = resolvesDark(preference);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', dark ? THEME_COLOR.dark : THEME_COLOR.light);
  }
};

const [preference, setPreferenceSignal] = createSignal<ThemePreference>(readPreference());

/** Current theme preference (system / dark / light). */
export const themePreference = preference;

/** Whether dark tokens are active right now. */
export const isDark = (): boolean => resolvesDark(preference());

export const setThemePreference = (next: ThemePreference): void => {
  setPreferenceSignal(next);
  syncDocument(next);
  try {
    storage.write(KEYS.theme, next);
  } catch {
    // The choice still holds for this visit.
  }
  window.dispatchEvent(new Event('jiayou-theme'));
};

/** system → dark → light → system. */
export const cycleTheme = (): ThemePreference => {
  const next = ORDER[(ORDER.indexOf(preference()) + 1) % ORDER.length];
  setThemePreference(next);
  return next;
};

const THEME_LABEL: Record<ThemePreference, string> = {
  system: 'Tema del sistema',
  dark: 'Tema oscuro',
  light: 'Tema claro',
};

export const themeLabel = (value: ThemePreference = preference()): string => THEME_LABEL[value];

/** Apply stored preference and keep "system" in sync with the OS. Call once at boot. */
export const initTheme = (): void => {
  syncDocument(preference());
  try {
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystem = () => {
      if (preference() === 'system') {
        syncDocument('system');
        window.dispatchEvent(new Event('jiayou-theme'));
      }
    };
    scheme.addEventListener('change', onSystem);
  } catch {
    // jsdom and older WebViews may lack matchMedia.
  }
};

/** Subscribe to resolved theme changes (preference or OS). Returns unsubscribe. */
export const onThemeChange = (listener: () => void): (() => void) => {
  const handler = () => listener();
  window.addEventListener('jiayou-theme', handler);
  try {
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    scheme.addEventListener('change', handler);
    return () => {
      window.removeEventListener('jiayou-theme', handler);
      scheme.removeEventListener('change', handler);
    };
  } catch {
    return () => window.removeEventListener('jiayou-theme', handler);
  }
};
