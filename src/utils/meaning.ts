import { HSKCharacter } from '../types';

const senses = (definition: string) =>
  definition
    .split(/[;；]/)
    .map((sense) => sense.trim())
    .filter(Boolean);

/** The short meaning to lead with: the curated gloss, or the first dictionary sense. */
export const mainMeaning = (char: HSKCharacter): string =>
  char.gloss ?? senses(char.definition)[0] ?? '';

const fold = (text: string) => text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

/**
 * The Spanish a learner should read. A gloss that is only the pinyin, or that
 * is written in Chinese, gives way to the example. A gloss with its own words
 * stays, even when it starts with the syllable ("de (posesivo)" is not "mío").
 */
export const spokenMeaning = (char: HSKCharacter): string => {
  const gloss = mainMeaning(char);
  const example = char.example?.es;
  const head = gloss.split(/[\s;(（]/)[0] ?? '';
  const rest = gloss.slice(head.length).replace(/[()（）\s.;,]/g, '');
  const syllable = char.pinyin.split(/[\s,;/]+/)[0] ?? '';
  const onlySound = head.length > 0 && fold(head) === fold(syllable) && rest.length === 0;
  if (example && (onlySound || /\p{Script=Han}/u.test(gloss))) return example;
  return gloss;
};

/** The remaining dictionary senses, for a quieter second line. */
export const otherMeanings = (char: HSKCharacter): string => {
  const all = senses(char.definition);
  return (char.gloss ? all : all.slice(1)).join(' · ');
};
