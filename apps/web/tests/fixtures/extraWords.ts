/** Extra words for tests, as the content editor writes them to src/data/vocabulary/extra.json. */
const word = (id: string, simplified: string, pinyin: string, meaning: string, topicIds: string[] = []) => ({
  id, simplified, traditional: simplified, pinyin, senses: meaning.split('; ').map((text) => ({ pos: 'sustantivo' as const, text })), characters: [...simplified], topicIds, sourceId: 'curated-extra',
});

export const extraWords = [
  word('word-5496-55b1-ka-li2', '咖喱', 'kā lí', 'curry; sauce', ['comida']),
  word('word-55b1-li2', '喱', 'lí', 'gel'),
  word('word-7a0b-5e8f-5458-cheng2-xu4-yuan2', '程序员', 'chéng xù yuán', 'programador', ['trabajos']),
  word('word-597d-5417-hao3-ma5', '好吗', 'hǎo ma', 'ok'),
];
