// Refreshes the published id registry, src/data/vocabulary/published-ids.json, from the content on disk.
// Saved progress and attempts are keyed by these ids, so the registry only grows:
// - every word in hsk1.json to hsk6.json and extra.json is "available", with the list it ships in;
// - a word retired in content/snapshot.json (retired: true) stays as "retired" and keeps its id;
// - a published id missing from both stops the script. Restore the entry or retire it, never drop it;
// - each id lists every revision the app has computed for it, and a new one is appended.
// Characters get the same treatment under "char-<hex>" ids, read from content/snapshot.json.
// Promoting a draft from the editor runs the same update; this script is for content added by other scripts.
// Those scripts must also add the words to content/snapshot.json: tests/vocabularyData.test.ts checks that
// the registry and the snapshot hold the same ids, and the next promotion would fail otherwise.
// Usage: npm run published-ids
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGISTRY_PATH, loadRevisions, registryJson, updateRegistry } from './content-publish.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const LISTS = [1, 2, 3, 4, 5, 6].map((level) => `apps/web/src/data/vocabulary/hsk${level}.json`).concat('apps/web/src/data/vocabulary/extra.json');

const snapshot = readJson('content/snapshot.json');
const catalog = LISTS.flatMap(readJson);
const retired = snapshot.vocabulary.filter((row) => row.retired);
const listedRetired = retired.filter((row) => catalog.some((word) => word.id === row.id));
if (listedRetired.length) {
  console.error(`These ids are retired in content/snapshot.json but still listed:\n${listedRetired.map((row) => row.id).join('\n')}`);
  process.exit(1);
}

const previous = readJson(REGISTRY_PATH);
let registry;
try {
  registry = updateRegistry(previous, { words: [...catalog, ...retired], characters: snapshot.characters }, await loadRevisions(root));
} catch (error) {
  console.error(error.message);
  console.error('Restore the entry in src/data/vocabulary/*.json, or retire it by setting retired: true on its row in content/snapshot.json. Do not edit the registry to make this pass.');
  process.exit(1);
}
const before = Array.isArray(previous) ? previous.length : Object.keys(previous.words).length;
const after = Object.keys(registry.words).length;
writeFileSync(join(root, REGISTRY_PATH), registryJson(registry), 'utf8');
console.log(`published-ids: ${after} words (${after - before} new), ${Object.keys(registry.characters).length} characters`);
