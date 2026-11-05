export { isHskLevel } from '@jiayou/content';

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isString = (value: unknown): value is string => typeof value === 'string';

export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export type NonEmpty<T> = [T, ...T[]];

export const isNonEmpty = <T>(items: T[]): items is NonEmpty<T> => items.length > 0;
