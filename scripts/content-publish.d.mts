export interface ContentVersionInfo { version: number; date: string; notes: string }
export function snapshotRevision(snapshot: unknown): string;
export function todayIso(): string;
export function writeBase(snapshot: unknown, root?: string): Promise<void>;
export function planDraft(draft: unknown, root?: string): Promise<{ files: [string, string][]; version: ContentVersionInfo }>;
export function exportDraft(draft: unknown, root?: string): Promise<string[]>;
export function promoteDraft(draft: unknown, options?: { root?: string; notes?: string; date?: string }): Promise<{ version: ContentVersionInfo; files: string[]; revision: string }>;
