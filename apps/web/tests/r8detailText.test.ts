import { describe, expect, it } from 'vitest';
import { withToneSandhi } from '../src/utils/pinyin';
import { displayGloss, glossHead } from '../src/utils/glossDisplay';

describe('withToneSandhi', () => {
  it('turns 不 into bú before a fourth tone', () => {
    expect(withToneSandhi('不客气', 'bù kè qi')).toBe('bú kè qi');
    expect(withToneSandhi('不好', 'bù hǎo')).toBe('bù hǎo');
    expect(withToneSandhi('对不起', 'duì bu qǐ')).toBe('duì bu qǐ');
  });

  it('turns 一 into yí or yì by the tone after it', () => {
    expect(withToneSandhi('一个', 'yī ge')).toBe('yí ge');
    expect(withToneSandhi('一个', 'yí ge')).toBe('yí ge');
    expect(withToneSandhi('一定', 'yī dìng')).toBe('yí dìng');
    expect(withToneSandhi('一起', 'yī qǐ')).toBe('yì qǐ');
    expect(withToneSandhi('一般', 'yī bān')).toBe('yì bān');
    expect(withToneSandhi('一直', 'yī zhí')).toBe('yì zhí');
  });

  it('keeps yī in numbers, ordinals, dates and at the end of a word', () => {
    expect(withToneSandhi('一', 'yī')).toBe('yī');
    expect(withToneSandhi('第一', 'dì yī')).toBe('dì yī');
    expect(withToneSandhi('一月', 'yī yuè')).toBe('yī yuè');
    expect(withToneSandhi('十一', 'shí yī')).toBe('shí yī');
    expect(withToneSandhi('统一', 'tǒng yī')).toBe('tǒng yī');
  });

  it('leaves pinyin alone when syllables and characters do not line up', () => {
    expect(withToneSandhi('一会儿', 'yī huìr')).toBe('yī huìr');
  });
});

describe('displayGloss', () => {
  it('moves classifier notes after the meaning and spells them out', () => {
    expect(displayGloss('(clas. libros); origen')).toBe('origen; clasificador de libros');
    expect(glossHead('(clas. libros); origen')).toBe('origen');
    expect(displayGloss('clasif. (árboles)')).toBe('clasificador de árboles');
  });

  it('drops source notes and Cantonese senses', () => {
    expect(displayGloss('reina, emperatriz; (simplificado de 後) detrás, después')).toBe('reina, emperatriz; detrás, después');
    expect(displayGloss('partícula final; (cant.) este')).toBe('partícula final');
  });

  it('keeps ordinary glosses as they are', () => {
    expect(displayGloss('raíz, origen, fuente')).toBe('raíz, origen, fuente');
    expect(displayGloss('casarse (mujer)')).toBe('casarse (mujer)');
  });
});
