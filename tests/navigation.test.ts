import { describe, expect, it } from 'vitest';
import { screenToUrl, urlToScreen } from '../src/navigation';
import { homeScreen, type Screen } from '../src/screen';

describe('screen urls', () => {
  // Every variant of Screen, as the URL gives it back.
  const canonical: Screen[] = [
    homeScreen,
    { page: 'vocabulario' },
    { page: 'vocabulario', wordId: 'word-7231-ai4' },
    { page: 'vocabulary-review', resume: true },
    { page: 'vocabulary-review', resume: true, practiceId: 'word-7231-ai4' },
    { page: 'vocabulary-review', resume: true, practiceId: 'topic:food' },
    { page: 'vocabulary-review', resume: true, practiceId: '__all__' },
    { page: 'acerca' },
    { page: 'opciones' },
    { page: 'mis-palabras' },
    { page: 'trazos', focus: { kind: 'level' }, from: homeScreen },
    { page: 'trazos', focus: { kind: 'character', char: '爱' }, from: homeScreen },
    { page: 'trazos', focus: { kind: 'topic', char: '吃', topicId: 'food' }, from: homeScreen },
  ];

  it.each(canonical.map((screen) => [screenToUrl(screen), screen]))('reads %s back', (url, screen) => {
    expect(urlToScreen(url)).toEqual(screen);
  });

  it('uses readable paths', () => {
    expect(screenToUrl(homeScreen)).toBe('/');
    expect(screenToUrl({ page: 'vocabulario', wordId: 'word-7231-ai4' })).toBe('/palabras/word-7231-ai4');
    expect(screenToUrl({ page: 'mis-palabras' })).toBe('/mis-palabras');
    expect(screenToUrl({ page: 'trazos', focus: { kind: 'character', char: '爱' }, from: homeScreen })).toBe('/trazos/%E7%88%B1');
  });

  it('leaves tab-only state out of the url', () => {
    const from: Screen = { page: 'vocabulario', wordId: 'word-7231-ai4' };
    expect(urlToScreen(screenToUrl({ page: 'trazos', focus: { kind: 'character', char: '爱' }, from })))
      .toEqual({ page: 'trazos', focus: { kind: 'character', char: '爱' }, from: homeScreen });
    expect(urlToScreen(screenToUrl({ page: 'vocabulario', wordId: 'w', returnTo: 'mis-palabras', topic: true })))
      .toEqual({ page: 'vocabulario', wordId: 'w' });
    expect(urlToScreen(screenToUrl({ page: 'vocabulary-review', resume: false, practiceId: 'w' })))
      .toEqual({ page: 'vocabulary-review', resume: true, practiceId: 'w' });
  });

  it('accepts a trailing slash and ignores the hash', () => {
    expect(urlToScreen('/palabras/')).toEqual({ page: 'vocabulario' });
    expect(urlToScreen('/acerca#arriba')).toEqual({ page: 'acerca' });
  });

  it.each([
    '/nada',
    '/palabras/a/b',
    '/palabras/%',
    '/acerca/extra',
    '/mis-palabras/w',
    '/home',
    '/vocabulary-review',
  ])('rejects %s', (url) => {
    expect(urlToScreen(url)).toBeUndefined();
  });
});
