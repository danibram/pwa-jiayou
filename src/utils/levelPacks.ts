import { BUNDLED_LEVEL, catalogLevels } from '../data/catalog';
import { characterStore, parseCharacterList } from '../stores/characterStore';
import type { HskLevel } from '../types';
import { isHskLevel } from './parse';

const INSTALL_KEY = 'hsk-installed-levels';
const CACHE_NAME = 'hsk-packs-v1';
const USED_KEYS = ['hsk-flashcards-progress', 'hsk-flashcards-stats', 'jiayou-session-v1'];

const downloadable = (level: HskLevel) =>
  level !== BUNDLED_LEVEL && catalogLevels.some((row) => row.level === level && row.available);

export const packPath = (level: HskLevel) => `${import.meta.env.BASE_URL}packs/hsk${level}.json`;

export const readInstalledLevels = (): HskLevel[] | null => {
  try {
    const raw = localStorage.getItem(INSTALL_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const levels = [...new Set(parsed.filter(isHskLevel))]
      .filter((level) => level === BUNDLED_LEVEL || downloadable(level))
      .sort((a, b) => a - b);
    if (!levels.includes(BUNDLED_LEVEL)) levels.unshift(BUNDLED_LEVEL);
    return levels;
  } catch {
    return null;
  }
};

export const writeInstalledLevels = (levels: readonly HskLevel[]) => {
  const next = [...new Set(levels)]
    .filter((level) => level === BUNDLED_LEVEL || downloadable(level))
    .sort((a, b) => a - b);
  if (!next.includes(BUNDLED_LEVEL)) next.unshift(BUNDLED_LEVEL);
  localStorage.setItem(INSTALL_KEY, JSON.stringify(next));
};

/** Someone already studied here, before lists were optional. */
export const hasUsedApp = (): boolean => {
  try {
    return USED_KEYS.some((key) => localStorage.getItem(key) !== null);
  } catch {
    return false;
  }
};

const openCache = async (): Promise<Cache | null> => {
  try {
    if (!('caches' in globalThis)) return null;
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
};

const readPack = async (level: HskLevel) => {
  const path = packPath(level);
  const cache = await openCache();
  const hit = cache ? await cache.match(path) : undefined;
  if (hit) return parseCharacterList(await hit.json(), level);
  const response = await fetch(path);
  if (!response.ok) throw new Error(`No se pudo guardar HSK ${level}.`);
  if (cache) await cache.put(path, response.clone());
  return parseCharacterList(await response.json(), level);
};

export const forgetPack = async (level: HskLevel) => {
  const cache = await openCache();
  if (!cache) return;
  try {
    await cache.delete(packPath(level));
  } catch {
    // The list is already gone from the deck.
  }
};

/** Download lists that are not in memory yet. Leaves the deck selection alone. */
export const loadInstalledPacks = async (levels: readonly HskLevel[]) => {
  for (const level of levels) {
    if (!downloadable(level) || characterStore.hasLevel(level)) continue;
    characterStore.installCharacters(await readPack(level));
  }
};

const rollback = async (levels: readonly HskLevel[]) => {
  for (const level of levels) {
    characterStore.removeLevel(level);
    await forgetPack(level);
  }
};

/**
 * Make the device match `wanted`. HSK 1 stays.
 * A failed download leaves the previous lists in place.
 */
export const applyLevelChoice = async (wanted: readonly HskLevel[]) => {
  const previous = readInstalledLevels() ?? [BUNDLED_LEVEL];
  const next = [...new Set<HskLevel>([BUNDLED_LEVEL, ...wanted])]
    .filter((level) => level === BUNDLED_LEVEL || downloadable(level))
    .sort((a, b) => a - b);
  const added = next.filter((level) => downloadable(level) && !characterStore.hasLevel(level));
  const removed = previous.filter((level) => downloadable(level) && !next.includes(level));
  const installed: HskLevel[] = [];
  try {
    for (const level of added) {
      characterStore.installCharacters(await readPack(level));
      installed.push(level);
    }
  } catch (error) {
    await rollback(installed);
    throw error;
  }
  const prevSelected = [...characterStore.state.selectedLevels];
  for (const level of removed) {
    characterStore.removeLevel(level);
    await forgetPack(level);
  }
  writeInstalledLevels(next);
  const kept = prevSelected.filter((level) => next.includes(level));
  const selected = (prevSelected.length === 0 ? next : [...new Set([...kept, ...added])]).sort((a, b) => a - b);
  characterStore.selectLevels(selected.length > 0 ? selected : [BUNDLED_LEVEL]);
};
