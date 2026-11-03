export type { ExampleWord, HSKCharacter, HskLevel } from '../shared/contracts/content.ts';

export type ReviewPool = 'today' | 'more' | 'all' | 'weak';

export interface TrainingResult {
  correct: number;
  incorrect: number;
  total: number;
  percentage: number;
}

export type SwipeDirection = 'left' | 'right' | null;
