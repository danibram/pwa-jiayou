// Per-level stroke + audio bundles under public/packs/hskN/.
// Character JSON lists: public/packs/hskN.json (or src/data/hsk4.json for 4–6).
// Run: node scripts/build-media-packs.mjs
// Audio slices need public/audio/{f,m,c}/ first (see docs/audio.md).
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syllableKeysForRows } from './syllable-keys.mjs';
import { contentManifest } from './content-manifest.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const strokeSource = join(root, 'node_modules/hanzi-writer-data');
const VOICES = ['f', 'm', 'c'];

const listPath = (level) => {
  if (level === 1) return join(root, 'apps/web/src/data/hsk1.json');
  const pack = join(root, `apps/web/public/packs/hsk${level}.json`);
  if (existsSync(pack)) return pack;
  const data = join(root, `apps/web/src/data/hsk${level}.json`);
  if (existsSync(data)) return data;
  return null;
};

const ensureCharacterPack = (level, rows) => {
  if (level === 1) return;
  const dest = join(root, `apps/web/public/packs/hsk${level}.json`);
  writeFileSync(dest, `${JSON.stringify(rows, null, 4)}\n`, 'utf8');
};

const buildLevel = (level) => {
  const path = listPath(level);
  if (!path) {
    console.log(`HSK ${level}: skip (no list)`);
    return;
  }
  const rows = JSON.parse(readFileSync(path, 'utf8'));
  ensureCharacterPack(level, rows);

  const packRoot = join(root, `apps/web/public/packs/hsk${level}`);
  const strokeDir = join(packRoot, 'strokes');
  const audioRoot = join(packRoot, 'audio');
  mkdirSync(strokeDir, { recursive: true });

  const missingStrokes = [];
  for (const row of rows) {
    const src = join(strokeSource, `${row.character}.json`);
    const dest = join(strokeDir, `${row.character}.json`);
    if (existsSync(src)) copyFileSync(src, dest);
    else missingStrokes.push(row.character);
  }

  const wanted = syllableKeysForRows(rows);
  const globalAudio = join(root, 'apps/web/public/audio');
  // List a syllable only when the Taiwan voices exist. Chen Wang (c) is optional:
  // speech.ts falls back to the woman. Listing a missing key makes the app fetch
  // Vite’s HTML shell (200) and cache it as “mp3”, so every gap sounds the same.
  const present = wanted.filter(
    (key) =>
      existsSync(join(globalAudio, 'f', `${key}.mp3`)) &&
      existsSync(join(globalAudio, 'm', `${key}.mp3`)),
  );
  const missingKeys = wanted.filter((key) => !present.includes(key));
  let audioFiles = 0;
  for (const voice of VOICES) {
    const voiceDir = join(audioRoot, voice);
    rmSync(voiceDir, { recursive: true, force: true });
    mkdirSync(voiceDir, { recursive: true });
    for (const key of present) {
      const src = join(globalAudio, voice, `${key}.mp3`);
      if (!existsSync(src)) continue;
      copyFileSync(src, join(voiceDir, `${key}.mp3`));
      audioFiles += 1;
    }
  }

  const manifest = {
    level,
    characters: rows.length,
    strokes: { copied: rows.length - missingStrokes.length, missing: missingStrokes },
    syllables: present.length,
    audioFiles,
    missingAudio: missingKeys.length * VOICES.length,
    missingSyllables: missingKeys,
  };
  writeFileSync(join(packRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  writeFileSync(join(packRoot, 'syllables.json'), `${JSON.stringify(present, null, 2)}\n`, 'utf8');

  console.log(
    `HSK ${level}: ${manifest.strokes.copied}/${rows.length} strokes, ${present.length}/${wanted.length} syllables with audio, ${audioFiles} clips` +
      (missingStrokes.length ? `, missing strokes: ${missingStrokes.slice(0, 8).join(' ')}${missingStrokes.length > 8 ? '…' : ''}` : '') +
      (missingKeys.length ? `, ${missingKeys.length} syllables need copy-cns-audio.py` : ''),
  );
};

mkdirSync(join(root, 'apps/web/public/packs'), { recursive: true });
for (const level of [2, 3, 4, 5, 6]) buildLevel(level);
// Written last, over the files just built. Each pack's hash changes only when its own files do.
writeFileSync(join(root, 'apps/web/public/packs/content.json'), `${JSON.stringify(contentManifest(join(root, 'apps/web')), null, 2)}\n`, 'utf8');
console.log('apps/web/public/packs/content.json updated');
