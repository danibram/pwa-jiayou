// Run with PLAYWRIGHT_CORE set to a temporary playwright-core installation.
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const playwrightPath = process.env.PLAYWRIGHT_CORE;
if (!playwrightPath) throw new Error('Set PLAYWRIGHT_CORE to playwright-core/index.mjs');
const { chromium } = await import(pathToFileURL(resolve(playwrightPath)).href);
const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const temp = await realpath(await mkdtemp(join(tmpdir(), 'fsrs-browser-')));
const source = join(temp, 'source');
const output = join(temp, 'dist');
let server;
const requests = [];
let browser;
try {
  await mkdir(source);
  await writeFile(join(source, 'index.html'), '<!doctype html><title>FSRS probe</title><link rel="icon" href="data:,"><script type="module" src="/main.js"></script>');
  const probePath = resolve('src/domain/learning/fsrsProbe.ts');
  await writeFile(join(source, 'main.js'), `
import { createFsrsProbe, probeSequence, replayProbeSequence, restoreProbeCard, serializeProbeCard } from ${JSON.stringify(probePath)};
// No top-level await here. DefaultScheduler imports the FSRS-7 chunk lazily, and that chunk
// imports the entry chunk back, so awaiting it at the top level of the entry never resolves.
async function start() {
const probe = await createFsrsProbe();
const expected = replayProbeSequence(probe, probeSequence, { restoreBetweenSteps: false });
// The stored card is the result of the first two steps. Later runs continue from storage.
if (!localStorage.getItem('fsrs-probe')) localStorage.setItem('fsrs-probe', serializeProbeCard(expected.cards[1]));
window.runProbe = () => {
  const replayed = replayProbeSequence(probe, probeSequence, { restoreBetweenSteps: true });
  let card = restoreProbeCard(localStorage.getItem('fsrs-probe'));
  const continued = [];
  for (const step of probeSequence.slice(2)) {
    card = probe.review(card, step.at, step.grade).card;
    card = restoreProbeCard(serializeProbeCard(card));
    continued.push(card);
  }
  return JSON.stringify(replayed) === JSON.stringify(expected) &&
    JSON.stringify(continued) === JSON.stringify(expected.cards.slice(2));
};
await navigator.serviceWorker.register('/sw.js');
await navigator.serviceWorker.ready;
window.probeReady = true;
}
start().catch((error) => console.error('probe start failed', error));
`);
  await build({ configFile: false, root: source, build: { outDir: output, emptyOutDir: true } });
  const assetNames = await readdir(join(output, 'assets'));
  const precache = ['/', '/index.html', ...assetNames.map((name) => `/assets/${name}`)];
  await writeFile(join(output, 'sw.js'), `
self.addEventListener('install', event => event.waitUntil(caches.open('probe').then(cache => cache.addAll(${JSON.stringify(precache)})).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request))));
`);
  server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, 'http://localhost').pathname;
      requests.push(path);
      const file = join(output, path === '/' ? 'index.html' : path);
      const body = await readFile(file);
      const contentType = { '.html': 'text/html', '.js': 'text/javascript' }[extname(file)] || 'application/octet-stream';
      // Without this, Chrome's HTTP cache could serve an offline reload and hide a broken service worker.
      response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolveListen, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolveListen));
  browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error('page error:', error.message));
  page.on('console', (message) => { if (message.type() === 'error') console.error('console error:', message.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.probeReady && navigator.serviceWorker.controller);
  if (!await page.evaluate(() => window.runProbe())) throw new Error('Online review failed');
  console.log('online review: ok');
  // A review in an already loaded page is pure computation, so the offline check starts at the reload.
  await context.setOffline(true);
  const requestsBeforeOffline = requests.length;
  const responses = [];
  page.on('response', (response) => responses.push(response));
  const reload = await page.reload();
  if (!reload?.fromServiceWorker()) throw new Error('Offline reload was not served by the service worker');
  await page.waitForFunction(() => window.probeReady && navigator.serviceWorker.controller);
  if (!await page.evaluate(() => !navigator.onLine && window.runProbe())) throw new Error('Offline reload failed');
  if (requests.length !== requestsBeforeOffline) throw new Error(`Server received ${requests.length - requestsBeforeOffline} requests while offline`);
  const modelChunks = responses.filter((response) => /\/assets\/fsrs-7-[^/]+\.js$/.test(new URL(response.url()).pathname));
  if (modelChunks.length !== 1 || !modelChunks[0].fromServiceWorker()) throw new Error('FSRS-7 chunk was not served by the service worker');
  console.log(`offline FSRS-7 chunk from service worker: ${new URL(modelChunks[0].url()).pathname}`);
  console.log('offline reload from service worker, restore and continue: ok');
  console.log(`server requests online: ${requestsBeforeOffline}, offline: ${requests.length - requestsBeforeOffline}`);
  console.log(`PASS Chrome ${browser.version()}: online and offline reload from test service worker`);
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
  await rm(temp, { recursive: true, force: true });
}
