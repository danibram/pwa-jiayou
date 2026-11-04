import raw from '../../content/version.json';

/** The editorial release the app was built with. The editor bumps it when a draft is promoted. */
export interface ContentVersion {
  version: number;
  date: string;
  notes: string;
}

const parse = (value: unknown): ContentVersion => {
  const row = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const version = typeof row.version === 'number' && Number.isInteger(row.version) && row.version > 0 ? row.version : 0;
  const date = typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? row.date : '';
  const notes = typeof row.notes === 'string' ? row.notes.trim() : '';
  return { version, date, notes };
};

export const contentVersion: ContentVersion = parse(raw);

/** "3 de noviembre de 2026", or the raw value when it is not a date. */
export const formatContentDate = (iso: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [year, month, day] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(year, month - 1, day));
};

/** "Contenido v3, del 3 de noviembre de 2026" for Opciones and Acerca. */
export const contentVersionLabel = (): string => {
  if (!contentVersion.version) return 'Contenido sin versión';
  const date = contentVersion.date ? `, del ${formatContentDate(contentVersion.date)}` : '';
  return `Contenido v${contentVersion.version}${date}`;
};
