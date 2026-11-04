import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyAssignments, matchCatalog, rebuildTopics,
} from './categorize-tongtong-topics.mjs';
import {
  EXISTING_SUBTOPIC_PARENT, TAG_IDS, TONG_LIST_MAP, VISIBLE_THEME_IDS, listSlugsForThemes, subtopicsFromMap,
} from './topic-taxonomy.mjs';

test('maps TongTong food lists into the comida theme', () => {
  assert.equal(TONG_LIST_MAP.beverages.themeId, 'comida');
  assert.equal(TONG_LIST_MAP.beverages.subtopicId, 'bebidas');
  assert.ok(listSlugsForThemes(['comida']).includes('fruits'));
  assert.ok(subtopicsFromMap().some((row) => row.id === 'restaurante' && row.parentId === 'comida'));
});

test('rebuildTopics elevates existing ids and adds subtopics', () => {
  const known = new Set(['吃', '喝', '饭', '菜', '茶', '家', '妈', '爸', '姐', '哥', '人', '我', '你', '他', '她', '房', '门', '桌', '椅', '床', '车', '飞', '坐', '开', '路', '钱', '买', '卖', '块', '贵', '是', '在', '有', '来', '上', '做', '吗', '什', '么', '几', '怎', '一', '二', '三', '四', '五', '色', '白', '红', '黑', '黄', '个', '只', '条', '张', '本', '的', '了', '不', '没', '都', '时', '年', '月', '日', '今', '学', '校', '师', '书', '写', '工', '作', '职', '业', '班', '身', '头', '脸', '眼', '睛', '狗', '猫', '鸟', '鱼', '马', '天', '雨', '雪', '风', '水', '衣', '服', '穿', '鞋', '帽', '东', '西', '南', '北', '中', '国', '城', '市', '京', '店', '爱', '喜', '欢', '想', '怕']);
  const base = [
    { id: 'comida', title: 'Comida', glyph: '吃', characters: ['吃', '喝', '饭', '菜', '茶'] },
    { id: 'personas', title: 'Personas', glyph: '人', characters: ['人', '我', '你', '他', '她'] },
    { id: 'casa', title: 'Casa', glyph: '房', characters: ['房', '门', '桌', '椅', '床'] },
    { id: 'transporte', title: 'Transporte', glyph: '车', characters: ['车', '飞', '坐', '开', '路'] },
    { id: 'compras', title: 'Compras', glyph: '钱', characters: ['钱', '买', '卖', '块', '贵'] },
    { id: 'familia', title: 'Familia', glyph: '家', characters: ['家', '妈', '爸', '姐', '哥'] },
    { id: 'sentimientos', title: 'Sentimientos', glyph: '爱', characters: ['爱', '喜', '欢', '想', '怕'] },
    { id: 'ropa', title: 'Ropa', glyph: '衣', characters: ['衣', '服', '穿', '鞋', '帽'] },
    { id: 'direcciones', title: 'Direcciones', glyph: '东', characters: ['东', '西', '南', '北', '中'] },
    { id: 'lugares', title: 'Lugares', glyph: '国', characters: ['国', '城', '市', '京', '店'] },
    ...TAG_IDS.map((id, i) => ({ id, title: id, glyph: ['做', '吗', '的', '个', '一', '色'][i], characters: ['是', '在', '有', '来', '上'] })),
    { id: 'tiempo', title: 'Tiempo', glyph: '时', characters: ['时', '年', '月', '日', '今'] },
    { id: 'escuela', title: 'Escuela', glyph: '学', characters: ['学', '校', '师', '书', '写'] },
    { id: 'trabajos', title: 'Trabajos', glyph: '工', characters: ['工', '作', '职', '业', '班'] },
    { id: 'cuerpo', title: 'Cuerpo', glyph: '身', characters: ['身', '头', '脸', '眼', '睛'] },
    { id: 'animales', title: 'Animales', glyph: '狗', characters: ['狗', '猫', '鸟', '鱼', '马'] },
    { id: 'naturaleza', title: 'Naturaleza', glyph: '天', characters: ['天', '雨', '雪', '风', '水'] },
  ];
  const topics = rebuildTopics(base, known);
  assert.equal(topics.find((t) => t.id === 'comida')?.kind, 'theme');
  assert.equal(topics.find((t) => t.id === 'comida')?.title, 'Comida y bebida');
  assert.equal(topics.find((t) => t.id === 'familia')?.parentId, 'personas');
  assert.equal(topics.find((t) => t.id === 'verbos')?.kind, 'tag');
  assert.equal(topics.find((t) => t.id === 'tiempo')?.listed, false);
  assert.ok(topics.some((t) => t.id === 'bebidas' && t.parentId === 'comida'));
  for (const id of Object.keys(EXISTING_SUBTOPIC_PARENT)) {
    assert.equal(topics.find((t) => t.id === id)?.kind, 'subtopic');
  }
  for (const id of VISIBLE_THEME_IDS) {
    assert.equal(topics.find((t) => t.id === id)?.listed, undefined);
  }
});

test('matchCatalog prefers exact pinyin and applyAssignments is additive', () => {
  const vocabulary = [
    { id: 'a', simplified: '茶', pinyin: 'chá', topicIds: ['comida'] },
    { id: 'b', simplified: '茶', pinyin: 'chá ye', topicIds: [] },
  ];
  const { hits, misses } = matchCatalog([{ simplified: '茶', pinyin: 'chá' }], vocabulary);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].word.id, 'a');
  assert.equal(misses.length, 0);
  const map = new Map([['a', new Set(['bebidas', 'comida'])]]);
  const { vocabulary: next, added } = applyAssignments(vocabulary, map);
  assert.equal(added, 1);
  assert.deepEqual(next[0].topicIds, ['comida', 'bebidas']);
});
