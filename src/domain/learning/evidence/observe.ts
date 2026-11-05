import type { AttemptReading } from '../evaluation/rules';
import type { AttemptInput, EvaluableExercise, SkillObservation } from '../evaluation/types';
import type { ValidEvaluation } from '../types';

/**
 * One observation of the exercise's skill from a valid attempt. Its id comes from the attempt and
 * the skill, so a retried write produces the same evidence.
 */
export const observeAttempt = (
  attempt: AttemptInput,
  exercise: EvaluableExercise,
  reading: AttemptReading,
  evaluation: ValidEvaluation,
): SkillObservation[] => {
  if (reading.decidedAt === null) return [];
  const writing = exercise.format === 'writing';
  return [
    {
      id: `${attempt.id}:${exercise.skill}`,
      skill: exercise.skill,
      recordedAt: reading.decidedAt,
      evaluation,
      assisted: writing ? reading.anyHint : reading.revealingHintFirst,
      confusions: reading.confusions,
      mistakes: reading.firstDrawing?.mistakes ?? null,
    },
  ];
};
