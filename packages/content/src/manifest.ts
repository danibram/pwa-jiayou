/** The pack format this build understands. A pack with a larger `schema` is left alone. */
export const PACK_SCHEMA = 1;

/** One versioned piece of downloadable content: a character pack, or the bundled audio. */
export interface PackEntry {
  /** `hsk2` … `hsk6`, or `audio`. */
  id: string;
  /** The HSK level a character pack holds. The audio has none. */
  level?: number;
  /** First 12 hex digits of a SHA-256 over every file of the pack, names included. */
  hash: string;
  /** Bytes over every file of the pack. */
  size: number;
  schema: number;
}

/** `public/packs/content.json`: what the server holds, one entry per pack. */
export interface ContentManifest {
  packs: PackEntry[];
}

/**
 * The packs this build can read, by id. One with a newer schema is skipped, so an installed app
 * that is not updated keeps studying with what it has.
 */
export const usablePacks = (manifest: ContentManifest, schema = PACK_SCHEMA): Map<string, PackEntry> =>
  new Map(manifest.packs.filter((pack) => pack.schema <= schema).map((pack) => [pack.id, pack]));
