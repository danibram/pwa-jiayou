import { describe, expect, it } from 'vitest';
import characterLevels from '../src/data/characterLevels.json';
import { listedThemes, topicGap, topicScope, topicTags, topicTitlesForCharacter, topics } from '../src/data/topics';
import { characterStore } from '../src/stores/characterStore';

const known = new Set(Object.keys(characterLevels));

describe('topics', () => {
  it('only names characters that exist, once per topic', () => {
    const missing: string[] = [];
    for (const topic of topics) {
      const seen = new Set<string>();
      for (const char of topic.characters) {
        if (!known.has(char)) missing.push(`${topic.id}:${char}`);
        expect(seen.has(char), `${topic.id} repeats ${char}`).toBe(false);
        seen.add(char);
      }
      expect(topic.characters.length).toBeGreaterThan(4);
      expect(['theme', 'subtopic', 'tag']).toContain(topic.kind);
      if (topic.kind === 'subtopic') expect(topic.parentId).toBeTruthy();
    }
    expect(missing).toEqual([]);
  });

  it('uses a unique id and title for each topic', () => {
    expect(new Set(topics.map((topic) => topic.id)).size).toBe(topics.length);
    expect(new Set(topics.map((topic) => topic.title)).size).toBe(topics.length);
  });

  it('lists topic titles for a character', () => {
    const titles = topicTitlesForCharacter('吃');
    expect(titles).toContain('Comida y bebida');
    expect(titles).toContain('Verbos');
  });

  it('exposes five listed themes and combinable tags', () => {
    expect(listedThemes().map((topic) => topic.id)).toEqual(['comida', 'personas', 'casa', 'transporte', 'compras']);
    expect(topicTags().map((topic) => topic.id)).toEqual(['verbos', 'preguntas', 'gramatica', 'clasificadores', 'numeros', 'colores']);
    expect(topicScope('comida')).toContain('bebidas');
  });

  it('counts characters a theme knows about that are not installed, including subtopics', () => {
    const gap = topicGap('comida', characterStore.state.characters);
    expect(gap.missing).toBeGreaterThan(0);
    expect(gap.levels.every((level) => level > 1)).toBe(true);
    const installed = new Set(characterStore.state.characters.map((row) => row.character));
    const glyphs = [...new Set(topicScope('comida').flatMap((id) => topics.find((topic) => topic.id === id)?.characters ?? []))];
    expect(gap.missing).toBe(glyphs.filter((char) => !installed.has(char)).length);
  });
});
