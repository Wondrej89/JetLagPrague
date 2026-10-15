import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';
import { afterEach, expect, it } from 'vitest';
import { readPidInput } from './pid-input';

const directories: string[] = [];
async function directory() { const path = await mkdtemp(join(tmpdir(), 'jetlag-pid-input-test-')); directories.push(path); return path; }
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
const name = 'Linky_7d_WGS84.json';
const original = '{"type":"FeatureCollection","features":[],"label":"Žluťoučký test"}\r\n';

it('reads the same original bytes from JSON, ZIP and GZIP, preserving the original checksum', async () => {
  const expected = createHash('sha256').update(original).digest('hex');
  for (const format of ['json', 'zip', 'gz']) {
    const path = await directory();
    const filename = format === 'json' ? name : `${name}.${format}`;
    const bytes = format === 'json' ? original : format === 'zip' ? zipSync({ [`nested/${name}`]: strToU8(original) }) : gzipSync(original);
    await writeFile(join(path, filename), bytes);
    const result = await readPidInput(path, name);
    expect(result.json).toEqual(JSON.parse(original)); expect(result.sha256).toBe(expected);
    expect(result.sourceFile).toBe(filename); expect(result.bytes).toBe(Buffer.byteLength(original));
    expect(result.containerSha256 === null).toBe(format === 'json');
  }
});
it('does not extract archive paths and ignores unrelated entries', async () => {
  const path = await directory();
  await writeFile(join(path, 'routes.zip'), zipSync({ [`nested/${name}`]: strToU8(original), '../unwanted-file': strToU8('never extract') }));
  const result = await readPidInput(path, name);
  expect(result.archiveEntry).toBe(`nested/${name}`);
  await expect(access(join(path, 'nested'))).rejects.toThrow();
  await expect(access(join(path, '../unwanted-file'))).rejects.toThrow();
});
it('keeps empty placeholders and uses a real ZIP when one is supplied', async () => {
  const path = await directory(); await writeFile(join(path, 'stops.json'), '\r\n');
  await expect(readPidInput(path, 'stops.json')).rejects.toThrow('je prázdný');
  await writeFile(join(path, 'stops.zip'), zipSync({ 'stops.json': strToU8('{"synthetic":true}') }));
  const result = await readPidInput(path, 'stops.json');
  expect(result.ignoredEmptyFiles).toEqual(['stops.json']); expect(result.json).toEqual({ synthetic: true });
  expect(await readFile(join(path, 'stops.json'), 'utf8')).toBe('\r\n');
});
it('refuses conflicting snapshots instead of choosing one silently', async () => {
  const path = await directory(); await writeFile(join(path, name), original);
  await writeFile(join(path, 'changed.zip'), zipSync({ [name]: strToU8('{"changed":true}') }));
  await expect(readPidInput(path, name)).rejects.toThrow('více rozdílných verzí');
});
it('reports missing, malformed JSON and damaged ZIP as errors', async () => {
  const path = await directory();
  await expect(readPidInput(path, name)).rejects.toThrow('Chybí');
  await writeFile(join(path, name), '<html>not data</html>');
  await expect(readPidInput(path, name)).rejects.toThrow('neplatný UTF-8 JSON');
  await rm(join(path, name)); await writeFile(join(path, 'bad.zip'), 'not a zip');
  await expect(readPidInput(path, name)).rejects.toThrow('neplatný ZIP');
});
