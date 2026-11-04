// Adds new vocabulary ids to src/data/vocabulary/published-ids.json. Saved progress is keyed by
// these ids, so the script only ever appends: if a published id left the catalog it stops instead
// of dropping it, and the fix is to restore the id, not to regenerate the file.
// Usage: npm run published-ids
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'src/data/vocabulary');
const outPath = join(dataDir, 'published-ids.json');
const LEVELS = [1, 2, 3, 4, 5, 6];

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const catalog = new Set(LEVELS.flatMap((level) => readJson(join(dataDir, `hsk${level}.json`)).map((entry) => entry.id)));
const published = existsSync(outPath) ? readJson(outPath) : [];

const missing = published.filter((id) => !catalog.has(id));
if (missing.length) {
  console.error(`These published ids are gone from the catalog, and progress saved under them would be orphaned:\n${missing.join('\n')}`);
  console.error('Restore them in src/data/vocabulary/hsk*.json instead of regenerating this file.');
  process.exit(1);
}

const ids = [...new Set([...published, ...catalog])].sort();
writeFileSync(outPath, `${JSON.stringify(ids, null, 2)}\n`, 'utf8');
console.log(`published-ids: ${ids.length} ids, ${ids.length - published.length} new`);
