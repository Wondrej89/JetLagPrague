import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Miniflare, convertV4MiniflareOptions, type V4MiniflareOptions } from 'miniflare';

export const TEST_ORIGIN = 'http://127.0.0.1:4181';

export function localWorker(options: { port?: number; persist?: string; reference?: boolean; hideMs?: number } = {}) {
  const dir = resolve('dist/multiplayer');
  const config: V4MiniflareOptions = {
    host: '127.0.0.1', port: options.port ?? 0,
    modules: true, scriptPath: resolve(dir,'worker.js'), modulesRoot: dir,
    compatibilityDate: '2026-10-18',
    durableObjects: { ROOMS: { className: 'GameRoom', useSQLite: true }, LIMITS: { className: 'RoomRateLimiter', useSQLite: true } },
    name: 'jetlag-multiplayer-test',
    resourcePersistencePath: options.persist,
    bindings: {
      ALLOWED_ORIGIN: TEST_ORIGIN, RELEASE_BASE_URL: 'https://catalog.test/',
      ALLOW_REFERENCE_RELEASE: options.reference === false ? 'false' : 'true',
      TEST_HIDE_MS: String(options.hideMs ?? 15_000),
    },
    serviceBindings: {
      RELEASES: async request => {
        const file = new URL(request.url).pathname.slice(1);
        if (!/^(?:current\.json|release-[a-f0-9]{64}\.json)$/.test(file)) return new Response(null, { status: 404 });
        try { return new Response(new Uint8Array(await readFile(resolve('data/releases',file)))); }
        catch { return new Response(null, { status: 404 }); }
      },
    },
  };
  return new Miniflare(convertV4MiniflareOptions(config));
}

if (process.argv.includes('--serve')) {
  const worker = localWorker({ port: 4180 });
  const url = await worker.ready;
  process.stdout.write(`Multiplayer test Worker ${url.href}\n`);
  for (const signal of ['SIGINT','SIGTERM'] as const) process.on(signal, () => {
    void worker.dispose().then(() => process.exit(0));
  });
}
