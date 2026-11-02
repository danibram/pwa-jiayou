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
});
