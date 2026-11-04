// The app ships HSK 1 words only; the other levels download with their pack. Tests that read the whole
// catalog import it from here, which installs every level from the source lists first.
import { catalogWords, installLevelWords, levelWords, vocabularyLevels, type CatalogEntry } from '../../src/data/vocabulary';
import type { HskLevel } from '../../src/types';
import hsk2 from '../../src/data/vocabulary/hsk2.json';
import hsk3 from '../../src/data/vocabulary/hsk3.json';
import hsk4 from '../../src/data/vocabulary/hsk4.json';
import hsk5 from '../../src/data/vocabulary/hsk5.json';
import hsk6 from '../../src/data/vocabulary/hsk6.json';

export const levelSources: Record<Exclude<HskLevel, 1>, unknown> = { 2: hsk2, 3: hsk3, 4: hsk4, 5: hsk5, 6: hsk6 };

/** Put every HSK level on the device, as if the learner had downloaded them all. */
export const installAllLevelWords = () => {
  for (const [level, raw] of Object.entries(levelSources)) installLevelWords(Number(level) as HskLevel, raw);
};

installAllLevelWords();

export const vocabulary: CatalogEntry[] = catalogWords();
export const vocabularyByLevel = Object.fromEntries(vocabularyLevels.map((level) => [level, levelWords(level)])) as Record<HskLevel, CatalogEntry[]>;
