import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { VitePWA } from 'vite-plugin-pwa';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const mediaHash = createHash('sha256');
const hashDirectory = (directory: string) => {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) hashDirectory(path);
    else { mediaHash.update(path); mediaHash.update(readFileSync(path)); }
  }
};
hashDirectory('public/packs');
hashDirectory('public/audio');
const mediaCache = `hsk-packs-${mediaHash.digest('hex').slice(0, 12)}`;

export default defineConfig({
  define: { __MEDIA_CACHE__: JSON.stringify(mediaCache) },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/posthog-js/') || id.includes('/node_modules/@posthog/')) return 'posthog';
        },
      },
    },
  },
  plugins: [
    solid(),
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
          {
            // The app saves pack clips into this cache itself; <audio> requests only see it through the worker.
            // Strokes and lists are read with caches.match and stay off this route.
            urlPattern: ({ url }) => url.origin === self.location.origin && (/^\/packs\/hsk\d\/audio\//.test(url.pathname) || /^\/audio\//.test(url.pathname)),
            handler: 'CacheFirst',
            options: {
              cacheName: mediaCache,
              rangeRequests: true,
              // A missing clip comes back as the HTML shell with status 200; never store that as audio.
              cacheableResponse: { statuses: [200], headers: { 'content-type': 'audio/mpeg' } },
            },
          },
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

