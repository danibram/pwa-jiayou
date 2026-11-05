// Apply curated Spanish glosses, pinyin fixes and topic tags to the built vocabulary JSON.
// Idempotent: run it after build-vocabulary.mjs and localize-vocabulary.mjs.
// Usage: node scripts/fix-vocabulary-data.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wordId } from './syllable-keys.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'apps/web/src/data/vocabulary');
const curatedDir = join(dataDir, 'curated');
const LEVELS = [1, 2, 3, 4, 5, 6];

// Proper nouns keep a capital on the first syllable. Everything else is lowercase.
export const PROPER_NOUNS = new Set([
  '北京', '中国', '长城', '长江', '亚洲', '欧洲', '端午节', '元宵节', '重阳节', '国庆节', '黄河', '上海',
]);

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

// Full Spanish gloss sheets: one line per word, `simplified<TAB>meaning[<TAB>pinyin]`.
const readGlossSheets = (level) => {
  const glosses = new Map();
  const pattern = new RegExp(`^hsk${level}-es-\\d+\\.tsv$`);
  for (const file of readdirSync(curatedDir).filter((name) => pattern.test(name)).sort()) {
    for (const line of readFileSync(join(curatedDir, file), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const [simplified, meaning, pinyin] = line.split('\t');
      if (!glosses.has(simplified)) glosses.set(simplified, { meaning, pinyin });
    }
  }
  return glosses;
};
const glossSheets = new Map(LEVELS.map((level) => [level, readGlossSheets(level)]));

const lowerFixes = readJson(join(curatedDir, 'hsk1-5-fixes-es.json'));
// Editorial pass: the most natural Spanish first sense, applied after every other source.
const editorial = readJson(join(curatedDir, 'gloss-editorial-es.json'));

// Dictionary notes that must never reach a card: loanword tags, antonym notes, hanzi in the gloss,
// a sense repeated in parentheses and brackets left open by a cut.
const cleanGloss = (meaning) => {
  let text = meaning
    .replace(/\s*\((préstamo|palabra prestada)\)\s*/gi, ' ')
    .replace(/\s*\([^)]*[\u4e00-\u9fff][^)]*\)/g, '')
    .replace(/;\s*variante de [\u4e00-\u9fff]+/g, '')
    .trim();
  const repeated = text.match(/^(.+?)\s*\((.+?)\)$/);
  if (repeated && repeated[1].trim().toLowerCase() === repeated[2].trim().toLowerCase()) text = repeated[1].trim();
  const opens = (text.match(/\(/g) ?? []).length;
  const closes = (text.match(/\)/g) ?? []).length;
  if (closes > opens) text = text.replace(/\)(?=[^)]*$)/, '');
  if (opens > closes) text = text.replace(/\((?=[^(]*$)/, '');
  return text.replace(/\s{2,}/g, ' ').trim();
};
const handTopics = readJson(join(curatedDir, 'topics-hsk1-3.json'));
const topicsByWord = new Map();
for (const [topicId, words] of Object.entries(handTopics)) {
  for (const word of words) topicsByWord.set(word, [...(topicsByWord.get(word) ?? []), topicId]);
}

// Character lists per topic, read from src/data/topics.ts.
const topicsSource = readFileSync(join(root, 'apps/web/src/data/topics.ts'), 'utf8');
const charTopics = new Map();
for (const match of topicsSource.matchAll(/id: '([a-z]+)'[\s\S]*?characters: \[([\s\S]*?)\]/g)) {
  for (const char of match[2].match(/'([^']+)'/g) ?? []) {
    const c = char.slice(1, -1);
    charTopics.set(c, [...(charTopics.get(c) ?? []), match[1]]);
  }
}
// Concrete topics where a one-character word means what its character means.
const CHAR_TOPICS = new Set(['numeros', 'colores', 'animales', 'cuerpo', 'ropa', 'comida', 'naturaleza', 'familia', 'direcciones', 'transporte', 'clasificadores']);

// Upper-level words tagged by their first Spanish sense.
const MEANING_TOPICS = [
  ['colores', /^(rojo|azul|verde|amarillo|negro|blanco|gris|marrón|morado|rosa|naranja|púrpura)\b/],
  ['animales', /^(perro|gato|caballo|vaca|cerdo|oveja|tigre|león|mono|pájaro|pato|pollo|gallina|serpiente|ratón|conejo|oso|lobo|insecto|mariposa|abeja|mosquito|ballena|delfín|elefante|panda|pez|camello)\b/],
  ['cuerpo', /^(cabeza|cara|ojo|oreja|nariz|boca|diente|lengua|cuello|hombro|brazo|mano|dedo|uña|pierna|rodilla|pie|espalda|pecho|corazón|estómago|piel|hueso|sangre|garganta|labio|mejilla|cerebro|pelo|ceja|músculo|cintura)\b/],
  ['ropa', /^(camisa|chaqueta|abrigo|pantalones|falda|vestido|zapato|calcetín|sombrero|gorra|bufanda|guantes|cinturón|corbata|bolso|gafas|ropa|plumífero|botón|qipao)\b/],
  ['comida', /^(arroz|fideos|pan|carne|pescado|huevo|leche|té|café|cerveza|vino|zumo|fruta|verdura|sopa|azúcar|sal|pimienta|vinagre|aceite|salsa|pastel|galleta|chocolate|caramelo|manzana|plátano|naranja|uva|sandía|pera|melocotón|limón|fresa|tomate|patata|zanahoria|cebolla|ajo|tofu|empanadilla|dulce|salado|picante|amargo|ácido|condimento|manjar|papilla|comida)\b/],
  ['naturaleza', /^(montaña|río|lago|mar|océano|isla|bosque|árbol|flor|hierba|hoja|tallo|piedra|roca|arena|cielo|nube|lluvia|nieve|viento|tormenta|tifón|trueno|rayo|sol|luna|estrella|tierra|clima|granizo|cascada|cueva|cordillera|llanura|desierto|pantano|arroyo|ola|colinas|cañón)\b/],
  ['transporte', /^(coche|autobús|tren|avión|barco|bicicleta|moto|metro|taxi|camión|aeropuerto|estación|puerto|neumático|billete)\b/],
  ['trabajos', /^(médico|enfermero|abogado|ingeniero|policía|bombero|cocinero|camarero|vendedor|periodista|actor|cantante|director|secretario|gerente|jefe|empleado|obrero|campesino|soldado|piloto|conductor|sastre|pescador|detective|árbitro|asistente|ayudante)\b/],
  ['clasificadores', /clasificador|clasif\./],
];

const normalizePinyin = (simplified, pinyin) => {
  const cleaned = pinyin.replace(/u:/g, 'ü').replace(/\s+/g, ' ').trim();
  const lower = cleaned.toLowerCase();
  if (!PROPER_NOUNS.has(simplified)) return lower;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

const report = { glosses: 0, pinyin: 0, topicsAdded: 0 };

// Core words the HSK 2.0 lists leave out (你好). Appended once; sourceId marks them as ours.
const extraWords = readJson(join(curatedDir, 'extra-words-es.json'));

for (const level of LEVELS) {
  const path = join(dataDir, `hsk${level}.json`);
  const entries = readJson(path);
  for (const extra of extraWords[String(level)] ?? []) {
    if (entries.some((entry) => entry.simplified === extra.simplified)) continue;
    entries.push({ id: wordId(extra.simplified, extra.pinyin), ...extra, level, characters: [...extra.simplified], sourceId: 'curated-extra' });
  }
  for (const entry of entries) {
    const before = { meaning: entry.meaning, pinyin: entry.pinyin };
    const fix = glossSheets.get(level).get(entry.simplified) ?? lowerFixes[String(level)]?.[entry.simplified];
    if (fix?.meaning) entry.meaning = fix.meaning;
    if (fix?.pinyin) entry.pinyin = fix.pinyin;
    entry.meaning = editorial[String(level)]?.[entry.simplified] ?? cleanGloss(entry.meaning);
    entry.pinyin = normalizePinyin(entry.simplified, entry.pinyin);
    // Id last: the reading may have changed above.
    entry.id = wordId(entry.simplified, entry.pinyin);
    if (entry.meaning !== before.meaning) report.glosses += 1;
    if (entry.pinyin !== before.pinyin) report.pinyin += 1;

    const topics = new Set(entry.topicIds);
    const size = topics.size;
    if (level <= 3) for (const id of topicsByWord.get(entry.simplified) ?? []) topics.add(id);
    if (entry.simplified.length === 1) {
      for (const id of charTopics.get(entry.simplified) ?? []) if (CHAR_TOPICS.has(id)) topics.add(id);
    }
    if (level >= 4) {
      const gloss = entry.meaning.toLowerCase();
      const sense = gloss.split(';')[0].trim();
      for (const [id, pattern] of MEANING_TOPICS) {
        // Clasificadores often sit after another sense ("lugar; clasificador de…").
        if (pattern.test(id === 'clasificadores' ? gloss : sense)) topics.add(id);
      }
    }
    entry.topicIds = [...topics];
    report.topicsAdded += topics.size - size;
  }
  writeFileSync(path, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
}

console.log(`Glosas cambiadas: ${report.glosses}. Pinyin cambiado: ${report.pinyin}. Temas añadidos: ${report.topicsAdded}.`);
