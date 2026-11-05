import { characterContentId } from '@jiayou/content';
import type { ItemId, LearningItem } from './types.ts';

// An item id is its kind and its content id: `word-meaning:<published word id>` or
// `character-writing:char-<code point in hex>`. These helpers are the only place that spells it.

export type ItemKind = LearningItem['kind'];

const WORD_PREFIX = 'word-meaning:';
const CHARACTER_PREFIX = 'character-writing:char-';

export const wordItemId = (wordId: string): ItemId => `word-meaning:${wordId}`;

/** `character-writing:char-<hex>`, the item a character's writing schedule lives on. */
export const characterItemId = (char: string): ItemId => `character-writing:${characterContentId(char)}` as ItemId;

export const itemKind = (itemId: ItemId): ItemKind => (itemId.startsWith(WORD_PREFIX) ? 'word-meaning' : 'character-writing');

/** The published word id an item names, or null when the item is a character's. */
export const wordIdOf = (itemId: string): string | null => (itemId.startsWith(WORD_PREFIX) ? itemId.slice(WORD_PREFIX.length) : null);

/** The character an item id names, or null when the id is not a character's. */
export const characterOf = (itemId: string): string | null => {
  if (!itemId.startsWith(CHARACTER_PREFIX)) return null;
  const code = Number.parseInt(itemId.slice(CHARACTER_PREFIX.length), 16);
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : null;
};
