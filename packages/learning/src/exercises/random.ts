/** Fisher-Yates over an injected generator, so equal seeds give equal orders. */
export const shuffleWith = <T>(items: readonly T[], random: () => number): T[] => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

/** Eight hex digits drawn from the generator, for ids. */
export const token = (random: () => number): string =>
  Math.floor(random() * 4_294_967_296).toString(16).padStart(8, '0');

/** mulberry32: a small seeded generator for callers and tests that need one. */
export const seededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};
