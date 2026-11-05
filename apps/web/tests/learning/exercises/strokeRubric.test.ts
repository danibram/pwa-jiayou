import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STROKE_RUBRIC_REVISION } from '@jiayou/learning/exercises';

// Vitest runs from apps/web, as tests/setup.ts assumes. npm workspaces install packages at the repository root.
const read = (path: string): unknown => JSON.parse(readFileSync(`${process.cwd()}/${path}`, 'utf8'));
const installed = (name: string) => [`node_modules/${name}`, `../../node_modules/${name}`].find((dir) => existsSync(`${process.cwd()}/${dir}`));
const versionOf = (name: string): string => (read(`${installed(name)}/package.json`) as { version: string }).version;
const manifest = read('package.json') as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

describe('stroke rubric revision', () => {
  it('names the installed hanzi-writer and hanzi-writer-data', () => {
    expect(STROKE_RUBRIC_REVISION).toBe(`hanzi-writer@${versionOf('hanzi-writer')}+hanzi-writer-data@${versionOf('hanzi-writer-data')}`);
  });

  it('matches the exact versions package.json pins', () => {
    const pinned = { ...manifest.dependencies, ...manifest.devDependencies };
    expect(STROKE_RUBRIC_REVISION).toBe(`hanzi-writer@${pinned['hanzi-writer']}+hanzi-writer-data@${pinned['hanzi-writer-data']}`);
  });
});
