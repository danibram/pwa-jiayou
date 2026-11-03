import { KEYS } from './keys';
import type { KeyValueStore } from './keyValue';

const randomId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/**
 * This device's id in `repo`, made and saved on first use. When storage fails the id still works
 * for this run; the next run makes another, which only means its writes look like a new device.
 */
export const deviceIdIn = (repo: KeyValueStore): string => {
  try {
    const saved = repo.read(KEYS.deviceId);
    if (saved) return saved;
  } catch { /* Unreadable storage: use a fresh id for now. */ }
  const id = randomId();
  try { repo.write(KEYS.deviceId, id); } catch { /* Kept in memory only. */ }
  return id;
};
