import type { PackEntry } from './manifest.ts';

/**
 * Each pack has a cache of its own, named by its hash. Updating HSK 4 opens a new HSK 4 cache and
 * leaves HSK 2's as it is. Read by the app and by the service worker config, so they always agree.
 */
export const packCachePrefix = (id: string) => `jiayou-pack-${id}-`;

export const packCacheName = (pack: Pick<PackEntry, 'id' | 'hash'>) => `${packCachePrefix(pack.id)}${pack.hash}`;

/** Stroke files from the CDN, for characters outside every pack. The CDN URL carries its version. */
export const CDN_CACHE = 'jiayou-cdn';

/** The single cache of builds before packs were versioned. Dropped once a download completes. */
export const LEGACY_CACHE_PREFIX = 'hsk-packs-';
