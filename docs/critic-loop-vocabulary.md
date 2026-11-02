# Vocabulary interface review

The app ships the full HSK 2.0 exclusive word lists for levels 1–6. Character learning and its existing level packs remain available; word audio and strokes reuse those packs.

## Review rounds

1. The first mobile pass found a detached home action, an unimplemented topic entry, weak progress feedback, and no explicit recovery path for a session from a newer version. The home action now sits inside the daily panel. The topic entry opens a topic list. Home reports seen and mastered words and today's work. An unreadable saved session needs confirmation before deletion.
2. The character card comparison showed that the word on the review sheet was too small. The word now uses the existing rice-grid visual treatment, with one grid per character in the same word. The layout was reduced for 320 × 568 after the first version pushed controls below the card. Word detail shows its progress state and offers a contextual lesson or practice action. Repeated characters show their positions.
3. A saved daily queue could still teach a word learned in an individual session. The queue now drops stale introductions, and an already graded recall does not move its schedule again. The independent reviewer repeated the sequence and confirmed the word was skipped.
4. An independent reviewer checked the 320 × 568 word detail, practice prompt and revealed answer. The reviewer found no P1 or P2 layout issues in those states, then rechecked the three-character word 出租车 at 320 × 568 light and 390 × 844 dark. The reviewer requested free practice across the pilot. A separate deck now covers all 40 words without changing review dates or replacing the daily session. The reviewer verified retry and resume on mobile.

## Verification

- `npm run check` passed 151 tests and built the production PWA.
- The production preview registered a service worker, reloaded with the browser offline, and opened a word lesson.
- Browser checks covered mobile and short landscape layouts, word search without pinyin spaces, lesson navigation and reload. In the offline preview, ten introductions led to recall, a missed answer added a retry, and reload restored the feedback. Tests cover teaching, recall, retry, session recovery, independent word practice and backups.
- Screenshots from the review are in `/tmp/jiayou-vocabulary-qa/`, including `characters-card.png`, `round5-small-light.png`, and `round3-review-desktop.png`. These are local review artifacts and are not part of the repository.

## Follow-up fixes

- Individual and free-practice sessions from a newer version now require confirmation before deletion. Failed deletion leaves the session in place.
- A word audio failure now shows a message when the fallback voice cannot play. The reviewer checked the failure with an English-only voice.
- Pinyin rendering no longer imports the character search index. Character search loads on demand. The production build split the previous 805 kB initial script into 435 kB initial and 374 kB for character search, and the chunk-size warning cleared.
- The reviewer checked free-practice retry and resume at 320 × 568. The practice did not mark an unseen word as learned.

## Limits

Audio for a syllable without a bundled recording depends on an installed Chinese voice or a downloaded character pack. The offline check covers the app, a word and its HSK 1 stroke data, not every audio combination or downloaded character pack. Topic tags still cover only a subset of level 1.
