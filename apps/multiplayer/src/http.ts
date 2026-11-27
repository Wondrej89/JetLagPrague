import { sha256 } from '../../../packages/geo-core/src/pid-snapshot';

export class RequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export function requireRequest(ok: unknown, status: number, message: string): asserts ok {
  if (!ok) throw new RequestError(status, message);
}

export function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

export function errorResponse(error: unknown) {
  return error instanceof RequestError ? json({ error: error.message }, error.status) : json({ error: 'Herní server požadavek nedokončil. Zkuste to znovu.' }, 503);
}

export async function bytes(request: Request, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  requireRequest(Number(request.headers.get('Content-Length')) <= limit, 413, 'Soubor nebo požadavek je příliš velký.');
  const stream = request.body?.getReader();
  requireRequest(stream, 400, 'Chybí obsah požadavku.');
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { value, done } = await stream.read();
      if (done) break;
      total += value.byteLength;
      requireRequest(total <= limit, 413, 'Soubor nebo požadavek je příliš velký.');
      chunks.push(value);
    }
  } catch (error) {
    await stream.cancel().catch(() => {});
    throw error;
  } finally { stream.releaseLock(); }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

export async function readJson(request: Request): Promise<unknown> {
  requireRequest(request.headers.get('Content-Type')?.split(';')[0] === 'application/json', 415, 'Očekáván JSON požadavek.');
  const body = await bytes(request, 24 * 1024);
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)); }
  catch { throw new RequestError(400, 'Požadavek nemá platný formát JSON.'); }
}

export const secretPattern = /^[A-Za-z0-9_-]{43}$/;
export function randomSecret() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export async function bearerHash(request: Request) {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  requireRequest(secretPattern.test(token), 401, 'Platná týmová relace je nutná.');
  return sha256(token);
}

export function randomCode() {
  let code = '';
  while (code.length < 4) {
    for (const value of crypto.getRandomValues(new Uint8Array(8))) {
      if (value < 234) code += String.fromCharCode(65 + value % 26);
      if (code.length === 4) break;
    }
  }
  return code;
}
