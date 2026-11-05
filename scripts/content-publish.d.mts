export interface ContentVersionInfo { version: number; date: string; notes: string }
export function snapshotRevision(snapshot: unknown): string;
export function todayIso(): string;
export function writeBase(snapshot: unknown, root?: string): Promise<void>;
export function planDraft(draft: unknown, root?: string): Promise<{ files: [string, string][]; version: ContentVersionInfo }>;
export function exportDraft(draft: unknown, root?: string): Promise<string[]>;
export function promoteDraft(draft: unknown, options?: { root?: string; notes?: string; date?: string }): Promise<{ version: ContentVersionInfo; files: string[]; revision: string }>;
export type RegistryStatus = 'available' | 'retired';
export interface RegistryEntry { status: RegistryStatus; list: string; revisions: string[] }
export interface ContentRegistry { schemaVersion: 2; words: Record<string, RegistryEntry>; characters: Record<string, RegistryEntry> }
export interface RevisionFunctions {
  wordRevision(row: never): string;
  characterRevision(row: never): string;
  characterContentId(character: string): string;
}
export const REGISTRY_PATH: string;
export const REGISTRY_SCHEMA: 2;
export function listOf(row: { level?: number }): string;
export function loadRevisions(root?: string): Promise<RevisionFunctions>;
export function updateRegistry(
  previous: ContentRegistry | string[] | null,
  content: { words: readonly { id: string; level?: number; retired?: boolean }[]; characters: readonly { character: string; hsk_level: number }[] },
  revise: RevisionFunctions,
): ContentRegistry;
export function registryJson(registry: ContentRegistry): string;
export function readRegistry(root?: string): Promise<ContentRegistry | string[] | null>;
