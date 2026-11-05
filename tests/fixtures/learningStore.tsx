import { IDBFactory } from 'fake-indexeddb';
import { render } from '@solidjs/testing-library';
import type { JSX } from 'solid-js';
import { LearningStoreContext } from '../../src/components/LearningStoreContext';
import { createLearningStore, type LearningStore, type LearningStoreOptions } from '../../src/stores/learningStore';

/**
 * A learning store over its own fake IndexedDB, with the app's default pool (the checked lists) and
 * day rule. Each test gets an empty log; no cross-tab channel, no locks, no speech.
 */
export const testLearningStore = (options: LearningStoreOptions = {}): LearningStore =>
  createLearningStore({
    indexedDB: new IDBFactory(),
    channel: null,
    locks: null,
    deviceId: () => 'test-device',
    speechAvailable: () => false,
    ...options,
  });

/** Renders over a fresh store, as the app renders over its own. */
export const renderWithStore = (ui: () => JSX.Element, store: LearningStore = testLearningStore()) => {
  const view = render(() => <LearningStoreContext.Provider value={store}>{ui()}</LearningStoreContext.Provider>);
  return { ...view, store };
};
