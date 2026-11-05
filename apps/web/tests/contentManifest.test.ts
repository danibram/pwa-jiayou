import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentManifest } from '../../../scripts/content-manifest';
import { packCacheName } from '@jiayou/content';
import { PACK_SCHEMA, usablePacks } from '@jiayou/content';

describe('content manifest', () => {
  it('matches the pack files, so the committed copy is never stale', () => {
    const committed = JSON.parse(readFileSync('public/packs/content.json', 'utf8'));
    expect(committed).toEqual(contentManifest(process.cwd()));
  });

  it('changes only the hash of the pack whose files changed', () => {
    const root = mkdtempSync(join(tmpdir(), 'jiayou-content-'));
    try {
      for (const level of [2, 3]) {
        mkdirSync(join(root, `public/packs/hsk${level}`), { recursive: true });
        cpSync(`public/packs/hsk${level}.json`, join(root, `public/packs/hsk${level}.json`));
        cpSync(`public/packs/hsk${level}/syllables.json`, join(root, `public/packs/hsk${level}/syllables.json`));
      }
      mkdirSync(join(root, 'public/audio/f'), { recursive: true });
      cpSync('public/audio/f/a.mp3', join(root, 'public/audio/f/a.mp3'));
      const before = contentManifest(root);
      writeFileSync(join(root, 'public/packs/hsk3/strokes.json'), '{}');
      const after = contentManifest(root);
      const hash = (manifest: typeof before, id: string) => manifest.packs.find((pack) => pack.id === id)?.hash;
      expect(hash(after, 'hsk2')).toBe(hash(before, 'hsk2'));
      expect(hash(after, 'audio')).toBe(hash(before, 'audio'));
      expect(hash(after, 'hsk3')).not.toBe(hash(before, 'hsk3'));
      expect(packCacheName({ id: 'hsk3', hash: hash(after, 'hsk3')! })).toBe(`jiayou-pack-hsk3-${hash(after, 'hsk3')}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('skips a pack with a schema newer than this build reads', () => {
    const usable = usablePacks({ packs: [
      { id: 'hsk2', level: 2, hash: 'a', size: 1, schema: PACK_SCHEMA },
      { id: 'hsk3', level: 3, hash: 'b', size: 1, schema: PACK_SCHEMA + 1 },
    ] });
    expect([...usable.keys()]).toEqual(['hsk2']);
  });
});
