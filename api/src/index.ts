import { assembleCharacter, reviewLevel } from './assemble';
import { ingestLevel } from './ingest';
import { deleteOverride, parseLevelParam, putOverride } from './overrides';
import { publishLevel } from './publish';
import type { OverrideEntry } from './types';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

const err = (message: string, status = 400) => json({ error: message }, status);

const decodeChar = (segment: string) => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

const router = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === 'GET' && path === '/health') {
    return json({ ok: true });
  }

  const charMatch = path.match(/^\/characters\/([^/]+)$/);
  if (req.method === 'GET' && charMatch) {
    const char = decodeChar(charMatch[1]);
    const assembled = assembleCharacter(char);
    if (!assembled) return err('character not found', 404);
    return json(assembled);
  }

  if (req.method === 'PUT' && charMatch) {
    const char = decodeChar(charMatch[1]);
    let body: OverrideEntry;
    try {
      body = (await req.json()) as OverrideEntry;
    } catch {
      return err('invalid JSON body');
    }
    const result = putOverride(char, body);
    if (!result) return err('character not found', 404);
    return json(result);
  }

  if (req.method === 'DELETE' && charMatch) {
    const char = decodeChar(charMatch[1]);
    const result = deleteOverride(char);
    if (!result) return err('character not found', 404);
    return json(result);
  }

  const reviewMatch = path.match(/^\/levels\/(\d+)\/review$/);
  if (req.method === 'GET' && reviewMatch) {
    const level = parseLevelParam(reviewMatch[1]);
    if (!level) return err('invalid level');
    try {
      const items = reviewLevel(level);
      return json({ level, count: items.length, items });
    } catch (e) {
      return err(e instanceof Error ? e.message : 'review failed', 404);
    }
  }

  const ingestMatch = path.match(/^\/levels\/(\d+)\/ingest$/);
  if (req.method === 'POST' && ingestMatch) {
    const level = parseLevelParam(ingestMatch[1]);
    if (!level) return err('invalid level');
    let options = { fetch: false, translate: false };
    try {
      const body = await req.json();
      if (body && typeof body === 'object') {
        options = {
          fetch: Boolean((body as { fetch?: boolean }).fetch),
          translate: Boolean((body as { translate?: boolean }).translate),
        };
      }
    } catch {
      // empty body: disk-only ingest
    }
    try {
      const result = await ingestLevel(level, options);
      return json(result);
    } catch (e) {
      return err(e instanceof Error ? e.message : 'ingest failed');
    }
  }

  const publishMatch = path.match(/^\/levels\/(\d+)\/publish$/);
  if (req.method === 'POST' && publishMatch) {
    const level = parseLevelParam(publishMatch[1]);
    if (!level) return err('invalid level');
    try {
      const result = publishLevel(level);
      return json(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'publish failed';
      const status = message.includes('HSK 1') ? 404 : 400;
      return err(message, status);
    }
  }

  return err('not found', 404);
};

const port = Number(process.env.CONTENT_API_PORT ?? 8787);

Bun.serve({
  hostname: '127.0.0.1',
  port,
  fetch: router,
});

console.log(`content-api http://127.0.0.1:${port}`);
