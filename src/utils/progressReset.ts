import { createSignal } from 'solid-js';

const [generation, setGeneration] = createSignal(0);

/** Changes when stored progress replaces the in-memory log. */
export const progressReset = generation;

export const notifyProgressReset = () => {
  setGeneration((current) => current + 1);
};
