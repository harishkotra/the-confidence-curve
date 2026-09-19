/**
 * Server bootstrap. `tsx watch src/index.ts` in dev.
 *
 * This machine runs several projects at once, and they compete for the same
 * default ports. Two failure modes are worth guarding against explicitly:
 *
 *  - The port is already taken by another app. Without a check, the proxy in
 *    the web app would quietly talk to that other app instead of this one.
 *  - Another server is answering on our port and is not us.
 *
 * So: probe before binding, and refuse to start with a clear message rather
 * than half-working.
 */

import { serve } from '@hono/node-server';
import { createApp } from './app.ts';

const PORT = Number(process.env['PORT'] ?? 3001);
const HOST = '127.0.0.1';

async function probe(port: number): Promise<'free' | 'ours' | 'foreign'> {
  try {
    const res = await fetch(`http://${HOST}:${port}/api/health`, {
      signal: AbortSignal.timeout(1200),
    });
    if (!res.ok) return 'foreign';
    const body = (await res.json()) as { ok?: boolean; questions?: number };
    // Our health route reports the bank size. Nothing else does.
    return body.ok === true && typeof body.questions === 'number' ? 'ours' : 'foreign';
  } catch {
    return 'free';
  }
}

const state = await probe(PORT);

if (state === 'foreign') {
  console.error(
    `\nPort ${PORT} is already in use by a different server.\n\n` +
      `The web app proxies /api to 127.0.0.1:${PORT}, so it would talk to that\n` +
      `other server instead of this one — and quietly show the wrong data.\n\n` +
      `Pick a free port and pass it to both processes:\n\n` +
      `  PORT=${PORT + 200} pnpm -F server dev\n` +
      `  PORT=5273 API_PORT=${PORT + 200} pnpm -F web dev\n`,
  );
  process.exit(1);
}

if (state === 'ours') {
  console.log(`confidence-curve api already running on http://${HOST}:${PORT}`);
  process.exit(0);
}

serve({ fetch: createApp().fetch, port: PORT, hostname: HOST }, (info) => {
  console.log(`confidence-curve api listening on http://${HOST}:${info.port}`);
  console.log(`  web app should proxy to this port (API_PORT=${info.port})`);
});