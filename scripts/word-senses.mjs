// Turns a dictionary-style meaning ("(verbo) conectar; unir; (preposición) incluso (usado con 都)")
// into word senses: { pos, text, note }. Used to migrate the catalog and to read translation proposals.
export const WORD_POS = ['sustantivo', 'verbo', 'adjetivo', 'adverbio', 'clasificador', 'pronombre', 'numeral', 'preposición', 'conjunción', 'partícula', 'interjección', 'expresión'];

const OPEN = /[(（]/;
const CLOSE = /[)）]/;

/** Splits on ";" outside brackets, so "incluso (usado con 都; 也)" stays one use. */
export const splitUses = (text) => {
  const out = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (OPEN.test(ch)) depth++;
    if (CLOSE.test(ch)) depth = Math.max(0, depth - 1);
    if ((ch === ';' || ch === '；') && depth === 0) { out.push(current); current = ''; continue; }
    current += ch;
  }
  out.push(current);
  return out.map((use) => use.trim()).filter(Boolean);
};

/** "(clasif. vehículos)" and "(partícula modal)" name a part of speech and add a note. */
const tagPos = (tag) => {
  const t = tag.trim().toLowerCase();
  if (/^clasif(icador)?\.?(\s|$)/.test(t)) return { pos: 'clasificador', note: t.replace(/^clasif(icador)?\.?\s*/, '') };
  if (t === 'frase' || t === 'expresión') return { pos: 'expresión', note: '' };
  if (/^usado como (\S+)/.test(t)) {
    const pos = t.match(/^usado como (\S+)/)[1];
    if (WORD_POS.includes(pos)) return { pos, note: '' };
  }
  const first = t.split(/[\s,/]+/)[0];
  if (WORD_POS.includes(first)) {
    const rest = t.slice(first.length).replace(/^[\s,]+/, '');
    // "adjetivo, sustantivo" or "sustantivo/adverbio" names two: the model decides per use.
    if (WORD_POS.includes(rest.split(/[\s,/]+/)[0])) return { pos: undefined, note: '' };
    return { pos: first, note: rest };
  }
  // "literario, partícula posesiva": the register stays as a note, the part of speech is still named.
  const named = WORD_POS.find((pos) => new RegExp(`(^|[\\s,])${pos}([\\s,]|$)`).test(t));
  if (named) return { pos: named, note: t };
  return { pos: undefined, note: t };
};

const bracketed = /\s*[(（]([^)）]*)[)）]\s*/g;

/** One use of a meaning as data. Nothing is dropped except a tag that only names two parts of speech. */
export const parseUse = (raw) => {
  let body = raw.trim();
  let pos;
  const notes = [];
  const lead = body.match(/^[(（]([^)）]*)[)）]\s*/);
  if (lead) {
    const tag = tagPos(lead[1]);
    pos = tag.pos;
    if (tag.note) notes.push(tag.note);
    body = body.slice(lead[0].length);
  }
  for (const match of body.matchAll(bracketed)) notes.push(match[1].trim());
  let text = body.replace(bracketed, ' ').replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
  // A stray bracket left by the source ("mientras … disponible)") is not part of the text.
  text = text.replace(/[()（）]/g, '').trim();
  if (!text) text = raw.replace(/[()（）]/g, '').trim();
  const note = notes.filter(Boolean).join('; ');
  return { ...(pos ? { pos } : {}), text, ...(note ? { note } : {}) };
};

/** A tag such as "(verbo)" also covers the untagged uses after it, the way dictionaries write it. */
export const parseMeaning = (meaning) => {
  let carried;
  return splitUses(meaning).map(parseUse).map((sense) => {
    if (sense.pos) { carried = sense.pos; return sense; }
    return carried ? { pos: carried, ...sense } : sense;
  });
};

