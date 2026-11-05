import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contentVersion, contentVersionLabel, formatContentDate } from '../src/data/contentVersion';

describe('content version', () => {
  it('reads a positive version with a date from content/version.json', () => {
    const raw = JSON.parse(readFileSync('content/version.json', 'utf8'));
    expect(contentVersion.version).toBe(raw.version);
    expect(contentVersion.version).toBeGreaterThan(0);
    expect(contentVersion.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(contentVersion.notes.length).toBeGreaterThan(0);
  });

  it('formats the label in Spanish', () => {
    expect(formatContentDate('2026-11-03')).toBe('3 de noviembre de 2026');
    expect(formatContentDate('ayer')).toBe('ayer');
    expect(contentVersionLabel()).toMatch(/^Contenido v\d+, del \d+ de \w+ de \d{4}$/);
  });
});
