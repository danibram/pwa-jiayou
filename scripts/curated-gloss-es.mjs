// Hand-curated Spanish glosses when MT APIs fail or definitions are empty.
// Merge into sidecars via: node scripts/apply-curated-glosses.mjs --level=5

/** @type {Record<string, Record<string, { gloss: string, definition?: string, example?: { word: string, pinyin: string, es: string } }>>} */
export const CURATED_BY_LEVEL = {
  5: {
    尺: {
      gloss: 'regla; medida',
      definition: 'regla; unidad de medida',
      example: { word: '公尺', pinyin: 'gōng chǐ', es: 'metro' },
    },
    姑: {
      gloss: 'tía; monja',
      definition: 'tía; monja',
      example: { word: '姑娘', pinyin: 'gū niang', es: 'joven; chica' },
    },
    舅: {
      gloss: 'tío (materno)',
      definition: 'tío materno',
      example: { word: '舅舅', pinyin: 'jiù jiu', es: 'tío materno' },
    },
    矩: {
      gloss: 'regla; norma',
      definition: 'escuadra; norma; regla',
      example: { word: '规矩', pinyin: 'guī ju', es: 'normas; modales' },
    },
    令: {
      gloss: 'orden; mandar',
      definition: 'orden; mandato; hacer',
      example: { word: '命令', pinyin: 'mìng lìng', es: 'orden; mandato' },
    },
    姿: {
      gloss: 'figura; aspecto',
      definition: 'figura; porte; aspecto',
      example: { word: '姿势', pinyin: 'zī shì', es: 'postura' },
    },
    骤: {
      gloss: 'paso; de repente',
      definition: 'paso; galopar; de repente',
      example: { word: '骤然', pinyin: 'zhòu rán', es: 'de repente' },
    },
    猪: {
      gloss: 'cerdo',
      definition: 'cerdo; jabalí',
      example: { word: '猪肉', pinyin: 'zhū ròu', es: 'carne de cerdo' },
    },
    竹: {
      gloss: 'bambú',
      definition: 'bambú; flauta de bambú',
      example: { word: '竹子', pinyin: 'zhú zi', es: 'bambú' },
    },
    逐: {
      gloss: 'perseguir; expulsar',
      definition: 'perseguir; expulsar; uno a uno',
      example: { word: '逐渐', pinyin: 'zhú jiàn', es: 'poco a poco' },
    },
    煮: {
      gloss: 'cocer; hervir',
      definition: 'cocer; hervir',
      example: { word: '煮饭', pinyin: 'zhǔ fàn', es: 'cocinar arroz' },
    },
    筑: {
      gloss: 'construir',
      definition: 'construir; edificar',
      example: { word: '建筑', pinyin: 'jiàn zhù', es: 'edificio' },
    },
    抓: {
      gloss: 'agarrar; arañar',
      definition: 'agarrar; capturar; arañar',
      example: { word: '抓住', pinyin: 'zhuā zhù', es: 'agarrar' },
    },
    装: {
      gloss: 'vestir; embalar',
      definition: 'vestir; disfrazar; embalar',
      example: { word: '服装', pinyin: 'fú zhuāng', es: 'ropa' },
    },
    状: {
      gloss: 'forma; estado',
      definition: 'forma; aspecto; documento',
      example: { word: '状况', pinyin: 'zhuàng kuàng', es: 'situación' },
    },
    撞: {
      gloss: 'chocar; golpear',
      definition: 'chocar; golpear',
      example: { word: '碰撞', pinyin: 'pèng zhuàng', es: 'colisión' },
    },
    追: {
      gloss: 'perseguir',
      definition: 'perseguir; ir tras',
      example: { word: '追求', pinyin: 'zhuī qiú', es: 'buscar; aspirar a' },
    },
    咨: {
      gloss: 'consultar',
      definition: 'consultar; pedir consejo',
      example: { word: '咨询', pinyin: 'zī xún', es: 'consultar' },
    },
    紫: {
      gloss: 'púrpura; violeta',
      definition: 'púrpura; violeta',
      example: { word: '紫色', pinyin: 'zǐ sè', es: 'color púrpura' },
    },
    综: {
      gloss: 'sintetizar; combinar',
      definition: 'combinar; sintetizar',
      example: { word: '综合', pinyin: 'zōng hé', es: 'sintetizar' },
    },
    阻: {
      gloss: 'impedir; obstruir',
      definition: 'impedir; obstruir; oponerse',
      example: { word: '阻止', pinyin: 'zǔ zhǐ', es: 'impedir' },
    },
    组: {
      gloss: 'grupo; formar',
      definition: 'grupo; sección; formar',
      example: { word: '组织', pinyin: 'zǔ zhī', es: 'organización' },
    },
    醉: {
      gloss: 'borracho; ebrio',
      definition: 'borracho; ebrio; embriagado',
      example: { word: '喝醉', pinyin: 'hē zuì', es: 'emborracharse' },
    },
    遵: {
      gloss: 'obedecer; cumplir',
      definition: 'obedecer; cumplir; respetar',
      example: { word: '遵守', pinyin: 'zūn shǒu', es: 'cumplir; respetar' },
    },
  },
};

export const getCurated = (level, character) => CURATED_BY_LEVEL[level]?.[character] ?? null;
