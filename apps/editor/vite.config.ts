import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import solid from 'vite-plugin-solid';
import tailwindcss from 'tailwindcss';
import { planDraft, promoteDraft } from '../../scripts/content-publish.mjs';

const editorRoot = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

// Chunks can split a multi-byte character, so decode once the whole body is in.
const readBody = (req: IncomingMessage) => new Promise<string>((resolve, reject) => {
  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer | string) => { chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk); });
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  req.on('error', reject);
});

/**
 * Promotion runs inside the dev server, since the browser cannot write to the repo.
 * A static build has no such routes; the editor then falls back to downloading the draft.
 */
const contentServer = (): Plugin => ({
  name: 'jiayou-content-server',
  configureServer(server) {
    server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      if (!req.url?.startsWith('/__content/')) return next();
      const send = (status: number, body: unknown) => {
        res.statusCode = status;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(body));
      };
      try {
        if (req.method === 'GET' && req.url === '/__content/status') return send(200, { available: true });
        if (req.method !== 'POST') return send(405, { error: 'Método no permitido.' });
        const payload = JSON.parse((await readBody(req)) || '{}') as { draft?: unknown; notes?: string };
        if (!payload.draft) return send(400, { error: 'Falta el borrador.' });
        if (req.url === '/__content/plan') {
          const { files, version } = await planDraft(payload.draft);
          return send(200, { files: files.map(([path]) => path), version });
        }
        if (req.url === '/__content/promote') {
          return send(200, await promoteDraft(payload.draft, { notes: payload.notes ?? '' }));
        }
        send(404, { error: 'Ruta desconocida.' });
      } catch (error) {
        send(400, { error: error instanceof Error ? error.message : 'No se pudo completar la operación.' });
      }
    });
  },
});

export default defineConfig({
  root: editorRoot,
  base: './',
  plugins: [solid(), contentServer()],
  css: { postcss: { plugins: [tailwindcss({ config: fileURLToPath(new URL('./tailwind.config.js', import.meta.url)) })] } },
  // The editor reuses the app's code from ../web/src, outside its own root.
  server: { host: '127.0.0.1', port: 4318, fs: { allow: [repoRoot] } },
  build: { outDir: 'dist', emptyOutDir: true },
});
