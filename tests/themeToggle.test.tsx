import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ThemeToggle from '../src/components/ThemeToggle';
import { setThemePreference, themePreference } from '../src/utils/theme';

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    setThemePreference('system');
  });

  afterEach(() => {
    cleanup();
  });

  it('advances the theme on each press', () => {
    render(() => <ThemeToggle />);
    const button = screen.getByRole('button', { name: /Cambiar tema/i });

    fireEvent.click(button);
    expect(themePreference()).toBe('dark');

    fireEvent.click(button);
    expect(themePreference()).toBe('light');

    fireEvent.click(button);
    expect(themePreference()).toBe('system');
  });
});
