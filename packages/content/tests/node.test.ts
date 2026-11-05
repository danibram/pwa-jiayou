import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Scripts import this package with plain Node, which strips types but needs `.ts` relative imports and
// no syntax that compiles to code. Vitest resolves either way, so only a real Node import catches a slip.
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { name: string; exports: Record<string, string> };

describe('plain Node import', () => {
  it.each(Object.keys(manifest.exports).filter((path) => !path.startsWith('./testing')))('loads %s', (path) => {
    const specifier = path === '.' ? manifest.name : `${manifest.name}/${path.slice(2)}`;
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', `const m = await import(${JSON.stringify(specifier)}); console.log(Object.keys(m).length);`], { encoding: 'utf8' });
    expect(Number(out.trim())).toBeGreaterThan(0);
  });
});
