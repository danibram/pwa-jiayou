# Product

## Register

product

## Users

Spanish-speaking learners practise Chinese on a phone or desktop. They use short daily review sessions, explore HSK content and practise character strokes. The installed PWA must support study without a connection.

## Product purpose

Jiāyóu teaches vocabulary and characters through recall and spaced repetition. Vocabulary entries have their own reading, meaning, HSK edition and progress. Character practice teaches the written forms inside words. The first vocabulary release contains a partial HSK 1 selection and must state that coverage.

## Brand personality

Calm, direct and tactile. The existing app uses rice paper, ink and Chinese handwriting. Spanish copy describes what the learner can do and what they have practised, without claiming mastery after one session.

## Anti-references

Avoid dictionary dumps as the primary meaning, ambiguous grading gestures, competing primary actions and decorative game elements that hide the learning task. These constraints follow the findings in docs/critic-loop.md and the art direction in docs/vision/art-direction.md.

## Design principles

- Teach a new entry before asking the learner to recall it.
- Reveal the answer before offering grades.
- Keep vocabulary progress separate from character progress.
- Preserve existing progress when adding vocabulary.
- State the actual coverage of each list and keep the source edition visible where it matters.
- Reuse the current paper, ink, typography and controls for the vocabulary flow.

## Accessibility and inclusion

Preserve keyboard navigation, visible focus, labelled controls, reduced motion and both color schemes. Touch controls should provide at least a 44 by 44 pixel target. Pinyin tones retain their written marks as well as color. These requirements come from src/index.css, tests/accessibility.test.tsx and docs/specs/functional-specifications.md.
