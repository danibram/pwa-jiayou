import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STROKE_RUBRIC_REVISION } from '../../../src/domain/learning/exercises';

// Vitest runs from the repository root, as tests/setup.ts assumes.
const read = (path: string): unknown => JSON.parse(readFileSync(`${process.cwd()}/${path}`, 'utf8'));
const versionOf = (name: string): string => (read(`node_modules/${name}/package.json`) as { version: string }).version;
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
