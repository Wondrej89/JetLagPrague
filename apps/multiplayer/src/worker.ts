import { PUBLIC_GAME_SIZE } from '../../../packages/game-core/src/room-protocol';
import { sha256 } from '../../../packages/geo-core/src/pid-snapshot';
import { configured } from './catalog';
import { errorResponse, json, randomCode, readJson, requireRequest, RequestError } from './http';
import { codeSchema, founderSchema, parse, roomIdSchema } from './input';
import type { DurableState, MultiplayerEnvironment } from './platform';
import { allowed, setupStore } from './store';

export { GameRoom } from './room';

const limits = {
  create: { count: 8, ms: 600_000 },
  join: { count: 30, ms: 600_000 },
  recover: { count: 12, ms: 600_000 },
  socket: { count: 180, ms: 60_000 },
};

export class RoomRateLimiter {
  constructor(private state: DurableState) { setupStore(state.storage.sql); }

  async fetch(request: Request) {
    const action = new URL(request.url).pathname.slice(1) as keyof typeof limits;
    if (!Object.hasOwn(limits, action)) return json({ error: 'Neplatný typ limitu.' }, 404);
    const now = Date.now(), { count, ms } = limits[action], sql = this.state.storage.sql;
    const accepted = this.state.storage.transactionSync(() => allowed(sql, action, now, count, ms));
    await this.state.storage.setAlarm(now + 600_000);
    return json({ accepted }, accepted ? 200 : 429);
  }

  alarm() {
    this.state.storage.sql.exec('DELETE FROM budget WHERE expires <= ?', Date.now());
  }
}

async function rate(request: Request, env: MultiplayerEnvironment, action: keyof typeof limits) {
  const identity = await sha256(request.headers.get('CF-Connecting-IP') ?? 'local');
  const response = await env.LIMITS.get(env.LIMITS.idFromName(identity)).fetch(new Request(`https://limits.internal/${action}`));
  requireRequest(response.ok, 429, 'Příliš mnoho pokusů. Zkuste to později.');
}

function forward(request: Request, env: MultiplayerEnvironment, code: string, path: string) {
  return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(new Request(new URL(path, request.url), request));
}

async function route(request: Request, env: MultiplayerEnvironment) {
  const { pathname } = new URL(request.url);
  const method = request.method;
  if (pathname === '/status' && method === 'GET') return json({ configured: configured(env), size: PUBLIC_GAME_SIZE });
  requireRequest(configured(env), 503, 'Herní server čeká na konfiguraci.');
  if (pathname === '/rooms' && method === 'POST') {
    await rate(request, env, 'create');
    const input = parse(founderSchema, await readJson(request), 'Je nutná platná GPS. Veřejná hra používá pravidla Medium.');
    for (let attempt = 0; attempt < 24; attempt++) {
      const code = randomCode(), stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      const response = await stub.fetch(new Request(`https://room.internal/init/${code}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      }));
      if (response.status !== 409 || !(await response.clone().json() as { collision?: boolean }).collision) return response;
    }
    throw new RequestError(503, 'Připojovací kód se nepodařilo přidělit. Zkuste to znovu.');
  }

  const [, root, code, tail, action = '', resource = '', extra] = pathname.split('/');
  requireRequest(root === 'rooms' && !extra && codeSchema.safeParse(code).success, 404, 'Neznámá adresa místnosti.');
  if (method === 'POST' && !action && ['join','recover'].includes(tail)) {
    await rate(request, env, tail as 'join'|'recover');
    return forward(request, env, code, `/${tail}/${code}`);
  }
  requireRequest(roomIdSchema.safeParse(tail).success, 404, 'Neznámá adresa místnosti.');
  if (method === 'GET' && !action) return forward(request, env, code, `/view/${code}/${tail}`);
  if (method === 'POST' && !resource && ['ticket','command','cancel'].includes(action))
    return forward(request, env, code, `/${action}/${code}/${tail}`);
  if (method === 'GET' && action === 'socket' && !resource) {
    await rate(request, env, 'socket');
    return forward(request, env, code, `/socket/${code}/${tail}`);
  }
  if (action === 'media' && (method === 'POST' && !resource || method === 'GET' && roomIdSchema.safeParse(resource).success))
    return forward(request, env, code, `/media/${code}/${tail}/${resource}`);
  throw new RequestError(404, 'Neznámá akce místnosti.');
}

export default {
  async fetch(request: Request, env: MultiplayerEnvironment) {
    const origin = request.headers.get('Origin');
    const publicStatus = new URL(request.url).pathname === '/status' && request.method === 'GET';
    if (origin !== env.ALLOWED_ORIGIN && !(publicStatus && !origin)) return json({ error: 'Nepovolený původ požadavku.' }, 403);
    const cors = new Headers({
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Room-Connection', Vary: 'Origin',
    });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    let response;
    try { response = await route(request, env); }
    catch (error) { response = errorResponse(error); }
    if (response.status === 101) return response;
    const headers = new Headers(response.headers);
    for (const [name, value] of cors) headers.set(name, value);
    return new Response(response.body, { status: response.status, headers });
  },
};
