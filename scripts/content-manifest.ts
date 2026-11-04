// The content manifest: one entry per pack (characters, strokes, clips and the level's words), with a hash that changes only when that pack's files do.
// vite.config.ts reads it to name each pack's cache; build-media-packs.mjs writes it to
// public/packs/content.json; tests/contentManifest.test.ts checks the two agree.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { ContentManifest, PackEntry } from '../src/domain/content/manifest.ts';

const SCHEMA = 1;
export const LEVELS = [2, 3, 4, 5, 6];

const filesUnder = (path: string): string[] => {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).sort().flatMap((name) => filesUnder(join(path, name)));
};

const entry = (root: string, id: string, paths: string[], level?: number): PackEntry => {
  const hash = createHash('sha256');
  let size = 0;
  for (const file of paths.flatMap((path) => filesUnder(join(root, path)))) {
    const body = readFileSync(file);
    hash.update(relative(root, file));
    hash.update(body);
    size += body.length;
  }
  return { id, ...(level ? { level } : {}), hash: hash.digest('hex').slice(0, 12), size, schema: SCHEMA };
};

/**
 * A level's word list. It lives with the editor's other sources and is served as `packs/hskN/words.json`
 * (vite.config.ts), so it is part of that level's pack: same cache, same hash, same offline copy.
 */
export const wordListPath = (level: number) => `src/data/vocabulary/hsk${level}.json`;

/** The manifest of the content under `root`/public. A pack with no files on disk is left out. */
export const contentManifest = (root: string): ContentManifest => ({
  packs: [
    ...LEVELS.filter((level) => existsSync(join(root, `public/packs/hsk${level}.json`)))
      .map((level) => entry(root, `hsk${level}`, [`public/packs/hsk${level}.json`, `public/packs/hsk${level}`, wordListPath(level)], level)),
    entry(root, 'audio', ['public/audio']),
  ],
});
