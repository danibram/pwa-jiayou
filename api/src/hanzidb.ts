const BASE = 'http://hanzidb.org';

const decode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const fetchText = async (path: string, tries = 3): Promise<string | null> => {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    } catch {
      if (attempt === tries) throw new Error(`hanzidb fetch failed: ${path}`);
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  return null;
};

export const fetchCharacterPage = async (character: string) => fetchText(`/character/${encodeURIComponent(character)}`);

export const parseTraditional = (html: string): string | null => {
  const trad = html.match(/Traditional variant:<\/b> <a href="\/character\/([^"]+)">/);
  return trad ? decode(trad[1]) : null;
};

export const parseExampleFromPage = (html: string, character: string) => {
  const dict = html.match(
    /<b>Examples of words containing this character:<\/b> <a href="\/dictionary\/([^"]+)" title="([^"]+)">([^<]*)<\/a>/,
  );
  if (!dict) return null;
  const word = decode(dict[3]);
  if (!word.includes(character)) return null;
  const pinyin = decode(dict[2])
    .trim()
    .split(/\s+/)
    .map((syllable) => syllable.replace(/\d/g, ''))
    .join(' ');
  return { word, pinyin };
};
