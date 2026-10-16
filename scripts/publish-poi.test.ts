import { test, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { applyParkUpdate, decidePoi, defaultPoiConfiguration, exportWorld, importParkGeoJson, newWorld } from '../packages/geo-core/src/index';

const root = resolve(import.meta.dirname, '..');
test('static publication preserves airport catalog, includes approved decisions and rejects undocumented licenses without modifying output', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'jetlag-poi-publication-'));
  try {
    const target = join(temp, 'apps/editor/src/data/poi-catalog.json');
    await mkdir(resolve(target, '..'), { recursive: true });
    const catalog = await readFile(join(root, 'apps/editor/src/data/poi-catalog.json'), 'utf8');
    await writeFile(target, catalog);
    const file = JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', id: 'stable', properties: { name: 'Syntetický testovací park' }, geometry: { type: 'Polygon', coordinates: [[[14.4, 50], [14.41, 50], [14.41, 50.01], [14.4, 50.01], [14.4, 50]]] } }] });
    const baseSource = { id: 'synthetic', provider: 'Test', url: 'https://example.test/parks', dataDate: null, retrievedAt: '2026-10-16T10:00:00Z', verification: 'user_supplied' as const, note: 'Syntetický test' };
    const dataset = await importParkGeoJson(file, { source: { ...baseSource, license: { name: 'Nedoložena', url: null } }, idField: '$id', nameField: 'name' });
    const world = newWorld(); world.poi = decidePoi(applyParkUpdate(defaultPoiConfiguration(), dataset), dataset.records[0], { status: 'approved' });
    const input = join(temp, 'world.json'); await writeFile(input, exportWorld(world));
    const run = () => execFileSync(process.execPath, [join(root, 'node_modules/tsx/dist/cli.mjs'), join(root, 'scripts/publish-poi.ts'), '--world', input], { cwd: temp, stdio: 'pipe' }).toString();
    expect(run).toThrow(); expect(await readFile(target, 'utf8')).toBe(catalog);
    const licensed = await importParkGeoJson(file, { source: { ...baseSource, license: { name: 'CC0 (syntetická fixture)', url: 'https://creativecommons.org/publicdomain/zero/1.0/' } }, idField: '$id', nameField: 'name' });
    world.poi = applyParkUpdate(world.poi, licensed); await writeFile(input, exportWorld(world));
    expect(run()).toContain('1 schválených parků');
    const result = JSON.parse(await readFile(target, 'utf8'));
    expect(result.airports).toEqual(JSON.parse(catalog).airports);
    expect(result.parks.decisions).toEqual(world.poi.decisions); expect(result.parks.sources[0].checksum).toBe(licensed.checksum);
  } finally { await rm(temp, { recursive: true, force: true }); }
}, 15000);
