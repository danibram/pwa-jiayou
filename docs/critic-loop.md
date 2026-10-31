# Critic loop

Three review rounds on the redesign. Each round, a fresh reviewer agent got phone screenshots (390x844, light and dark, plus desktop) and the owner's goal: "the best and most beautiful app to review and learn Chinese characters". It did not see the previous rounds or the planned fixes. Findings below are summarised; the disposition says what happened to each.

| Round | Findings | High | Medium | Low |
| ----- | -------- | ---- | ------ | --- |
| 1     | 15       | 5    | 7      | 3   |
| 2     | 12       | 4    | 7      | 1   |
| 3     | 9        | 2    | 4      | 3   |

Round 3 judged the visual design finished; its remaining items were content and learning flow.

## Round 1

| Sev | Finding | Disposition |
| --- | ------- | ----------- |
| High | Review graded before the learner could check; flipping counted as a miss | Fixed. Recall, reveal for free, then grade Otra vez / Difícil / Bien |
| High | No spaced repetition or daily queue | Fixed. SM-2 style intervals, due queue plus capped new cards, mastery at 21 days |
| High | Home had no primary action | Fixed. "Hoy" card with due/new counts, main button, daily ring, streak |
| High | Writing only practised tracing | Fixed. Ver, Calcar, De memoria stages |
| High | Song typeface on cards contradicted the Kai stroke data | Fixed. LXGW WenKai subset, self-hosted |
| Med | Card back taught little, layout jumped on flip | Partly. Character stays in place and the reading slides in; examples came in round 3 |
| Med | Tone colours clashed with brand red and success green | Fixed. Tones moved to orange, teal, blue, purple. Tone legend and settings toggle deferred |
| Med | Same swipe meant "next" in one screen and "don't know" in another | Fixed. Grading swipes only after reveal, stamps match buttons |
| Med | Stroke result covered the learner's writing | Fixed. Result replaces the controls under the canvas |
| Med | Guide outline showed dark blobs where strokes overlap | Fixed. Opaque pre-mixed colour |
| Med | Explorar wasted space, mixed button sizes, magnifier for Pleco | Fixed. Larger card, one button size, labelled Pleco, hint only on first cards |
| Med | Redundant controls on Trazos | Fixed |
| Low | Level selector outweighed content | Fixed. Outlined chip with a progress bar |
| Low | Dark cards dissolved into the background | Fixed. Raised surface, inner highlight, brighter soft colours |
| Low | Vague copy, desktop shortcuts hidden | Fixed. Renamed modes, shortcut hints on wide screens. Two-column desktop layout deferred |
| | Undo chip after grading | Deferred |

## Round 2

| Sev | Finding | Disposition |
| --- | ------- | ----------- |
| High | New characters were quizzed before being taught | Fixed. Shown revealed with "Lo tengo", asked again a few cards later |
| High | Writing sat outside the review system | Fixed. Known characters come back as write-from-memory cards, graded by mistakes. Escribir opens on the weakest character |
| High | Card definitions were dictionary dumps | Partly. Split into main and secondary senses; curated glosses came in round 3 |
| High | Calcar gave no hint where to start | Fixed. Gold start dot with stroke number |
| Med | Seal red meant radical, current stroke, CTA and error | Fixed. Radical in gold, red kept for errors |
| Med | Home numbers didn't add up | Fixed. Ring tracks today's queue; "Aprender 5 más" when done |
| Med | Summary claimed mastery after one pass | Fixed. Honest copy, pinyin under the heading. "Escribir los N de hoy" became "Practicar su escritura", which opens the first character only |
| Med | Level progress flat for weeks | Fixed. Two-tone bar, seen and mastered |
| Med | Free review rewrote the schedule | Fixed. Practice records answers without moving intervals |
| Med | Hints low contrast and permanent | Fixed. Darker, larger, shown for the first sessions only |
| Med | Escribir wasted space; neighbour thumbnails spoiled the next character | Fixed. Larger canvas; thumbnails removed rather than redesigned because of the spoiler |
| Low | Primary button style drifted between screens | Fixed. Ink everywhere |

## Round 3

| Sev | Finding | Disposition |
| --- | ------- | ----------- |
| High | Main meaning wrong for many characters (是, 了, 后...) | Fixed. Curated gloss for all 617 characters in `src/data/glosses/` |
| High | Write card had no way out; idle start dot was a free hint | Fixed. "No me acuerdo" animates the answer and grades Otra vez; idle dot off on graded cards |
| Med | No example words | Fixed. One example per character with pinyin, Spanish and audio |
| Med | New-character card had no replay audio; neutral tone looked disabled | Fixed |
| Med | Two identical chevron pairs on Escribir | Fixed. Stroke controls grouped in one pill, character pager labelled |
| Med | Session header counted cards, not characters | Fixed. "4 / 11 caracteres" |
| Low | Red tab nudge read as a warning | Fixed. Gold nudge, current stroke in ink |
| Low | "Repasar los 1 fallos", grey pinyin in summary | Fixed |
| Low | Character of the day truncated | Fixed through the curated gloss |

## Known gaps

- Glosses and examples were written by agents and checked mechanically (coverage, length, example contains the character), not reviewed by a person. Entries worth a look: 长 (data says zhǎng, learners first meet cháng), 得 (dé rather than the particle de), 谁 (shuí), 绩 (data says jī, standard is jì), tone sandhi on 一 and 不 (textbook tones), neutral tones in 学生, 认识, 时候.
- Latin fonts (Fraunces, Figtree) load from Google Fonts and work offline only after the first visit. The hanzi font is self-hosted and precached.
- `docs/specs/functional-specifications.md` describes the old app and was not updated.
