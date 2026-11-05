import type { HSKCharacter, HskLevel, Topic } from '@jiayou/content';
import { characterLevel } from './catalog';

export type { Topic, TopicKind } from '@jiayou/content';

export const topics: Topic[] = [
  {
    id: 'comida',
    title: 'Comida y bebida',
    glyph: '吃',
    kind: 'theme',
    characters: [
      '吃', '喝', '饭', '菜', '茶', '米', '肉', '牛', '羊', '鸡', '鱼', '蛋', '奶', '果', '苹', '瓜',
      '酒', '甜', '饿', '渴', '饱', '杯', '碗', '筷', '啤', '蕉', '糕', '烧', '饮', '咖', '啡',
    ],
  },
  {
    id: 'alimentos',
    title: 'Alimentos',
    glyph: '饭',
    kind: 'subtopic',
    parentId: 'comida',
    characters: [
      '吃', '食', '物', '蛋', '糕', '菜', '巧', '克', '力', '糖', '新', '鲜', '饼', '干', '汤', '品',
      '丁', '饱', '点', '心', '胃', '口', '花', '生', '面', '条', '豆', '腐', '饮', '罐', '头', '零',
      '粥', '素', '丰', '盛', '小', '变', '质', '饺', '子', '佳', '肴', '包', '馋', '苹', '果', '水',
      '香', '蕉', '桃', '葡', '萄', '梨', '西', '瓜', '橙', '桔', '实', '玉', '米', '饭', '粮', '麦',
      '馒', '鸡', '宰', '海', '羊', '肉', '烤', '鸭', '土', '蔬', '辣', '椒', '红', '柿', '黄',
    ],
  },
  {
    id: 'bebidas',
    title: 'Bebidas',
    glyph: '茶',
    kind: 'subtopic',
    parentId: 'comida',
    characters: [
      '喝', '咖', '啡', '茶', '饮', '料', '牛', '奶', '果', '汁', '矿', '泉', '水', '开', '酒', '吧',
      '醉', '啤', '干', '杯', '抽', '烟', '精', '酗', '戒',
    ],
  },
  {
    id: 'sabores',
    title: 'Sabores',
    glyph: '甜',
    kind: 'subtopic',
    parentId: 'comida',
    characters: [
      '甜', '味', '道', '辣', '好', '吃', '香', '苦', '酸', '口', '滋', '盐', '椒', '淡', '咸', '醋',
      '风', '可', '调', '料', '腥', '油', '腻', '清',
    ],
  },
  {
    id: 'cocina',
    title: 'Cocina',
    glyph: '烧',
    kind: 'subtopic',
    parentId: 'comida',
    characters: [
      '切', '炒', '煮', '熬', '煎', '烹', '饪', '淋', '沸', '腾', '盛', '烘', '涮', '调', '和', '烤',
      '鸭', '刀', '碗', '杯', '子', '盘', '瓶', '锅', '壶', '勺', '叉', '筷', '烧',
    ],
  },
  {
    id: 'restaurante',
    title: 'Restaurante',
    glyph: '馆',
    kind: 'subtopic',
    parentId: 'comida',
    characters: [
      '酒', '吧', '餐', '厅', '饭', '店', '宴', '会', '服', '务', '员', '打', '包', '菜', '单', '请',
      '客', '馆', '结', '账',
    ],
  },
  {
    id: 'personas',
    title: 'Personas y relaciones',
    glyph: '人',
    kind: 'theme',
    characters: ['人', '我', '你', '他', '她', '们', '您', '男', '女', '自', '己', '客', '名', '友'],
  },
  {
    id: 'familia',
    title: 'Familia',
    glyph: '家',
    kind: 'subtopic',
    parentId: 'personas',
    characters: [
      '家', '妈', '爸', '亲', '爱', '父', '长', '宝', '贝', '儿', '子', '兄', '弟', '女', '妻', '母',
      '丈', '夫', '庭', '太', '哥', '妹', '姐', '叔', '奶', '爷', '姓', '阿', '姨', '孙', '抚', '养',
      '双', '胞', '胎', '戚', '祖', '属', '舅', '后', '代', '姑', '同', '先', '出', '身', '配', '偶',
      '岳', '姥', '辈', '嫂', '伯', '团', '圆', '媳', '妇', '孝', '顺', '常', '天', '伦', '之', '乐',
      '结', '婚', '约', '会', '礼', '吻', '姻', '分', '手', '嫁', '离', '情', '浪', '漫', '抛', '弃',
      '娶', '对', '象', '恋', '交', '往', '新', '娘', '追', '求', '伴', '侣', '热', '郎', '美', '满',
      '暧', '昧', '孩', '朋', '友',
    ],
  },
  {
    id: 'sentimientos',
    title: 'Sentimientos',
    glyph: '爱',
    kind: 'subtopic',
    parentId: 'personas',
    characters: [
      '好', '喜', '欢', '爱', '抱', '歉', '高', '兴', '担', '心', '笑', '害', '怕', '开', '讨', '厌',
      '快', '乐', '紧', '张', '不', '意', '思', '关', '生', '气', '哭', '痛', '苦', '可', '怜', '吓',
      '享', '受', '恨', '恐', '怖', '安', '静', '感', '失', '望', '遗', '憾', '奋', '情', '愉', '幸',
      '福', '激', '动', '荣', '在', '乎', '无', '聊', '表', '轻', '松', '伤', '惧', '惊', '讶', '难',
      '过', '折', '磨', '想', '念', '绪', '满', '愤', '怒', '惜', '后', '悔', '孤', '独', '刺', '足',
      '哼', '欣', '赏', '尴', '尬', '吃', '了', '放', '嫉', '妒', '怨', '自', '豪', '微', '眼', '神',
      '平', '同', '唉', '绝', '沮', '丧', '慰', '震', '着', '急', '趣', '恶', '单', '怀', '温', '暖',
      '崇', '拜', '欲', '堪', '酸', '羞', '诱', '惑', '烦', '恼', '热', '悲', '惨', '寂', '寞', '滋',
      '味', '迷', '发', '火', '忍', '住', '操', '丢', '人', '耻', '烈', '迫', '及', '待', '奇', '珍',
      '哀', '镇', '定', '亲', '羡', '慕', '憋', '沉', '重', '忧', '郁', '为', '宁', '恩', '得', '鼓',
      '舞', '佩', '服', '闹', '反', '空', '虚', '颤', '抖', '哎', '流', '泪', '畏', '活', '罪', '别',
      '扭', '悦', '惭', '愧', '融', '洽', '立', '挫', '饶', '恕', '衷', '顾', '虑', '钦', '共', '鸣',
      '埋', '振', '露', '惦', '记', '戴', '切', '谅', '解', '舍', '慌', '敬', '瘾', '寄', '托', '护',
      '蔑', '视', '泄', '耐', '悬', '留', '恋', '巴', '愣', '算', '叹', '惋', '灰', '奈', '牢', '骚',
      '疼', '委', '屈', '茫', '然', '焦', '卑', '愁', '凄', '凉', '呆', '狼', '狈', '精', '打', '采',
      '力', '赞', '追', '悼', '敌', '舒', '畅', '诧', '异', '纳', '闷', '儿', '何', '盈', '眶', '称',
      '如', '咬', '牙', '齿', '致', '勃', '累', '忙', '谢', '愿',
    ],
  },
  {
    id: 'amigos',
    title: 'Amigos',
    glyph: '友',
    kind: 'subtopic',
    parentId: 'personas',
    characters: [
      '朋', '友', '认', '识', '送', '关', '系', '帮', '忙', '交', '遇', '到', '见', '面', '陪', '邀',
      '请', '聚', '会', '搭', '档', '邻', '居', '相', '处', '伙', '伴', '同', '学', '拥', '抱', '往',
      '谊', '打', '道', '招', '待', '接', '密', '切', '探', '望', '碰', '看', '融', '洽', '款', '际',
      '逢', '和', '睦', '应', '酬', '照', '怠', '慢',
    ],
  },
  {
    id: 'saludos',
    title: 'Saludos',
    glyph: '谢',
    kind: 'subtopic',
    parentId: 'personas',
    characters: [
      '谢', '请', '嗨', '对', '不', '起', '喂', '再', '见', '感', '欢', '迎', '拜', '托', '没', '关',
      '系', '好', '意', '思', '客', '气', '祝', '道', '歉', '贺', '干', '杯', '你', '辛', '苦', '礼',
      '貌', '光', '临', '保', '重', '访', '福', '告', '别', '接', '握', '手', '打', '招', '呼', '问',
      '候', '劳', '驾', '敬', '诸', '位', '鞠', '躬', '节', '辞', '和', '慰', '寒', '暄', '绝', '怠',
      '慢', '敢', '当',
    ],
  },
  {
    id: 'gente',
    title: 'Gente',
    glyph: '名',
    kind: 'subtopic',
    parentId: 'personas',
    characters: [
      '人', '大', '家', '您', '女', '伙', '别', '男', '类', '姑', '娘', '个', '员', '私', '对', '方',
      '物', '本', '妇', '士', '儿', '无', '赖', '诸', '位', '体', '老', '百', '姓', '行', '孩', '子',
      '长', '死', '亡', '年', '轻', '怀', '孕', '出', '生', '小', '去', '世', '婴', '童', '纪', '龄',
      '娃', '退', '休', '成', '青', '少', '诞', '春', '发', '育', '衰', '寿', '命', '逝', '代', '名',
    ],
  },
  {
    id: 'casa',
    title: 'Casa y rutina',
    glyph: '房',
    kind: 'theme',
    characters: ['房', '门', '桌', '椅', '床', '室', '楼', '灯', '园', '住', '居', '扫', '澡'],
  },
  {
    id: 'ropa',
    title: 'Ropa',
    glyph: '衣',
    kind: 'subtopic',
    parentId: 'casa',
    characters: [
      '带', '穿', '衣', '服', '戴', '脱', '裤', '子', '裙', '装', '制', '衬', '衫', '时', '袜', '披',
      '牛', '仔', '兜', '合', '身', '鞋', '戒', '指', '帽', '眼', '镜', '手', '套', '项', '链', '表',
      '耳', '环', '围', '巾', '珍', '珠', '皮', '伞',
    ],
  },
  {
    id: 'vivienda',
    title: 'Vivienda',
    glyph: '房',
    kind: 'subtopic',
    parentId: 'casa',
    characters: [
      '家', '住', '门', '公', '寓', '厨', '房', '屋', '子', '窗', '户', '卧', '室', '冰', '箱', '隔',
      '壁', '车', '库', '装', '饰', '卫', '生', '间', '居', '别', '墅', '宿', '舍', '床', '单', '阳',
      '台', '帘', '空', '调', '宅', '元', '水', '龙', '头', '简', '陋', '走', '廊', '角', '落', '客',
      '厅', '教', '健', '身',
    ],
  },
  {
    id: 'muebles',
    title: 'Muebles',
    glyph: '桌',
    kind: 'subtopic',
    parentId: 'casa',
    characters: [
      '桌', '子', '椅', '沙', '发', '座', '位', '地', '毯', '枕', '头', '家', '具', '抽', '屉', '柜',
      '台', '书', '架',
    ],
  },
  {
    id: 'rutina',
    title: 'Rutina',
    glyph: '洗',
    kind: 'subtopic',
    parentId: 'casa',
    characters: [
      '起', '来', '坐', '醒', '休', '息', '睡', '觉', '搬', '习', '惯', '躺', '床', '歇', '晒', '日',
      '常', '迈', '忙', '碌', '伺', '候', '奔', '波', '家', '作', '冲', '收', '拾', '擦', '清', '理',
      '整', '打', '扫', '刷', '除', '洁', '铺', '垃', '圾', '桶', '务', '洗', '衣', '机', '熨', '晾',
      '礼', '物', '钥', '包', '锁', '镜', '子', '证', '件', '随', '身', '伞', '袱', '被', '扇', '用',
      '品', '化', '妆', '肥', '皂', '牙', '膏',
    ],
  },
  {
    id: 'transporte',
    title: 'Viajes y transporte',
    glyph: '车',
    kind: 'theme',
    characters: ['车', '飞', '坐', '开', '路', '站', '船', '骑', '辆', '运', '票', '街', '机'],
  },
  {
    id: 'direcciones',
    title: 'Direcciones',
    glyph: '东',
    kind: 'subtopic',
    parentId: 'transporte',
    characters: [
      '上', '过', '这', '儿', '地', '方', '向', '去', '往', '后', '面', '外', '附', '近', '位', '置',
      '西', '朝', '前', '旁', '边', '周', '围', '中', '间', '东', '图', '左', '右', '南', '出', '口',
      '绕', '对', '迷', '路', '失', '弯', '于', '北', '导', '航', '指', '针', '跟', '拐', '岔', '迎',
      '纵', '横', '就', '下', '里',
    ],
  },
  {
    id: 'lugares',
    title: 'Lugares',
    glyph: '国',
    kind: 'subtopic',
    parentId: 'transporte',
    characters: [
      '寺', '庙', '长', '城', '地', '址', '街', '道', '巷', '国', '市', '京', '店', '院', '馆', '校',
      '园', '站', '路', '房',
    ],
  },
  {
    id: 'vehiculos',
    title: 'Vehículos',
    glyph: '车',
    kind: 'subtopic',
    parentId: 'transporte',
    characters: [
      '坐', '卡', '车', '出', '租', '骑', '乘', '救', '护', '自', '行', '轮', '胎', '摩', '托', '舱',
      '高', '速', '刹', '运', '输', '奔', '驰', '颠', '簸', '务', '员', '船', '飞', '机', '场', '航',
      '班', '空', '降', '落', '起', '登', '牌', '码', '头', '陆', '港', '口', '划', '桨', '舟', '湾',
      '停', '泊', '梢', '站', '地', '铁', '轨', '道', '火', '厢', '路', '交', '通', '驾', '驶', '加',
      '油', '堵', '峰', '畅',
    ],
  },
  {
    id: 'turismo',
    title: 'Turismo',
    glyph: '游',
    kind: 'subtopic',
    parentId: 'transporte',
    characters: [
      '出', '发', '到', '达', '一', '路', '护', '照', '穿', '越', '参', '观', '旅', '游', '抵', '差',
      '签', '证', '动', '身', '向', '导', '光', '行', '李', '箱', '启', '程', '长', '途', '奔', '波',
      '览', '迁', '徙', '往', '返', '滞', '留', '托', '运', '宾', '馆',
    ],
  },
  {
    id: 'compras',
    title: 'Compras y dinero',
    glyph: '钱',
    kind: 'theme',
    characters: ['钱', '买', '卖', '块', '贵', '元', '租', '店'],
  },
  {
    id: 'tiendas',
    title: 'Tiendas',
    glyph: '店',
    kind: 'subtopic',
    parentId: 'compras',
    characters: [
      '买', '退', '商', '店', '购', '物', '便', '宜', '超', '市', '逛', '收', '据', '预', '订', '讨',
      '价', '还', '打', '折', '优', '惠', '结', '账', '美', '廉',
    ],
  },
  {
    id: 'dinero',
    title: 'Dinero',
    glyph: '钱',
    kind: 'subtopic',
    parentId: 'compras',
    characters: [
      '钱', '分', '毛', '赚', '元', '免', '费', '角', '现', '金', '贵', '财', '产', '圆', '薪', '水',
      '价', '格', '用', '工', '资', '硬', '币', '奖', '收', '入', '富', '穷', '报', '酬', '钞', '票',
      '挣', '零', '昂', '发', '节', '省', '付', '款', '救', '济', '开', '支', '货', '兑', '换', '挥',
      '霍', '押', '无', '偿', '实', '惠', '红', '包',
    ],
  },
  {
    id: 'verbos',
    title: 'Verbos',
    glyph: '做',
    kind: 'tag',
    characters: [
      '是', '在', '有', '来', '上', '说', '出', '会', '能', '作', '去', '学', '看', '开', '想', '见',
      '打', '认', '听', '住', '飞', '请', '写', '吃', '读', '买', '睡', '喝', '坐', '叫', '爱', '谢',
      '做', '租', '关', '到', '要', '得', '过', '进', '动', '知', '问', '等', '给', '走', '教', '比',
      '完', '让', '笑', '找', '考', '告', '诉', '助', '试', '送', '游', '帮', '穿', '跑', '卖', '跳',
      '玩', '洗', '唱', '懂', '踢', '休', '发', '用', '行', '成', '定', '提', '解', '变', '接', '放',
      '记', '求', '带', '办', '算', '查', '选', '跟', '留', '讲', '答', '拿', '换', '闻', '画', '遇',
      '借', '忘', '迎', '哭', '骑', '爬', '扫', '搬', '聊', '烧', '饮', '护', '练', '加',
    ],
  },
  {
    id: 'preguntas',
    title: 'Preguntas',
    glyph: '吗',
    kind: 'tag',
    characters: ['什', '么', '几', '怎', '吗', '呢', '谁', '哪', '问'],
  },
  {
    id: 'gramatica',
    title: 'Gramática',
    glyph: '的',
    kind: 'tag',
    characters: [
      '的', '了', '不', '没', '都', '也', '很', '太', '再', '吗', '呢', '吧', '着', '个', '最', '就',
      '还', '把', '被', '从', '和', '对', '们', '些', '过', '地',
    ],
  },
  {
    id: 'clasificadores',
    title: 'Clasificadores',
    glyph: '个',
    kind: 'tag',
    characters: [
      '个', '只', '条', '张', '本', '杯', '件', '辆', '双', '位', '口', '头', '匹', '棵', '支', '台',
      '场', '次', '遍', '层', '段', '节', '份', '把', '间', '座', '栋', '篇', '页', '首', '封', '幅',
      '片', '块', '顿', '趟', '朵', '套', '副', '艘', '册', '枚', '颗', '粒', '顶', '根', '项', '所',
      '届', '枝', '株', '串', '幢', '番', '堆', '批', '滴', '些', '点', '回', '包', '袋', '瓶', '盘',
      '碗', '扇', '卷', '壶', '盒', '箱', '架', '列', '部',
    ],
  },
  {
    id: 'numeros',
    title: 'Números',
    glyph: '一',
    kind: 'tag',
    characters: [
      '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '两', '百', '千', '万', '零', '半',
      '双', '第',
    ],
  },
  {
    id: 'colores',
    title: 'Colores',
    glyph: '色',
    kind: 'tag',
    characters: ['色', '白', '红', '黑', '黄', '绿', '蓝', '颜'],
  },
  {
    id: 'tiempo',
    title: 'Tiempo y fechas',
    glyph: '时',
    kind: 'theme',
    listed: false,
    characters: [
      '时', '年', '月', '日', '今', '昨', '早', '晚', '午', '钟', '点', '周', '星', '期', '候', '春',
      '夏', '秋', '冬', '季', '分',
    ],
  },
  {
    id: 'escuela',
    title: 'Estudio',
    glyph: '学',
    kind: 'theme',
    listed: false,
    characters: [
      '学', '校', '师', '书', '写', '读', '习', '课', '考', '班', '笔', '纸', '铅', '词', '句', '问',
      '答', '教', '练', '识',
    ],
  },
  {
    id: 'trabajos',
    title: 'Trabajo',
    glyph: '工',
    kind: 'theme',
    listed: false,
    characters: [
      '工', '作', '做', '职', '业', '班', '干', '劳', '师', '医', '员', '教', '警', '士', '护', '厨',
      '农', '商', '兵', '军', '官', '公', '司', '办', '企', '厂', '店', '局', '聘', '雇', '招', '退',
      '休', '辞', '服', '务', '经', '理', '记', '者', '导', '演', '律', '程', '计', '秘', '书', '售',
      '长', '总', '薪', '资',
    ],
  },
  {
    id: 'cuerpo',
    title: 'Cuerpo y salud',
    glyph: '身',
    kind: 'theme',
    listed: false,
    characters: [
      '身', '头', '脸', '眼', '睛', '目', '耳', '鼻', '口', '嘴', '牙', '手', '脚', '足', '腿', '心',
      '脑',
    ],
  },
  {
    id: 'animales',
    title: 'Animales',
    glyph: '狗',
    kind: 'theme',
    listed: false,
    characters: ['狗', '猫', '鸟', '鱼', '马', '牛', '羊', '鸡', '熊'],
  },
  {
    id: 'naturaleza',
    title: 'Naturaleza y animales',
    glyph: '天',
    kind: 'theme',
    listed: false,
    characters: [
      '天', '雨', '雪', '风', '水', '火', '山', '河', '树', '花', '草', '鸟', '冰', '热', '冷', '月',
      '阴', '晴', '星',
    ],
  },
];

const topicTitlesByChar = new Map<string, string[]>();
for (const topic of topics) {
  for (const character of topic.characters) {
    const titles = topicTitlesByChar.get(character) ?? [];
    if (!titles.includes(topic.title)) titles.push(topic.title);
    topicTitlesByChar.set(character, titles);
  }
}

/** Topic names (Temas) this character appears in, sorted for display. */
export const topicTitlesForCharacter = (character: string): string[] => {
  const titles = topicTitlesByChar.get(character) ?? [];
  return [...titles].sort((a, b) => a.localeCompare(b, 'es'));
};

export const topicById = (id: string): Topic | undefined => topics.find((topic) => topic.id === id);

/** Theme and its subtopics, so filtering "Comida y bebida" includes Alimentos, Bebidas… */
export const topicScope = (topicId: string): string[] => {
  const topic = topicById(topicId);
  if (!topic) return [topicId];
  if (topic.kind !== 'theme') return [topicId];
  return [topicId, ...topics.filter((row) => row.parentId === topicId).map((row) => row.id)];
};

export const listedThemes = (): Topic[] =>
  topics.filter((topic) => topic.kind === 'theme' && topic.listed !== false);

export const topicTags = (): Topic[] => topics.filter((topic) => topic.kind === 'tag');

export const subtopicsOf = (themeId: string): Topic[] =>
  topics.filter((topic) => topic.kind === 'subtopic' && topic.parentId === themeId);

/** Characters the topic lists that are not on this device, and the levels they belong to. */
export const topicGap = (id: string, installed: HSKCharacter[]): { missing: number; levels: HskLevel[] } => {
  const topic = topicById(id);
  if (!topic) return { missing: 0, levels: [] };
  const have = new Set(installed.map((char) => char.character));
  const levels = new Set<HskLevel>();
  let missing = 0;
  const glyphs = topic.kind === 'theme'
    ? [...new Set(topicScope(id).flatMap((scopeId) => topicById(scopeId)?.characters ?? []))]
    : topic.characters;
  for (const char of glyphs) {
    if (have.has(char)) continue;
    missing += 1;
    const level = characterLevel(char);
    if (level) levels.add(level);
  }
  return { missing, levels: [...levels].sort((a, b) => a - b) };
};
