import type { LearningBackup } from '../types';
import { err, ok, type BackupError, type Result } from './errors';
import { parseBackupValue } from './parse';

// The files the backup screen reads. The app writes a plain learning backup, the event log with its
// configs. Two older shapes are still read: the combined file of phase 4, with the log next to a v4
// character half, and a v4 progress file. Their v4 progress is not imported, because characters and
// words start over in the event log and there are no users to migrate. A warning says so.

export interface BackupWarning {
  code: 'legacy-progress-ignored';
  message: string;
  /** Character and word records left out. */
  count: number;
}

/** What a chosen file holds. Only `learning` is ever imported; a v4 file has none. */
export type UserBackup =
  | { source: 'learning' | 'combined'; learning: LearningBackup; warnings: BackupWarning[] }
  | { source: 'legacy-v4'; learning: null; warnings: BackupWarning[] };

const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const formatError = (path: string, message: string): BackupError => ({ code: 'invalid-format', path, message });

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const countOf = (value: unknown) => (isRecord(value) ? Object.keys(value).length : 0);

const ignoredWarning = (chars: number, words: number): BackupWarning[] => {
  const parts = [chars > 0 ? plural(chars, 'carácter', 'caracteres') : '', words > 0 ? plural(words, 'palabra', 'palabras') : ''].filter(Boolean);
  if (parts.length === 0) return [];
  return [
    {
      code: 'legacy-progress-ignored',
      count: chars + words,
      message: `La copia trae progreso antiguo de ${parts.join(' y ')}, que no se importa. El nuevo sistema empieza de cero.`,
    },
  ];
};

const decode = (raw: string): Result<unknown, BackupError[]> => {
  try {
    return ok(JSON.parse(raw) as unknown);
  } catch {
    return err([{ code: 'invalid-json', message: 'El archivo no es JSON válido.' }]);
  }
};

/**
 * Reads any file the backup screen accepts: a learning backup, the older combined file or a v4
 * progress file. A learning log with any error rejects the file whole; warnings never reject.
 */
export const parseUserBackup = (raw: string): Result<UserBackup, BackupError[]> => {
  const decoded = decode(raw);
  if (!decoded.ok) return decoded;
  const value = decoded.value;
  if (!isRecord(value)) return err([formatError('', 'El archivo no contiene una copia de progreso.')]);

  if (hasOwn(value, 'learning') || hasOwn(value, 'legacyCharacters')) {
    const errors: BackupError[] = [];
    for (const key of Object.keys(value)) {
      if (key !== 'learning' && key !== 'legacyCharacters') errors.push(formatError(key, `El campo ${key} no forma parte del formato`));
    }
    if (!hasOwn(value, 'learning')) errors.push(formatError('learning', 'Falta el campo learning'));
    const learning = hasOwn(value, 'learning') ? parseBackupValue(value.learning, 'learning') : null;
    if (learning && !learning.ok) errors.push(...learning.error);
    if (errors.length > 0 || !learning?.ok) return err(errors);
    const chars = isRecord(value.legacyCharacters) ? countOf(value.legacyCharacters.chars) : 0;
    return ok({ source: 'combined', learning: learning.value, warnings: ignoredWarning(chars, 0) });
  }

  if (hasOwn(value, 'version')) {
    if (value.version !== 4) return err([{ code: 'unsupported-version', path: 'version', message: 'Esta versión de la copia no es compatible.' }]);
    return ok({ source: 'legacy-v4', learning: null, warnings: ignoredWarning(countOf(value.chars), countOf(value.words)) });
  }

  if (hasOwn(value, 'schemaVersion')) {
    const learning = parseBackupValue(value);
    if (!learning.ok) return learning;
    return ok({ source: 'learning', learning: learning.value, warnings: [] });
  }

  return err([formatError('', 'El archivo no contiene una copia de progreso.')]);
};
