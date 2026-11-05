import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateSnapshot } from '../lib/model';

const root = resolve(process.cwd(), '..');
const path = (name: string) => resolve(root, name);

describe('editor base', () => {
  it('matches the canonical snapshot and revision', () => {
    const canonical = JSON.parse(readFileSync(path('content/snapshot.json'), 'utf8'));
    validateSnapshot(canonical);
    const snapshot = readFileSync(path('editor/public/base/snapshot.json'));
    expect(JSON.parse(snapshot.toString())).toEqual(canonical);
    const revision = JSON.parse(readFileSync(path('editor/public/base/revision.json'), 'utf8'));
    expect(revision.revision).toBe(createHash('sha256').update(snapshot).digest('hex'));
  });
});
