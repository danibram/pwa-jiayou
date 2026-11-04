/**
 * Jiāyóu theme taxonomy and  list → subtopic mapping.
 * Themes are situations; tags (verbos, preguntas…) combine with any theme.
 * Existing topic ids stay: the content model forbids deleting published ids.
 */

/** @typedef {'theme' | 'subtopic' | 'tag'} TopicKind */

/**
 *  thematic list slug → our subtopic id (and its parent theme).
 * One  list fills one subtopic; a word in several lists gets several topicIds.
 */
export const TONG_LIST_MAP = {
  // Comida y bebida
  'food-general': { themeId: 'comida', subtopicId: 'alimentos', title: 'Alimentos', glyph: '饭' },
  fruits: { themeId: 'comida', subtopicId: 'alimentos', title: 'Alimentos', glyph: '饭' },
  'grains-staples': { themeId: 'comida', subtopicId: 'alimentos', title: 'Alimentos', glyph: '饭' },
  'meat-seafood': { themeId: 'comida', subtopicId: 'alimentos', title: 'Alimentos', glyph: '饭' },
  vegetables: { themeId: 'comida', subtopicId: 'alimentos', title: 'Alimentos', glyph: '饭' },
  beverages: { themeId: 'comida', subtopicId: 'bebidas', title: 'Bebidas', glyph: '茶' },
  'alcohol-tobacco': { themeId: 'comida', subtopicId: 'bebidas', title: 'Bebidas', glyph: '茶' },
  'flavors-seasonings': { themeId: 'comida', subtopicId: 'sabores', title: 'Sabores', glyph: '甜' },
  'cooking-methods': { themeId: 'comida', subtopicId: 'cocina', title: 'Cocina', glyph: '烧' },
  kitchenware: { themeId: 'comida', subtopicId: 'cocina', title: 'Cocina', glyph: '烧' },
  'dining-restaurant': { themeId: 'comida', subtopicId: 'restaurante', title: 'Restaurante', glyph: '馆' },

  // Personas y relaciones
  'family-kinship': { themeId: 'personas', subtopicId: 'familia', title: 'Familia', glyph: '家' },
  'friends-social': { themeId: 'personas', subtopicId: 'amigos', title: 'Amigos', glyph: '友' },
  'greetings-politeness': { themeId: 'personas', subtopicId: 'saludos', title: 'Saludos', glyph: '谢' },
  'emotions-feelings': { themeId: 'personas', subtopicId: 'sentimientos', title: 'Sentimientos', glyph: '爱' },
  'people-general': { themeId: 'personas', subtopicId: 'gente', title: 'Gente', glyph: '名' },
  'romance-marriage': { themeId: 'personas', subtopicId: 'familia', title: 'Familia', glyph: '家' },
  'life-stages': { themeId: 'personas', subtopicId: 'gente', title: 'Gente', glyph: '名' },

  // Casa y rutina
  'home-housing': { themeId: 'casa', subtopicId: 'vivienda', title: 'Vivienda', glyph: '房' },
  'rooms-spaces': { themeId: 'casa', subtopicId: 'vivienda', title: 'Vivienda', glyph: '房' },
  furniture: { themeId: 'casa', subtopicId: 'muebles', title: 'Muebles', glyph: '桌' },
  'clothing-apparel': { themeId: 'casa', subtopicId: 'ropa', title: 'Ropa', glyph: '衣' },
  'footwear-accessories': { themeId: 'casa', subtopicId: 'ropa', title: 'Ropa', glyph: '衣' },
  'daily-routine': { themeId: 'casa', subtopicId: 'rutina', title: 'Rutina', glyph: '洗' },
  'cleaning-chores': { themeId: 'casa', subtopicId: 'rutina', title: 'Rutina', glyph: '洗' },
  'personal-items': { themeId: 'casa', subtopicId: 'rutina', title: 'Rutina', glyph: '洗' },
  'toiletries-cosmetics': { themeId: 'casa', subtopicId: 'rutina', title: 'Rutina', glyph: '洗' },

  // Viajes y transporte
  'transport-vehicles': { themeId: 'transporte', subtopicId: 'vehiculos', title: 'Vehículos', glyph: '车' },
  'air-travel': { themeId: 'transporte', subtopicId: 'vehiculos', title: 'Vehículos', glyph: '车' },
  'sea-water-travel': { themeId: 'transporte', subtopicId: 'vehiculos', title: 'Vehículos', glyph: '车' },
  'rail-transit': { themeId: 'transporte', subtopicId: 'vehiculos', title: 'Vehículos', glyph: '车' },
  'road-traffic': { themeId: 'transporte', subtopicId: 'vehiculos', title: 'Vehículos', glyph: '车' },
  'directions-navigation': { themeId: 'transporte', subtopicId: 'direcciones', title: 'Direcciones', glyph: '东' },
  'travel-tourism': { themeId: 'transporte', subtopicId: 'turismo', title: 'Turismo', glyph: '游' },
  'accommodation-lodging': { themeId: 'transporte', subtopicId: 'turismo', title: 'Turismo', glyph: '游' },
  'landmarks-attractions': { themeId: 'transporte', subtopicId: 'lugares', title: 'Lugares', glyph: '国' },
  'streets-addresses': { themeId: 'transporte', subtopicId: 'lugares', title: 'Lugares', glyph: '国' },

  // Compras y dinero
  'shopping-errands': { themeId: 'compras', subtopicId: 'tiendas', title: 'Tiendas', glyph: '店' },
  'money-currency': { themeId: 'compras', subtopicId: 'dinero', title: 'Dinero', glyph: '钱' },
};

/** Theme ids that show in Temas for the first pass. */
export const VISIBLE_THEME_IDS = ['comida', 'personas', 'casa', 'transporte', 'compras'];

/** Combinable tags: not situations, filter alongside any theme. */
export const TAG_IDS = ['verbos', 'preguntas', 'gramatica', 'clasificadores', 'numeros', 'colores'];

/** Deferred situation themes (kept as ids, hidden from Temas until filled). */
export const DEFERRED_THEME_IDS = ['tiempo', 'escuela', 'trabajos', 'cuerpo', 'animales', 'naturaleza'];

/** Title / glyph overrides when elevating an existing topic to a theme. */
export const THEME_META = {
  comida: { title: 'Comida y bebida', glyph: '吃' },
  personas: { title: 'Personas y relaciones', glyph: '人' },
  casa: { title: 'Casa y rutina', glyph: '房' },
  transporte: { title: 'Viajes y transporte', glyph: '车' },
  compras: { title: 'Compras y dinero', glyph: '钱' },
  tiempo: { title: 'Tiempo y fechas', glyph: '时' },
  escuela: { title: 'Estudio', glyph: '学' },
  trabajos: { title: 'Trabajo', glyph: '工' },
  cuerpo: { title: 'Cuerpo y salud', glyph: '身' },
  animales: { title: 'Animales', glyph: '狗' },
  naturaleza: { title: 'Naturaleza y animales', glyph: '天' },
};

/** Existing flat topics that become subtopics of a parent theme. */
export const EXISTING_SUBTOPIC_PARENT = {
  familia: 'personas',
  sentimientos: 'personas',
  ropa: 'casa',
  direcciones: 'transporte',
  lugares: 'transporte',
};

/** Unique subtopics implied by TONG_LIST_MAP (id → meta). */
export function subtopicsFromMap() {
  const byId = new Map();
  for (const row of Object.values(TONG_LIST_MAP)) {
    if (!byId.has(row.subtopicId)) {
      byId.set(row.subtopicId, { id: row.subtopicId, title: row.title, glyph: row.glyph, parentId: row.themeId });
    }
  }
  return [...byId.values()];
}

export function listSlugsForThemes(themeIds = VISIBLE_THEME_IDS) {
  const wanted = new Set(themeIds);
  return [...new Set(Object.entries(TONG_LIST_MAP)
    .filter(([, row]) => wanted.has(row.themeId))
    .map(([slug]) => slug))];
}
