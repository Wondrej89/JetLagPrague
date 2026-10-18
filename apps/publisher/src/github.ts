export const TARGET_REPOSITORY = 'Wondrej89/JetLagPrague';
export const TARGET_BRANCH = 'main';
export const RELEASE_DIRECTORY = 'data/releases/';
export interface GitHubEnvironment { GITHUB_APP_ID: string; GITHUB_CLIENT_ID: string; GITHUB_CLIENT_SECRET: string; GITHUB_INSTALLATION_ID: string; GITHUB_APP_PRIVATE_KEY: string; REPOSITORY_ID: string }
export class ApiFailure extends Error { constructor(public readonly status: number, message: string) { super(message); } }
export function base64(bytes: Uint8Array): string { let value = ''; for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(value); }
export function decodeBase64(value: string): Uint8Array { return Uint8Array.from(atob(value.replace(/\s/g, '')), character => character.charCodeAt(0)); }
export function base64url(bytes: Uint8Array): string { return base64(bytes).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); }
export function randomToken(): string { return base64url(crypto.getRandomValues(new Uint8Array(32))); }
function der(tag: number, bytes: Uint8Array): Uint8Array {
  let length: number[] = [bytes.length];
  if (bytes.length > 127) { const sizes: number[] = []; let size = bytes.length; while (size) { sizes.unshift(size & 255); size >>>= 8; } length = [128 | sizes.length, ...sizes]; }
  return new Uint8Array([tag, ...length, ...bytes]);
}
export async function githubAppJwt(environment: GitHubEnvironment, now = Date.now()): Promise<string> {
  const pem = environment.GITHUB_APP_PRIVATE_KEY, raw = decodeBase64(pem.replace(/-----[^-]+-----/g, ''));
  const pkcs8 = pem.includes('BEGIN RSA PRIVATE KEY')
    ? der(48, new Uint8Array([2, 1, 0, 48, 13, 6, 9, 42, 134, 72, 134, 247, 13, 1, 1, 1, 5, 0, ...der(4, raw)])) : raw;
  const key = await crypto.subtle.importKey('pkcs8', new Uint8Array(pkcs8).buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const encode = (data: unknown) => base64url(new TextEncoder().encode(JSON.stringify(data)));
  const token = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: environment.GITHUB_APP_ID, iat: Math.floor(now / 1000) - 60, exp: Math.floor(now / 1000) + 540 })}`;
  return `${token}.${base64url(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(token))))}`;
}
export class GitHubClient {
  private token: string | null = null;
  constructor(private environment: GitHubEnvironment) {}
  private async call(path: string, token: string, method = 'GET', body?: unknown, raw = false): Promise<unknown> {
    const response = await fetch(`https://api.github.com${path}`, { method, redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'JetLagPrague-publisher', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (response.status === 404) throw new ApiFailure(404, 'Soubor nebo oprávnění GitHub není dostupné.');
    if (!response.ok) throw new ApiFailure(response.status === 409 || response.status === 422 ? 409 : 502, `GitHub API odmítlo operaci (HTTP ${response.status}); veřejná publikace nebyla potvrzena.`);
    return response.status === 204 ? null : raw ? new TextDecoder('utf-8', { fatal: true }).decode(await response.arrayBuffer()) : response.json();
  }
  async installationToken(): Promise<string> {
    if (this.token) return this.token;
    const jwt = await githubAppJwt(this.environment);
    const response = await this.call(`/app/installations/${this.environment.GITHUB_INSTALLATION_ID}/access_tokens`, jwt, 'POST', { repository_ids: [Number(this.environment.REPOSITORY_ID)], permissions: { contents: 'write', actions: 'read' } }) as { token?: string; repositories?: { id: number; full_name: string }[] };
    if (!response.token || response.repositories?.length !== 1 || String(response.repositories[0].id) !== this.environment.REPOSITORY_ID || response.repositories[0].full_name !== TARGET_REPOSITORY) throw new ApiFailure(403, 'GitHub App nemá přesně povolený repozitář.');
    this.token = response.token; return this.token;
  }
  async repo(path: string, method = 'GET', body?: unknown, raw = false): Promise<unknown> {
    if (!path.startsWith('/') || path.includes('..') || path.includes('://')) throw new ApiFailure(403, 'Nepovolená cesta GitHub API.');
    return this.call(`/repos/${TARGET_REPOSITORY}${path}`, await this.installationToken(), method, body, raw);
  }
  async head(): Promise<string> { const value = await this.repo(`/git/ref/heads/${TARGET_BRANCH}`) as { object: { sha: string } }; if (!/^[a-f0-9]{40}$/.test(value.object?.sha)) throw new ApiFailure(502, 'GitHub vrátil neplatnou revizi.'); return value.object.sha; }
  async file(path: string, sha: string): Promise<string | null> {
    if (!/^data\/releases\/(?:current\.json|release-[a-f0-9]{64}\.json)$/.test(path)) throw new ApiFailure(403, 'Nepovolená datová cesta.');
    try {
      return await this.call(`/repos/${TARGET_REPOSITORY}/contents/${path}?ref=${sha}`, await this.installationToken(), 'GET', undefined, true) as string;
    } catch (error) { if (error instanceof ApiFailure && error.status === 404) return null; throw error; }
  }
  async commit(expected: string, files: { path: string; text: string }[], message: string): Promise<string> {
    if (files.some(file => !/^data\/releases\/(?:current\.json|release-[a-f0-9]{64}\.json)$/.test(file.path))) throw new ApiFailure(403, 'Zápis mimo herní publikace je zakázán.');
    if (!/^[a-f0-9]{40}$/.test(expected) || files.length < 1 || files.length > 2 || new Set(files.map(file => file.path)).size !== files.length) throw new ApiFailure(400, 'Neplatná atomická publikace.');
    // GitHub performs this compare-and-swap atomically, including branch rewinds.
    const result = await this.call('/graphql', await this.installationToken(), 'POST', {
      query: 'mutation($input:CreateCommitOnBranchInput!){createCommitOnBranch(input:$input){commit{oid}}}',
      variables: { input: { branch: { repositoryNameWithOwner: TARGET_REPOSITORY, branchName: TARGET_BRANCH }, expectedHeadOid: expected, message: { headline: message }, fileChanges: { additions: files.map(file => ({ path: file.path, contents: base64(new TextEncoder().encode(file.text)) })) } } },
    }) as { data?: { createCommitOnBranch?: { commit: { oid: string } } }; errors?: { type?: string }[] };
    if (result.errors?.length) throw new ApiFailure(result.errors.some(error => error.type === 'STALE_DATA') ? 409 : 502, 'GitHub atomickou publikaci odmítl; obnovte stav repozitáře.');
    const sha = result.data?.createCommitOnBranch?.commit.oid;
    if (!sha || !/^[a-f0-9]{40}$/.test(sha)) throw new ApiFailure(502, 'GitHub nepotvrdil commit publikace.');
    return sha;
  }

  async deployment(sha: string) {
    const runs = await this.repo(`/actions/workflows/pages.yml/runs?head_sha=${sha}&per_page=5`) as { workflow_runs?: { head_sha: string; status: string; conclusion: string | null; html_url: string }[] };
    const run = runs.workflow_runs?.find(run => run.head_sha === sha);
    return run ? { status: run.status, conclusion: run.conclusion, url: run.html_url } : null;
  }
}
