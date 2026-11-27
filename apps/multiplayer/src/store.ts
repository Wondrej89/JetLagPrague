import type { GameState } from '../../../packages/game-core/src/types';
import type { TeamId } from '../../../packages/game-core/src/match-types';
import type { Sql } from './platform';

export interface Seat {
  tokenHash: string;
  recoveryHash: string;
  connection?: string;
  lastSeenAt?: number;
}

export interface Room {
  id: string;
  code: string;
  expiresAt: number;
  revision: number;
  reference: boolean;
  seats: Partial<Record<TeamId, Seat>>;
  game: GameState;
  previousRound?: GameState;
}

const chunkSize = 96 * 1024;
export function setupStore(sql: Sql) {
  sql.exec('CREATE TABLE IF NOT EXISTS payload (key TEXT, part INTEGER, bytes BLOB, PRIMARY KEY (key, part))');
  sql.exec('CREATE TABLE IF NOT EXISTS command (id TEXT PRIMARY KEY, team TEXT, game TEXT, fingerprint TEXT)');
  sql.exec('CREATE TABLE IF NOT EXISTS ticket (hash TEXT PRIMARY KEY, team TEXT, generation TEXT, expires INTEGER)');
  sql.exec('CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, owner TEXT, mime TEXT, size INTEGER)');
  sql.exec('CREATE TABLE IF NOT EXISTS budget (name TEXT PRIMARY KEY, expires INTEGER, count INTEGER)');
}

export function putPayload(sql: Sql, key: string, bytes: Uint8Array<ArrayBuffer>) {
  sql.exec('DELETE FROM payload WHERE key = ?', key);
  for (let start = 0; start < bytes.length; start += chunkSize)
    sql.exec('INSERT INTO payload VALUES (?, ?, ?)', key, start, bytes.slice(start, start + chunkSize).buffer);
}

export function getPayload(sql: Sql, key: string): Uint8Array<ArrayBuffer> | undefined {
  const chunks = [...sql.exec<{ bytes: ArrayBuffer }>('SELECT bytes FROM payload WHERE key = ? ORDER BY part', key)];
  if (!chunks.length) return undefined;
  const output = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.bytes.byteLength, 0));
  let start = 0;
  for (const { bytes } of chunks) { output.set(new Uint8Array(bytes), start); start += bytes.byteLength; }
  return output;
}

export function getRoom(sql: Sql): Room | undefined {
  const bytes = getPayload(sql, 'room');
  if (bytes) return JSON.parse(new TextDecoder().decode(bytes));
}

export function putRoom(sql: Sql, room: Room) {
  putPayload(sql, 'room', new TextEncoder().encode(JSON.stringify(room)));
}

export function clearRoom(sql: Sql) {
  for (const statement of ['DELETE FROM payload','DELETE FROM command','DELETE FROM ticket','DELETE FROM media','DELETE FROM budget'])
    sql.exec(statement);
}

export function allowed(sql: Sql, name: string, now: number, limit: number, interval: number) {
  const [entry] = sql.exec<{ expires: number; count: number }>('SELECT expires, count FROM budget WHERE name = ?', name);
  const active = entry && entry.expires > now;
  if (active && entry.count >= limit) return false;
  sql.exec('INSERT OR REPLACE INTO budget VALUES (?, ?, ?)', name, active ? entry.expires : now + interval, active ? entry.count + 1 : 1);
  return true;
}
