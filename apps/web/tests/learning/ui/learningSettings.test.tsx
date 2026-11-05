import { fireEvent, render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import StudySettings from '../../../src/components/learning/settings/StudySettings';
import { DEFAULT_SESSION_SETTINGS } from '@jiayou/learning/sessions';
import { createMemoryKeyValue, type KeyValueStore } from '../../../src/persistence/keyValue';
import {
  DEFAULT_STUDY_SETTINGS,
  LEARNING_SETTINGS_KEY,
  createLearningSettings,
} from '../../../src/persistence/learningSettings';

const stored = (value: unknown) => createMemoryKeyValue({ [LEARNING_SETTINGS_KEY]: JSON.stringify(value) });

describe('learning settings persistence', () => {
  it('starts from the session defaults when nothing is stored', () => {
    const settings = createLearningSettings(createMemoryKeyValue());
    expect(settings.settings()).toEqual(DEFAULT_STUDY_SETTINGS);
    expect(settings.sessionSettings()).toEqual(DEFAULT_SESSION_SETTINGS);
  });

  it('saves a change and reads it back in a new instance', () => {
    const kv = createMemoryKeyValue();
    const first = createLearningSettings(kv);
    expect(first.update({ newPerDay: 30, workLimit: 45 })).toBe(true);
    const second = createLearningSettings(kv);
    expect(second.settings()).toMatchObject({ newPerDay: 30, workLimit: 45 });
    expect(second.sessionSettings().newPerDay).toEqual({ 'word-meaning': 30, 'character-writing': 8 });
    expect(second.sessionSettings().requeueLimit).toBe(DEFAULT_SESSION_SETTINGS.requeueLimit);
  });

  it.each([
    ['broken JSON', null],
    ['an array', [1, 2]],
    ['another version', { version: 2, newPerDay: 30 }],
  ])('falls back to the defaults for %s', (_label, value) => {
    const kv = value === null ? createMemoryKeyValue({ [LEARNING_SETTINGS_KEY]: '{' }) : stored(value);
    expect(createLearningSettings(kv).settings()).toEqual(DEFAULT_STUDY_SETTINGS);
  });

  it('replaces only the invalid fields with their defaults', () => {
    const kv = stored({ version: 1, newPerDay: 30, todayNewPerDay: -1, newPerSession: 2.5, workLimit: '45', practiceLimit: 10 });
    expect(createLearningSettings(kv).settings()).toEqual({ ...DEFAULT_STUDY_SETTINGS, newPerDay: 30, practiceLimit: 10 });
  });

  it('caps Hoy at the daily budget and practice at the session size', () => {
    const kv = stored({ version: 1, newPerDay: 10, todayNewPerDay: 20, newPerSession: 5, workLimit: 20, practiceLimit: 30 });
    expect(createLearningSettings(kv).settings()).toMatchObject({ newPerDay: 10, todayNewPerDay: 10, workLimit: 20, practiceLimit: 20 });
  });

  it('ignores an out-of-range patch field and keeps its current value', () => {
    const settings = createLearningSettings(createMemoryKeyValue());
    settings.update({ workLimit: 45 });
    settings.update({ workLimit: 9999, newPerDay: 30 });
    expect(settings.settings()).toMatchObject({ workLimit: 45, newPerDay: 30 });
  });

  it('keeps working in memory when storage throws', () => {
    const failing: KeyValueStore = {
      read: () => { throw new Error('blocked'); },
      write: () => { throw new Error('full'); },
      remove: () => { throw new Error('blocked'); },
      keys: () => [],
    };
    const settings = createLearningSettings(failing);
    expect(settings.settings()).toEqual(DEFAULT_STUDY_SETTINGS);
    expect(settings.update({ newPerDay: 40 })).toBe(false);
    expect(settings.settings().newPerDay).toBe(40);
  });
});

describe('study settings UI', () => {
  it('writes a picked value and hides Hoy presets above the daily budget', () => {
    const kv = createMemoryKeyValue();
    const store = createLearningSettings(kv);
    render(() => <StudySettings store={store} dev={false} />);

    const daily = screen.getByRole('radiogroup', { name: 'Palabras nuevas al día' });
    fireEvent.click(daily.querySelector('[role="radio"]:first-child')!);
    expect(store.settings().newPerDay).toBe(10);
    expect(JSON.parse(kv.read(LEARNING_SETTINGS_KEY)!)).toMatchObject({ version: 1, newPerDay: 10, todayNewPerDay: 10 });

    const today = screen.getByRole('radiogroup', { name: 'Nuevas en Hoy' });
    expect([...today.querySelectorAll('[role="radio"]')].map((radio) => radio.textContent)).toEqual(['5', '10']);
    expect(screen.getByText(/El resto queda para Más palabras y Temas/)).toBeTruthy();
  });

  it('shows a stored value that is not a preset as selected', () => {
    const store = createLearningSettings(stored({ version: 1, workLimit: 25 }));
    render(() => <StudySettings store={store} dev={false} />);
    const picker = screen.getByRole('radiogroup', { name: 'Tarjetas por sesión' });
    expect(picker.querySelector('[aria-checked="true"]')).toHaveTextContent('25');
  });

  it('hides the progress reset outside development', () => {
    render(() => <StudySettings store={createLearningSettings(createMemoryKeyValue())} dev={false} onReset={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Reiniciar progreso de aprendizaje' })).toBeNull();
  });

  it('resets progress in development only after confirmation', async () => {
    const onReset = vi.fn().mockResolvedValue(undefined);
    render(() => <StudySettings store={createLearningSettings(createMemoryKeyValue())} dev onReset={onReset} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar progreso de aprendizaje' }));
    expect(onReset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar progreso de aprendizaje' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, reiniciar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Progreso de aprendizaje reiniciado.');
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
