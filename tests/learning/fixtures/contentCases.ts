/** Catalog examples for future question and answer evaluation tests. */
export const ambiguityCases = [
  {
    kind: 'homophone', requiresContext: true,
    entries: [
      { id: 'word-4ed6-ta', simplified: '他', pinyin: 'tā', sense: 'él' },
      { id: 'word-5979-ta', simplified: '她', pinyin: 'tā', sense: 'ella' },
    ],
  },
  {
    kind: 'homophone', requiresContext: true,
    entries: [
      { id: 'word-5728-zai4', simplified: '在', pinyin: 'zài', sense: 'estar en' },
      { id: 'word-518d-zai4', simplified: '再', pinyin: 'zài', sense: 'otra vez' },
    ],
  },
  {
    kind: 'particle', requiresContext: true,
    entries: [
      { id: 'word-7684-de5', simplified: '的', pinyin: 'de', sense: 'partícula posesiva y atributiva' },
      { id: 'word-5730-de5', simplified: '地', pinyin: 'de', sense: 'partícula adverbial' },
      { id: 'word-5f97-de5', simplified: '得', pinyin: 'de', sense: 'partícula de complemento' },
    ],
  },
  {
    kind: 'shared-sense', requiresContext: true,
    entries: [
      { id: 'word-559c-6b22-xi3-huan5', simplified: '喜欢', pinyin: 'xǐ huan', sense: 'querer' },
      { id: 'word-7231-ai4', simplified: '爱', pinyin: 'ài', sense: 'querer' },
    ],
  },
  {
    kind: 'shared-sense', requiresContext: true,
    entries: [
      { id: 'word-9ad8-5174-gao-xing4', simplified: '高兴', pinyin: 'gāo xìng', sense: 'feliz' },
      { id: 'word-5feb-4e50-kuai4-le4', simplified: '快乐', pinyin: 'kuài lè', sense: 'feliz' },
    ],
  },
  {
    kind: 'multiple-readings', requiresContext: true,
    entries: [
      { id: 'word-8fd8-hai2', simplified: '还', pinyin: 'hái', sense: 'todavía' },
      { id: 'word-8fd8-huan2', simplified: '还', pinyin: 'huán', sense: 'devolver' },
    ],
  },
  {
    kind: 'multiple-readings', requiresContext: true,
    entries: [
      { id: 'word-957f-chang2', simplified: '长', pinyin: 'cháng', sense: 'largo' },
      { id: 'word-957f-zhang3', simplified: '长', pinyin: 'zhǎng', sense: 'crecer' },
    ],
  },
] as const;

/** Input variants are examples for policy design, not a declaration that answers are accepted. */
export const pinyinCases = [
  { id: 'word-7238-7238-ba4-ba5', simplified: '爸爸', pinyin: 'bà ba', variants: ['ba4 ba5', 'bà ba'] },
  { id: 'word-8c22-8c22-xie4-xie5', simplified: '谢谢', pinyin: 'xiè xie', variants: ['xie4 xie5', 'xiè xie'] },
  { id: 'word-55ef-ng4', simplified: '嗯', pinyin: 'ǹg', variants: ['ng4', 'ǹg'] },
] as const;
