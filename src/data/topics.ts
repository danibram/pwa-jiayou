import type { HSKCharacter, HskLevel } from '../types';
import { characterLevel } from './catalog';

/** A character may sit in more than one topic. 吃 is both a verb and food. */
export interface Topic {
  id: string;
  title: string;
  glyph: string;
  characters: string[];
}

export const topics: Topic[] = [
  {
    id: 'verbos',
    title: 'Verbos',
    glyph: '做',
    characters: [
      '是', '在', '有', '来', '上', '说', '出', '会', '能', '作', '去', '学', '看', '开', '想', '见',
      '打', '认', '听', '住', '飞', '请', '写', '吃', '读', '买', '睡', '喝', '坐', '叫', '爱', '谢',
      '做', '租', '关', '到', '要', '得', '过', '进', '动', '知', '问', '等', '给', '走', '教', '比', '完', '让', '笑',
      '找', '考', '告', '诉', '助', '试', '送', '游', '帮', '穿', '跑', '卖', '跳', '玩', '洗', '唱', '懂',
      '踢', '休', '发', '用', '行', '成', '定', '提', '解', '变', '接', '放', '记', '求', '带', '办', '算',
      '查', '选', '跟', '留', '讲', '答', '拿', '换', '闻', '画', '遇', '借', '忘', '迎', '哭', '骑',
      '爬', '扫', '搬', '聊', '烧', '饮', '护', '练', '加',
    ],
  },
  {
    id: 'preguntas',
    title: 'Preguntas',
    glyph: '吗',
    characters: ['什', '么', '几', '怎', '吗', '呢', '谁', '哪', '问'],
  },
  {
    id: 'familia',
    title: 'Familia',
    glyph: '家',
    characters: [
      '家', '妈', '爸', '姐', '哥', '弟', '妹', '爷', '奶', '叔', '姨', '儿', '女', '夫', '妻', '丈',
      '孩', '婚', '姓', '朋', '友',
    ],
  },
  {
    id: 'numeros',
    title: 'Números',
    glyph: '一',
    characters: ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '两', '百', '千', '万', '零', '半', '双', '第'],
  },
  {
    id: 'tiempo',
    title: 'Tiempo',
    glyph: '时',
    characters: [
      '时', '年', '月', '日', '今', '昨', '早', '晚', '午', '钟', '点', '周', '星', '期', '候', '春',
      '夏', '秋', '冬', '季', '分',
    ],
  },
  {
    id: 'colores',
    title: 'Colores',
    glyph: '色',
    characters: ['色', '白', '红', '黑', '黄', '绿', '蓝', '颜'],
  },
  {
    id: 'transporte',
    title: 'Transporte',
    glyph: '车',
    characters: ['车', '飞', '坐', '开', '路', '站', '船', '骑', '辆', '运', '票', '街', '机'],
  },
  {
    id: 'direcciones',
    title: 'Direcciones',
    glyph: '东',
    characters: ['东', '西', '南', '北', '上', '下', '左', '右', '中', '里', '外', '前', '后', '边', '旁'],
  },
  {
    id: 'comida',
    title: 'Comida',
    glyph: '吃',
    characters: [
      '吃', '喝', '饭', '菜', '茶', '米', '肉', '牛', '羊', '鸡', '鱼', '蛋', '奶', '果', '苹', '瓜', '酒', '甜', '饿',
      '渴', '饱', '杯', '碗', '筷', '啤', '蕉', '糕', '烧', '饮', '咖', '啡',
    ],
  },
  {
    id: 'cuerpo',
    title: 'Cuerpo',
    glyph: '身',
    characters: ['身', '头', '脸', '眼', '睛', '目', '耳', '鼻', '口', '嘴', '牙', '手', '脚', '足', '腿', '心', '脑'],
  },
  {
    id: 'ropa',
    title: 'Ropa',
    glyph: '衣',
    characters: ['衣', '服', '穿', '鞋', '帽', '裤', '衫', '裙', '衬', '伞'],
  },
  {
    id: 'casa',
    title: 'Casa',
    glyph: '房',
    characters: ['房', '门', '桌', '椅', '床', '室', '楼', '灯', '园', '住', '居', '扫', '澡'],
  },
  {
    id: 'escuela',
    title: 'Escuela',
    glyph: '学',
    characters: ['学', '校', '师', '书', '写', '读', '习', '课', '考', '班', '笔', '纸', '铅', '词', '句', '问', '答', '教', '练', '识'],
  },
  {
    id: 'personas',
    title: 'Personas',
    glyph: '人',
    characters: ['人', '我', '你', '他', '她', '们', '您', '男', '女', '自', '己', '客', '名', '友'],
  },
  {
    id: 'animales',
    title: 'Animales',
    glyph: '狗',
    characters: ['狗', '猫', '鸟', '鱼', '马', '牛', '羊', '鸡', '熊'],
  },
  {
    id: 'naturaleza',
    title: 'Naturaleza',
    glyph: '天',
    characters: ['天', '雨', '雪', '风', '水', '火', '山', '河', '树', '花', '草', '鸟', '冰', '热', '冷', '月', '阴', '晴', '星'],
  },
  {
    id: 'lugares',
    title: 'Lugares',
    glyph: '国',
    characters: ['国', '城', '市', '京', '店', '院', '馆', '校', '园', '站', '路', '街', '房'],
  },
  {
    id: 'sentimientos',
    title: 'Sentimientos',
    glyph: '爱',
    characters: ['爱', '喜', '欢', '想', '怕', '急', '累', '忙', '乐', '兴', '谢', '愿'],
  },
  {
    id: 'compras',
    title: 'Compras',
    glyph: '钱',
    characters: ['钱', '买', '卖', '块', '贵', '元', '租', '店'],
  },
  {
    id: 'gramatica',
    title: 'Gramática',
    glyph: '的',
    characters: ['的', '了', '不', '没', '都', '也', '很', '太', '再', '吗', '呢', '吧', '着', '个', '最', '就', '还', '把', '被', '从', '和', '对', '们', '些', '过', '地'],
  },
];

export const topicById = (id: string): Topic | undefined => topics.find((topic) => topic.id === id);

export const charactersInTopic = (id: string, all: HSKCharacter[]): HSKCharacter[] => {
  const topic = topicById(id);
  if (!topic) return [];
  const byChar = new Map(all.map((char) => [char.character, char]));
  return topic.characters.flatMap((char) => {
    const found = byChar.get(char);
    return found ? [found] : [];
  });
};

/** Characters the topic lists that are not on this device, and the levels they belong to. */
export const topicGap = (id: string, installed: HSKCharacter[]): { missing: number; levels: HskLevel[] } => {
  const topic = topicById(id);
  if (!topic) return { missing: 0, levels: [] };
  const have = new Set(installed.map((char) => char.character));
  const levels = new Set<HskLevel>();
  let missing = 0;
  for (const char of topic.characters) {
    if (have.has(char)) continue;
    missing += 1;
    const level = characterLevel(char);
    if (level) levels.add(level);
  }
  return { missing, levels: [...levels].sort((a, b) => a - b) };
};
