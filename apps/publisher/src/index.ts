import { z } from 'zod';
import { canonicalJson } from '../../../packages/geo-core/src/administrative';
import { sha256, pragueDate } from '../../../packages/geo-core/src/pid-snapshot';
import { readPidCatalog } from '../../../packages/geo-core/src/pid-catalog';
import { createGameDataRelease, gamePublicationErrors, readGameReleaseIndex, readGameReleaseArtifact, releaseEntry, verifyGameDataRelease, type GameReleaseIndex } from '../../../packages/geo-core/src/game-release';
import { ApiFailure, base64url, decodeBase64, GitHubClient, randomToken, type GitHubEnvironment } from './github';

export interface Storage {
  get<T>(key: string): Promise<T | undefined>; put(key: string, value: unknown): Promise<void>; delete(key: string): Promise<boolean>;
  transaction<T>(action: (transaction: Storage) => Promise<T>): Promise<T>;
  list<T>(options?: { prefix?: string; limit?: number }): Promise<Map<string, T>>;
  getAlarm(): Promise<number | null>; setAlarm(time: number): Promise<void>;
}
export interface PublisherEnvironment extends GitHubEnvironment {
  ALLOWED_ORIGIN: string; EDITOR_URL: string; ALLOWED_GITHUB_USER_ID: string;
  COORDINATOR: { idFromName(name: string): unknown; get(id: unknown): { fetch(request: Request): Promise<Response> } };
}
interface Session { expiresAt: number; userId: string; login: string; csrfHash: string }
interface Flow { expiresAt: number; verifier: string; redirectUri: string }
export const MAX_PUBLISH_BYTES = 16 * 1024 * 1024;
const requestSchema = z.object({ expectedCommit: z.string().regex(/^[a-f0-9]{40}$/), release: z.unknown() }).strict();
const rollbackSchema = z.object({ expectedCommit: requestSchema.shape.expectedCommit, releaseId: z.string().regex(/^release:[a-f0-9]{64}$/) }).strict();
function configured(env: PublisherEnvironment): boolean {
  try {
    return ['GITHUB_APP_ID', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GITHUB_INSTALLATION_ID', 'GITHUB_APP_PRIVATE_KEY', 'REPOSITORY_ID', 'ALLOWED_GITHUB_USER_ID'].every(key => !!env[key as keyof PublisherEnvironment])
      && /^\d+$/.test(env.ALLOWED_GITHUB_USER_ID) && /^\d+$/.test(env.REPOSITORY_ID) && /^\d+$/.test(env.GITHUB_INSTALLATION_ID)
      && new URL(env.ALLOWED_ORIGIN).origin === env.ALLOWED_ORIGIN && new URL(env.EDITOR_URL).origin === env.ALLOWED_ORIGIN;
  } catch { return false; }
}
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }); }
async function body(request: Request): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new ApiFailure(415, 'Očekáván JSON požadavek.');
  if (Number(request.headers.get('content-length')) > MAX_PUBLISH_BYTES) throw new ApiFailure(413, 'Návrh publikace překračuje limit 16 MiB.');
  const reader = request.body?.getReader(); if (!reader) throw new ApiFailure(400, 'Chybí tělo požadavku.');
  let size = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_PUBLISH_BYTES) { await reader.cancel(); throw new ApiFailure(413, 'Návrh publikace překračuje limit 16 MiB.'); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) { if (error instanceof ApiFailure) throw error; throw new ApiFailure(400, 'Požadavek není platný JSON UTF-8.'); }
}
function cookie(request: Request, name: string) { return request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? ''; }
const flowCookie = (value: string, seconds: number) => `__Host-jetlag-oauth=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${seconds}`;

export class PublisherCoordinator {
  private storage: Storage;
  constructor(state: { storage: Storage }, private env: PublisherEnvironment) { this.storage = state.storage; }
  private async expiring(key: string, value: { expiresAt: number }) {
    await this.storage.transaction(async tx => { await tx.put(key, value); await tx.put(`expiry:${value.expiresAt}:${key}`, key); });
    const alarm = await this.storage.getAlarm(); if (alarm === null || alarm > Date.now() + 60000) await this.storage.setAlarm(Date.now() + 60000);
  }
  async alarm() {
    const now = Date.now(); const entries = await this.storage.list<string>({ prefix: 'expiry:', limit: 1000 });
    for (const [index, key] of entries) {
      const time = Number(index.split(':')[1]); if (time > now) break;
      const value = await this.storage.get<{ expiresAt: number }>(key); if (value && value.expiresAt <= now) await this.storage.delete(key);
      await this.storage.delete(index);
    }
    if (entries.size) await this.storage.setAlarm(now + (entries.size === 1000 ? 1000 : 60000));
  }
  private async rate(request: Request, action: string, maximum: number, duration: number) {
    const identity = await sha256(request.headers.get('cf-connecting-ip') ?? 'local'); const key = `rate:${action}:${identity}`; const now = Date.now();
    const expiresAt = await this.storage.transaction(async tx => {
      let value = await tx.get<{ count: number; expiresAt: number }>(key);
      if (!value || value.expiresAt <= now) value = { count: 0, expiresAt: now + duration };
      if (value.count >= maximum) throw new ApiFailure(429, 'Příliš mnoho požadavků. Zkuste to později.');
      value.count++; await tx.put(key, value); await tx.put(`expiry:${value.expiresAt}:${key}`, key); return value.expiresAt;
    });
    if (await this.storage.getAlarm() === null) await this.storage.setAlarm(Math.min(expiresAt, now + 60000));
  }
  private async session(request: Request, mutation = false): Promise<{ key: string; value: Session }> {
    if (request.headers.get('origin') !== this.env.ALLOWED_ORIGIN) throw new ApiFailure(403, 'Nepovolený origin.');
    const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('authorization') ?? '')?.[1];
    if (!token) throw new ApiFailure(401, 'Přihlášení správce chybí nebo vypršelo.');
    const key = `session:${await sha256(token)}`, value = await this.storage.get<Session>(key);
    if (!value || value.expiresAt <= Date.now() || value.userId !== this.env.ALLOWED_GITHUB_USER_ID) throw new ApiFailure(401, 'Přihlášení správce chybí nebo vypršelo.');
    if (mutation && await sha256(request.headers.get('x-csrf-token') ?? '') !== value.csrfHash) throw new ApiFailure(403, 'Nesouhlasí ochrana publikační relace.');
    return { key, value };
  }
  private async login(request: Request): Promise<Response> {
    await this.rate(request, 'login', 10, 600000);
    const state = randomToken(), verifier = randomToken(), redirectUri = new URL('/auth/callback', request.url).href;
    await this.expiring(`flow:${await sha256(state)}`, { expiresAt: Date.now() + 600000, verifier, redirectUri } as Flow);
    const authorize = new URL('https://github.com/login/oauth/authorize');
    const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    authorize.search = new URLSearchParams({ client_id: this.env.GITHUB_CLIENT_ID, redirect_uri: redirectUri, state, code_challenge: challenge, code_challenge_method: 'S256' }).toString();
    return new Response(null, { status: 302, headers: { Location: authorize.href, 'Set-Cookie': flowCookie(state, 600), 'Cache-Control': 'no-store' } });
  }
  private async callback(request: Request): Promise<Response> {
    let stage = 'rate-limit';
    try {
    await this.rate(request, 'callback', 15, 600000);
    stage = 'validate-github-return';
    const url = new URL(request.url), state = url.searchParams.get('state') ?? '', code = url.searchParams.get('code') ?? '';
    if (!/^[A-Za-z0-9_-]{43}$/.test(state) || cookie(request, '__Host-jetlag-oauth') !== state || !code || code.length > 1024) throw new ApiFailure(403, 'OAuth přihlášení nemá platné state nebo vazbu prohlížeče.');
    const key = `flow:${await sha256(state)}`;
    stage = 'consume-oauth-flow';
    const flow = await this.storage.transaction(async tx => { const value = await tx.get<Flow>(key); if (!value || value.expiresAt <= Date.now()) throw new ApiFailure(403, 'OAuth požadavek vypršel nebo již byl použit.'); await tx.delete(key); return value; });
    stage = 'exchange-github-code';
    const response = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'JetLagPrague-publisher' }, body: new URLSearchParams({ client_id: this.env.GITHUB_CLIENT_ID, client_secret: this.env.GITHUB_CLIENT_SECRET, code, code_verifier: flow.verifier, redirect_uri: flow.redirectUri }) });
    if (!response.ok) throw new ApiFailure(502, 'GitHub OAuth není dostupné.');
    stage = 'decode-github-token';
    const result = await response.json() as { access_token?: string }; if (!result.access_token) throw new ApiFailure(401, 'GitHub nepovolil přihlášení.');
    stage = 'request-github-identity';
    const userResponse = await fetch('https://api.github.com/user', { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${result.access_token}`, 'User-Agent': 'JetLagPrague-publisher' } });
    if (!userResponse.ok) throw new ApiFailure(401, 'Nelze ověřit GitHub účet.');
    stage = 'decode-github-identity';
    const user = await userResponse.json() as { id: number; login: string };
    if (String(user.id) !== this.env.ALLOWED_GITHUB_USER_ID) throw new ApiFailure(403, 'Tento GitHub účet nemá oprávnění publikovat.');
    const token = randomToken(), csrf = randomToken(), expiresAt = Date.now() + 15 * 60000;
    stage = 'store-publisher-session';
    await this.expiring(`session:${await sha256(token)}`, { expiresAt, userId: String(user.id), login: user.login, csrfHash: await sha256(csrf) } as Session);
    stage = 'build-popup-response';
    const nonce = randomToken(); const data = JSON.stringify({ type: 'jetlag-publisher-session', token, csrf, expiresAt, login: user.login }).replace(/</g, '\\u003c');
    return new Response(`<!doctype html><html lang="cs"><meta charset="utf-8"><title>Přihlášení správce</title><p>Přihlášení bylo ověřeno. Vraťte se do editoru.</p><script nonce="${nonce}">if(window.opener){window.opener.postMessage(${data},${JSON.stringify(this.env.ALLOWED_ORIGIN)});window.close();}</script></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': flowCookie('', 0), 'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'`, 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } });
    } catch (error) {
      // Never log OAuth query parameters, cookies, access tokens, secrets or raw errors.
      console.error('publisher.oauth.callback.failed', {
        stage,
        errorType: error instanceof Error ? error.name : typeof error,
        status: error instanceof ApiFailure ? error.status : undefined,
      });
      throw error;
    }
  }
  private async publication(request: Request) {
    await this.session(request); await this.rate(request, 'read', 60, 60000);
    const github = new GitHubClient(this.env), commit = await github.head(), text = await github.file('data/releases/current.json', commit);
    return json({ commit, index: text ? readGameReleaseIndex(JSON.parse(text)) : null, deployment: await github.deployment(commit) });
  }
  private async publish(request: Request, rollback = false): Promise<Response> {
    await this.session(request, true); await this.rate(request, 'publish', 10, 600000);
    const input = await body(request);
    const data = rollback ? rollbackSchema.parse(input) : requestSchema.parse(input);
    let release = !rollback ? await verifyGameDataRelease((data as z.infer<typeof requestSchema>).release) : null;
    if (release) {
      const issues = gamePublicationErrors(release); if (issues.length) throw new ApiFailure(422, issues.slice(0, 10).join(' '));
      // Timestamp comes from the server; content ID is independent of time.
      release = await createGameDataRelease(release.data, { publishedAt: new Date().toISOString(), kind: 'approved' });
    }
    const lease = randomToken();
    await this.storage.transaction(async tx => { const lock = await tx.get<{ expiresAt: number }>('publish-lock'); if (lock && lock.expiresAt > Date.now()) throw new ApiFailure(409, 'Jiná publikace právě probíhá.'); await tx.put('publish-lock', { lease, expiresAt: Date.now() + 180000 }); });
    try {
      const github = new GitHubClient(this.env), current = await github.head();
      if (current !== data.expectedCommit) throw new ApiFailure(409, 'Repozitář se změnil. Znovu načtěte publikaci a porovnejte data.');
      const text = await github.file('data/releases/current.json', current), previous = text ? readGameReleaseIndex(JSON.parse(text)) : null;
      let index: GameReleaseIndex, files: { path: string; text: string }[] = [];
      if (rollback) {
        const entry = previous?.versions.find(entry => entry.releaseId === (data as z.infer<typeof rollbackSchema>).releaseId);
        if (!entry) throw new ApiFailure(404, 'Předchozí verze neexistuje v historii.');
        if (previous!.current.releaseId === entry.releaseId) throw new ApiFailure(409, 'Tato verze je již aktuální.');
        const artifact = await github.file(`data/releases/${entry.file}`, current); if (!artifact) throw new ApiFailure(422, 'Předchozí verze není kompletní.');
        await readGameReleaseArtifact(artifact, entry); index = { ...previous!, current: entry };
      } else {
        if (previous?.versions.some(entry => entry.releaseId === release!.releaseId)) throw new ApiFailure(409, 'Identický dataset již byl publikován. Pro starší verzi použijte návrat publikace.');
        const catalogData = await github.repo('/contents/pid/index.json?ref=pid-data') as { content?: string; encoding?: string };
        if (catalogData.encoding !== 'base64' || !catalogData.content) throw new ApiFailure(502, 'Nelze ověřit centrální verzi PID.');
        const catalog = readPidCatalog(JSON.parse(new TextDecoder().decode(decodeBase64(catalogData.content))));
        const pid = catalog.versions?.find(entry => entry.checksum === catalog.checksum);
        if (!pid || pid.checksum !== release!.data.pidSnapshot.checksum || pid.serviceDate !== pragueDate() || pid.quality !== 'verified' || pid.id !== release!.data.pidSnapshot.id || pid.adapterVersion !== release!.data.pidSnapshot.adapterVersion) throw new ApiFailure(409, 'PID neodpovídá aktuální ověřené centrální verzi. Aktualizujte zdroj před publikací.');
        const entry = await releaseEntry(release!);
        if (await github.file(`data/releases/${entry.file}`, current)) throw new ApiFailure(409, 'Neměnný soubor této verze již existuje; nebyl přepsán.');
        files.push({ path: `data/releases/${entry.file}`, text: canonicalJson(release) });
        index = { format: 'jetlag-prague-game-catalog', schemaVersion: 1, current: entry, versions: [...(previous?.versions ?? []), entry] };
      }
      readGameReleaseIndex(index);
      files = [...files, { path: 'data/releases/current.json', text: `${JSON.stringify(index, null, 2)}\n` }];
      const commit = await github.commit(current, files, `${rollback ? 'Restore' : 'Publish'} game data ${index.current.releaseId}`);
      return json({ commit, releaseId: index.current.releaseId, status: 'pending-deployment', message: 'Data jsou v repozitáři. Veřejná hra je použije až po úspěšném nasazení Pages.' }, 202);
    } finally { await this.storage.transaction(async tx => { const lock = await tx.get<{ lease: string }>('publish-lock'); if (lock?.lease === lease) await tx.delete('publish-lock'); }); }
  }
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    try {
      if (path === '/status' && request.method === 'GET') return json({ configured: configured(this.env), repository: 'Wondrej89/JetLagPrague' });
      if (!configured(this.env)) throw new ApiFailure(503, 'Publikace není nakonfigurována.');
      await this.rate(request, 'api', 120, 60000);
      if (path === '/auth/start' && request.method === 'GET') return await this.login(request);
      if (path === '/auth/callback' && request.method === 'GET') return await this.callback(request);
      if (path === '/session' && request.method === 'GET') { const { value } = await this.session(request); return json({ login: value.login, userId: value.userId, expiresAt: value.expiresAt }); }
      if (path === '/logout' && request.method === 'POST') { const { key } = await this.session(request, true); await this.storage.delete(key); return json({ loggedOut: true }); }
      if (path === '/publication' && request.method === 'GET') return await this.publication(request);
      if (path === '/publish' && request.method === 'POST') return await this.publish(request);
      if (path === '/rollback' && request.method === 'POST') return await this.publish(request, true);
      return json({ error: 'Endpoint neexistuje.' }, 404);
    } catch (error) {
      // Finish/cancel the forwarded body before an early rejection returns from the DO.
      if (request.body && !request.body.locked) await request.body.cancel().catch(() => {});
      if (error instanceof ApiFailure) return json({ error: error.message }, error.status);
      if (error instanceof z.ZodError) return json({ error: 'Návrh nemá povolenou strukturu nebo obsahuje nepovolená pole.' }, 400);
      return json({ error: error instanceof Error && /kontrolní součet|identit|release|geometri|bod|publikac|katalog|ARP/i.test(error.message) ? error.message : 'Publikační služba operaci nedokončila. Zkontrolujte konfiguraci a zkuste ji znovu.' }, 422);
    }
  }
}
export default {
  async fetch(request: Request, env: PublisherEnvironment): Promise<Response> {
    const origin = request.headers.get('origin');
    if (origin && origin !== env.ALLOWED_ORIGIN) return json({ error: 'Nepovolený origin.' }, 403);
    const headers = { 'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-CSRF-Token', 'Access-Control-Max-Age': '600', Vary: 'Origin' };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    try {
      const response = await env.COORDINATOR.get(env.COORDINATOR.idFromName('publisher-Wondrej89-JetLagPrague')).fetch(request);
      const result = new Response(response.body, response); Object.entries(headers).forEach(([key, value]) => result.headers.set(key, value)); return result;
    } catch { const response = json({ error: 'Publikační služba není dostupná. Lokální draft zůstává zachovaný.' }, 503); Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value)); return response; }
  },
};
