import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMeaning } from './word-senses.mjs';

test('a tag covers the uses after it and notes leave the text', () => {
  assert.deepEqual(parseMeaning('(verbo) conectar; unir; (preposición) incluso (usado con 都; también 也)'), [
    { pos: 'verbo', text: 'conectar' },
    { pos: 'verbo', text: 'unir' },
    { pos: 'preposición', text: 'incluso', note: 'usado con 都; también 也' },
  ]);
});

test('a register tag becomes a note and an untagged meaning keeps no part of speech', () => {
  assert.deepEqual(parseMeaning('(figurado) cambiar de rumbo'), [{ text: 'cambiar de rumbo', note: 'figurado' }]);
  assert.deepEqual(parseMeaning('comparar; más que'), [{ text: 'comparar' }, { text: 'más que' }]);
});

test('a tag naming a part of speech with a note keeps both', () => {
  assert.deepEqual(parseMeaning('(clasif. vehículos) unidad'), [{ pos: 'clasificador', text: 'unidad', note: 'vehículos' }]);
  assert.deepEqual(parseMeaning('(adverbio, usado en preguntas para énfasis) en realidad'), [{ pos: 'adverbio', text: 'en realidad', note: 'usado en preguntas para énfasis' }]);
});
