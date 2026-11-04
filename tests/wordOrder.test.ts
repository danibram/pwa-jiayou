import { describe, expect, it } from 'vitest';
import { orderForLearning } from '../src/utils/wordOrder';

const word = (id: string, level: 1 | 2, characters: string[]) => ({ id, level, characters });

describe('orderForLearning', () => {
  it('orders each level by its rarest character and interleaves levels, lowest first', () => {
    const words = [
      word('ai', 1, ['爱']),
      word('de', 1, ['的']),
      word('ren', 2, ['人']),
      word('shi', 1, ['是']),
      word('yi', 2, ['一']),
    ];
    const order = orderForLearning(words, ['的', '一', '是', '人', '爱']).map((w) => w.id);
    expect(order).toEqual(['de', 'yi', 'shi', 'ren', 'ai']);
  });

  it('teaches the starter words first, in their order, before the frequency order', () => {
    const words = [
      { id: 'de', level: 1 as const, simplified: '的', characters: ['的'] },
      { id: 'nihao', level: 1 as const, simplified: '你好', characters: ['你', '好'] },
      { id: 'xiexie', level: 1 as const, simplified: '谢谢', characters: ['谢', '谢'] },
      { id: 'shi', level: 1 as const, simplified: '是', characters: ['是'] },
    ];
    const order = orderForLearning(words, ['的', '是', '你', '好', '谢'], ['你好', '是', '谢谢']).map((w) => w.id);
    expect(order).toEqual(['nihao', 'shi', 'xiexie', 'de']);
  });
});
