import type { HskLevel } from '../types';

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isString = (value: unknown): value is string => typeof value === 'string';

export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export const isHskLevel = (value: unknown): value is HskLevel =>
  value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6;

export const isOneOf = <T extends string>(options: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && options.some((option) => option === value);

export type NonEmpty<T> = [T, ...T[]];

export const isNonEmpty = <T>(items: T[]): items is NonEmpty<T> => items.length > 0;
