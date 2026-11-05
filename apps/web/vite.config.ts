import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { contentManifest, LEVELS, wordListPath } from '../../scripts/content-manifest.ts';
import { packCacheName } from './src/domain/content/caches.ts';

// Hashed from the files themselves, so a pack changed without rebuilding content.json still gets a
// new cache. Only that pack's cache changes; the others keep what the learner already downloaded.
const content = contentManifest(process.cwd());

/** Words per HSK level, so the level pickers can say how big a list is before it is downloaded. */
const wordCounts = Object.fromEntries([1, ...LEVELS].map((level) => {
  const words: unknown = JSON.parse(readFileSync(join(process.cwd(), wordListPath(level)), 'utf8'));
  return [level, Array.isArray(words) ? words.length : 0];
}));

/**
 * HSK 2 to 6 words are not in the JavaScript. Each level's list is served at packs/hskN/words.json,
 * inside its pack, and only downloaded when the learner activates that list.
 */
const levelWordFiles = (): Plugin => {
  const wordFile = /^\/packs\/hsk(\d)\/words\.json$/;
  return {
    name: 'jiayou-level-words',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const level = Number(wordFile.exec((req.url ?? '').split('?')[0])?.[1]);
        if (!LEVELS.includes(level)) return next();
        res.setHeader('content-type', 'application/json');
        res.end(readFileSync(join(process.cwd(), wordListPath(level))));
      });
    },
    generateBundle() {
      for (const level of LEVELS) {
        const words = JSON.parse(readFileSync(join(process.cwd(), wordListPath(level)), 'utf8'));
        this.emitFile({ type: 'asset', fileName: `packs/hsk${level}/words.json`, source: JSON.stringify(words) });
      }
    },
  };
};

/**
 * The worker serves clips from the same per-pack cache the app saves them into. Workbox copies a
 * RegExp into the worker as is, but not a function's closure. It tests the whole URL and, for
 * another origin, only a match at its start, so these never match a CDN file.
 */
const audioRoutes = content.packs.map((pack) => ({
  urlPattern: pack.level ? new RegExp(`/packs/hsk${pack.level}/audio/`) : /\/\/[^/]+\/audio\//,
  cacheName: packCacheName(pack),
}));

export default defineConfig({
  define: { __CONTENT__: JSON.stringify(content), __WORD_COUNTS__: JSON.stringify(wordCounts) },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/posthog-js/') || id.includes('/node_modules/@posthog/')) return 'posthog';
          // ts-fsrs loads its FSRS-7 model with a dynamic import, and Vite would put that model in a
          // chunk that imports the entry chunk back. One chunk for the library and srs-kit has no such
          // cycle, and `globPatterns` below precaches it, so the first review works offline.
          if (/\/node_modules\/(ts-fsrs|@open-spaced-repetition\/srs-kit)\//.test(id)) return 'fsrs';
        },
      },
    },
  },
  plugins: [
    solid(),
    levelWordFiles(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['*.png', '*.svg', '*.ico'],
      manifest: {
        name: '加油 · Hanzi HSK',
        short_name: '加油',
        description: 'Aprende y repasa caracteres chinos HSK: tarjetas, repaso y orden de trazos',
        theme_color: '#f4efe6',
        background_color: '#f4efe6',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,png,svg,ico,woff2,mp3}'],
        // Optional HSK lists are fetched into their own cache after the user asks for them.
        globIgnores: ['**/packs/**', '**/audio/**'],
        runtimeCaching: [
          // The app saves pack clips into these caches itself; <audio> requests only see them through the worker.
          // Strokes and lists are read with caches.match and stay off these routes.
          ...audioRoutes.map(({ urlPattern, cacheName }) => ({
            urlPattern,
            handler: 'CacheFirst' as const,
            options: {
              cacheName,
              rangeRequests: true,
              // A missing clip comes back as the HTML shell with status 200; never store that as audio.
              cacheableResponse: { statuses: [200], headers: { 'content-type': 'audio/mpeg' } },
            },
          })),
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 año
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
  },
});

