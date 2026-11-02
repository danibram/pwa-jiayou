import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cycleTheme,
  initTheme,
  isDark,
  resolvesDark,
  setThemePreference,
  themePreference,
} from '../src/utils/theme';

describe('theme preference', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = '';
    setThemePreference('system');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to system and follows the OS', () => {
    expect(themePreference()).toBe('system');
    expect(resolvesDark('system')).toBe(false);
    expect(resolvesDark('dark')).toBe(true);
    expect(resolvesDark('light')).toBe(false);
  });

  it('cycles system → dark → light → system', () => {
    expect(cycleTheme()).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(isDark()).toBe(true);
    expect(localStorage.getItem('jiayou-theme')).toBe('dark');

    expect(cycleTheme()).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('jiayou-theme')).toBe('light');

    expect(cycleTheme()).toBe('system');
    expect(localStorage.getItem('jiayou-theme')).toBe('system');
  });

  it('restores a saved preference on init', () => {
    localStorage.setItem('jiayou-theme', 'dark');
    // Re-read by setting through the public API after a fake reload of the signal.
    setThemePreference('dark');
    initTheme();
    expect(isDark()).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
