/// <reference types="vite-plugin-pwa/client" />
/** The content manifest, built from the pack files by vite.config.ts. */
declare const __CONTENT__: import('./domain/content/manifest').ContentManifest;
/** Words per HSK level, counted from the lists at build time. */
declare const __WORD_COUNTS__: Record<number, number>;
