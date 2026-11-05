import { createContext, useContext } from 'solid-js';
import { learningStore, type LearningStore } from '../stores/learningStore';

/**
 * The learning store the screens read. The app uses the default instance; tests provide one over a
 * fake IndexedDB with their own clock and word pool.
 */
export const LearningStoreContext = createContext<LearningStore>(learningStore);

export const useLearningStore = (): LearningStore => useContext(LearningStoreContext);
