import type { ConfigId, SchedulerConfig } from '../types';

/** JSON with keys sorted and undefined values dropped, so equal objects compare equal whatever their key order. */
export const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const CONFIG_ID_PREFIX = 'scheduler-config:sha256:';

/** SHA-256 of the config's canonical JSON. Two devices with the same config get the same id. */
export const configId = async (config: SchedulerConfig): Promise<ConfigId> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(config)));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${CONFIG_ID_PREFIX}${hex}`;
};
