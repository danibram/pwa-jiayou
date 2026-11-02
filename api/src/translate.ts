const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const firstSense = (text: string) => text.split(/[;；]/)[0]?.trim() ?? '';

export const shortGloss = (text: string) => {
  const line = firstSense(text);
  if (line.length <= 30) return line;
  const cut = line.slice(0, 30);
  const space = cut.lastIndexOf(' ');
  if (space > 18) return cut.slice(0, space);
  return `${cut.slice(0, 27)}…`;
};

export const translateEnEs = async (text: string) => {
  const chunk = text.trim().slice(0, 450);
  if (!chunk) return '';
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=es&dt=t&q=${encodeURIComponent(chunk)}`;
  await sleep(120);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`translate ${res.status}`);
  const data = (await res.json()) as [Array<[string]>, unknown];
  return data[0].map((part) => part[0]).join('').trim();
};

export const translateDefinition = async (english: string) => {
  const parts = english.split(/[;；]/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const part of parts.slice(0, 4)) {
    out.push(await translateEnEs(part));
  }
  return out.join('; ');
};
