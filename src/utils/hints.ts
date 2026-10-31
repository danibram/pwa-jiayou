const PREFIX = 'hsk-hint-';

/**
 * Counts one more session for a hint and says whether it should still show.
 * Gesture hints help on the first visits and turn into noise after that.
 */
export const takeHint = (key: string, sessions = 3): boolean => {
  try {
    const seen = Number(localStorage.getItem(PREFIX + key) ?? 0);
    localStorage.setItem(PREFIX + key, String(seen + 1));
    return seen < sessions;
  } catch {
    return false;
  }
};
