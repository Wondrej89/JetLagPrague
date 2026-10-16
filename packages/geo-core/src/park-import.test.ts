import { expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';
import { area, booleanPointInPolygon } from '@turf/turf';
import { parkTopology } from './park-topology';
import { sha256 } from './pid-snapshot';
import { canonicalJson } from './administrative';
import { analyzeParkFile, readParkFile, type ParkImportOptions } from './park-import';
import { applyParkUpdate, decidePoi, defaultPoiConfiguration, exportWorld, importWorld, newWorld, resolvePois, isArea, validateGeometry, verifyParkDataset } from './index';
import { fixtureArea, shapeFiles, shapeZip } from './test-fixtures/park-zip';
const filename = 'MPP_CUR_MPP_100_PARKY_P.zip';
const options: ParkImportOptions = { source: { id: 'ipr-mpp-100-parky', provider: 'Syntetická testovací data, nikoliv IPR', url: 'https://example.test/parks', license: { name: 'Nedoložena', url: null }, dataDate: null, retrievedAt: '2026-10-16T10:00:00Z', verification: 'user_supplied', note: 'Testovací fixture' }, idField: 'ID', nameField: 'NAZEV' };
test('direct ZIP recognizes S-JTSK, decodes Czech names, transforms actual coordinates and preserves original data and checksums', async () => {
  const bytes = shapeZip(); const file = await readParkFile(bytes, filename);
  expect(file.features).toHaveLength(1); expect(file.originalCrs).toContain('S-JTSK'); expect(file.encoding).toBe('utf-8'); expect(file.suggestedId).toBe('ID'); expect(file.suggestedName).toBe('NAZEV');
  const report = await analyzeParkFile(file, options); expect(report.issues).toEqual([]); expect(report.candidate).not.toBeNull();
  const candidate = report.candidate!; expect(candidate.records[0].name).toContain('Ďáblický háj');
  const geometry = candidate.records[0].geometry;
  if (geometry.type !== 'Polygon') throw Error('Expected Polygon');
  expect(geometry.coordinates[0][0][0]).toBeCloseTo(14.4, 6); expect(geometry.coordinates[0][0][1]).toBeCloseTo(50.07, 6);
  expect(file.originalFeatures[0].geometry).not.toEqual(file.features[0].geometry);
  expect(await verifyParkDataset(candidate)).toEqual(candidate);
  const tampered = JSON.parse(JSON.stringify(candidate)); tampered.importRecord.originalCrs = 'changed'; await expect(verifyParkDataset(tampered)).rejects.toThrow(/součet/);
  expect(importWorld(exportWorld({ ...newWorld(), poi: applyParkUpdate(defaultPoiConfiguration(), candidate) }, 'geojson')).poi?.sources[0].importRecord).toEqual(candidate.importRecord);
});
test('supports multipolygon, holes and WGS84 GeoJSON without dropping any part', async () => {
  const hole = [[14.402, 50.072], [14.408, 50.072], [14.408, 50.078], [14.402, 50.078], [14.402, 50.072]];
  const separate = [[[14.43, 50.07], [14.43, 50.08], [14.44, 50.08], [14.44, 50.07], [14.43, 50.07]]];
  const file = await readParkFile(shapeZip([{ id: 1, name: 'Český park', geometry: { type: 'MultiPolygon', coordinates: [[fixtureArea.coordinates[0], hole], separate] } }]), filename);
  const report = await analyzeParkFile(file, options); expect(report.issues).toEqual([]); const geometry = report.candidate!.records[0].geometry;
  expect(geometry.type).toBe('MultiPolygon'); if (geometry.type === 'MultiPolygon') { expect(geometry.coordinates).toHaveLength(2); expect(geometry.coordinates[0]).toHaveLength(2); }
  const input = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { ID: 1, NAZEV: 'Český park' }, geometry: fixtureArea }] };
  const json = await readParkFile(strToU8(JSON.stringify(input)), 'parks.geojson'); expect((await analyzeParkFile(json, options)).candidate!.records[0].geometry).toEqual(fixtureArea);
});
test('same official IDs automatically union, retain all names and attributes, and preserve decisions across reorder and updates', async () => {
  const separate = structuredClone(fixtureArea); separate.coordinates = separate.coordinates.map(ring => ring.map(([x, y]) => [x + 0.03, y]));
  const rows = [{ id: 2773, name: 'Park u OC Letňany II.', geometry: separate }, { id: 2773, name: 'Park u OC Letňany', geometry: fixtureArea }];
  const firstReport = await analyzeParkFile(await readParkFile(shapeZip(rows), filename), options);
  expect(firstReport.issues).toEqual([]); expect(firstReport.merges).toHaveLength(1);
  const first = firstReport.candidate!; expect(first.records).toHaveLength(1);
  const park = first.records[0]; expect(park.id).toBe('park:ipr-mpp-100-parky:2773'); expect(park.name).toBe('Park u OC Letňany');
  expect(park.geometry.type).toBe('MultiPolygon'); if (park.geometry.type === 'MultiPolygon') expect(park.geometry.coordinates).toHaveLength(2);
  expect(park.importAudit?.sourceNames).toEqual(['Park u OC Letňany', 'Park u OC Letňany II.']);
  expect(park.importAudit?.sourceRecords.map(r => r.attributes.ID)).toEqual([2773, 2773]);
  if (!isArea(park.geometry)) throw new Error('Expected area');
  expect(booleanPointInPolygon(park.point, park.geometry, { ignoreBoundary: true })).toBe(true);
  let config = decidePoi(applyParkUpdate(defaultPoiConfiguration(), first), park, { status: 'approved', name: 'Moje jméno', point: park.point, note: 'Ruční rozhodnutí' });
  const changed = structuredClone(rows).reverse(); changed[1].geometry.coordinates[0][1][1] += 0.001;
  const second = (await analyzeParkFile(await readParkFile(shapeZip(changed), filename), options)).candidate!;
  expect(second.records[0].id).toBe(park.id); expect(second.records[0].name).toBe(park.name);
  config = applyParkUpdate(config, second); expect(resolvePois([], config)[0]).toMatchObject({ status: 'approved', name: 'Moje jméno', point: park.point, note: 'Ruční rozhodnutí' });
  config = decidePoi(config, resolvePois([], config)[0], { status: 'excluded' });
  expect(resolvePois([], applyParkUpdate(config, first))[0].status).toBe('excluded');
  const identical = await analyzeParkFile(await readParkFile(shapeZip([rows[0], rows[0]]), filename), options);
  expect(identical.candidate!.records).toHaveLength(1); expect(identical.candidate!.records[0].sourceId).toBe('2773');
});
test('overlapping duplicate polygons use union, not an invalid concatenation; source order does not affect geometry or name', async () => {
  const shifted = structuredClone(fixtureArea); shifted.coordinates = shifted.coordinates.map(ring => ring.map(([x, y]) => [x + 0.01, y]));
  const rows = [{ id: 5, name: 'B', geometry: fixtureArea }, { id: 5, name: 'A', geometry: shifted }];
  const first = (await analyzeParkFile(await readParkFile(shapeZip(rows), filename), options)).candidate!.records[0];
  const second = (await analyzeParkFile(await readParkFile(shapeZip(rows.reverse()), filename), options)).candidate!.records[0];
  expect(first.geometry.type).toBe('Polygon'); expect(first.geometry).toEqual(second.geometry); expect(first.point).toEqual(second.point); expect(first.name).toBe('A');
  expect(area(first.geometry)).toBeGreaterThan(area(fixtureArea)); expect(area(first.geometry)).toBeLessThan(area(fixtureArea) * 2);
});
test('legacy split identities keep their decisions and migrate consensus; conflicts stay review-only', async () => {
  const merged = (await analyzeParkFile(await readParkFile(shapeZip([{ id: 2773, name: 'A', geometry: fixtureArea }, { id: 2773, name: 'B', geometry: fixtureArea }]), filename), options)).candidate!;
  const records = ['old-a', 'old-b'].map(key => ({ ...merged.records[0], id: `park:ipr-mpp-100-parky:${key}`, sourceIdentity: { key, fingerprint: key, method: 'manual' as const, reviewRequired: false } }));
  const old = { ...merged, records }; old.checksum = await sha256(canonicalJson({ source: old.source, records, importRecord: old.importRecord }));
  let config = applyParkUpdate(defaultPoiConfiguration(), old);
  for (const park of records) config = decidePoi(config, park, { status: 'approved', point: park.point, name: 'Původní ruční jméno' });
  const compatible = applyParkUpdate(config, merged);
  expect(resolvePois([], compatible).find(p => p.id === merged.records[0].id)).toMatchObject({ status: 'approved', name: 'Původní ruční jméno', point: records[0].point });
  expect(compatible.manual).toHaveLength(2); expect(compatible.decisions).toHaveLength(3);
  expect(resolvePois([], compatible).filter(p => p.attributes.sourceMergedInto).every(p => p.status === 'excluded')).toBe(true);
  config = decidePoi(config, records[1], { status: 'excluded' });
  const conflicting = applyParkUpdate(config, merged);
  expect(resolvePois([], conflicting).find(p => p.id === merged.records[0].id)?.status).toBe('review');
  expect(conflicting.decisions.slice(0, 2)).toEqual(config.decisions);
  expect(importWorld(exportWorld({ ...newWorld(), poi: conflicting }, 'geojson')).poi).toEqual(conflicting);
});
test('MakeValid retains all polygon parts, revalidates and audits area and checksums; unsafe results block acceptance', async () => {
  const selfTouch = { type: 'Polygon', coordinates: [[...fixtureArea.coordinates[0], [14.4, 50.06], [14.39, 50.06], [14.39, 50.07], [14.4, 50.07]]] };
  const read = (geometry: unknown) => readParkFile(strToU8(JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { ID: 1, NAZEV: 'Syntetický samodotyk' }, geometry }] })), 'self-touch.geojson');
  const report = await analyzeParkFile(await read(selfTouch), options);
  expect(report.issues).toEqual([]); expect(report.repairs).toHaveLength(1); expect(report.repairs[0]).toMatchObject({ accepted: true, sourceId: '1', warning: null });
  const park = report.candidate!.records[0]; expect(park.geometry.type).toBe('MultiPolygon');
  if (park.geometry.type === 'MultiPolygon') expect(park.geometry.coordinates).toHaveLength(2);
  expect(park.importAudit?.repairedRows).toEqual([1]); expect(report.repairs[0].areaDifferenceM2).toBeLessThan(0.01);
  await expect(verifyParkDataset(report.candidate)).resolves.toBeDefined();
  const differentArea = { type: 'Polygon', coordinates: [[...fixtureArea.coordinates[0], [14.39, 50.07], [14.39, 50.06], [14.4, 50.06], [14.4, 50.07]]] };
  const changedArea = await analyzeParkFile(await read(differentArea), options);
  expect(changedArea.candidate).toBeNull(); expect(changedArea.repairs[0].beforeAreaM2).toBeGreaterThan(0);
  expect(changedArea.repairs[0].areaDifferenceM2).toBeGreaterThan(changedArea.repairs[0].areaToleranceM2);
  expect(changedArea.repairs[0].accepted).toBe(false);
  const spike = structuredClone(fixtureArea); spike.coordinates[0].splice(1, 0, [14.39, 50.065], [14.4, 50.07]);
  const collapsed = await analyzeParkFile(await read(spike), options);
  expect(collapsed.candidate).toBeNull(); expect(collapsed.repairs[0]).toMatchObject({ accepted: false, result: { type: 'GeometryCollection' } });
  expect(collapsed.issues[0].message).toMatch(/nepolygonové/);
});
test('reports unsafe and malformed geometries with original IDs without accepting area changes', async () => {
  const wrong = { type: 'Polygon', coordinates: [[[14.4, 50], [14.42, 50.02], [14.42, 50], [14.4, 50.02], [14.4, 50]]] };
  const file = await readParkFile(strToU8(JSON.stringify({ type: 'FeatureCollection', features: [1, 2].map(ID => ({ type: 'Feature', properties: { ID, NAZEV: `Špatný park ${ID}` }, geometry: wrong })) })), 'wrong.json');
  const report = await analyzeParkFile(file, options); expect(report.candidate).toBeNull(); expect(report.issues).toHaveLength(2); expect(report.issues[1]).toMatchObject({ row: 2, sourceId: '2', name: 'Špatný park 2' });
  const malformed = await readParkFile(strToU8(JSON.stringify({ type: 'FeatureCollection', features: [1, 2].map(ID => ({ type: 'Feature', properties: { ID, NAZEV: `Vadná struktura ${ID}` }, geometry: ID === 1 ? { type: 'Polygon', coordinates: null } : 'malformed geometry' })) })), 'malformed.json');
  const malformedReport = await analyzeParkFile(malformed, options); expect(malformedReport.issues).toHaveLength(2); expect(malformedReport.candidate).toBeNull();
  expect(report.repairs.every(repair => !repair.accepted && repair.warning?.includes('Plocha'))).toBe(true);
});
test('OGC validation accepts isolated point contacts, rejects crossings, overlapping components and holes outside the shell', () => {
  const touch = { type: 'MultiPolygon', coordinates: [[[[14.4, 50], [14.41, 50], [14.41, 50.01], [14.4, 50.01], [14.4, 50]]], [[[14.41, 50.01], [14.42, 50.01], [14.42, 50.02], [14.41, 50.02], [14.41, 50.01]]]] };
  expect(() => validateGeometry(touch)).not.toThrow();
  const validTouchingHole = { type: 'Polygon', coordinates: [fixtureArea.coordinates[0], [[14.4, 50.07], [14.405, 50.072], [14.402, 50.077], [14.4, 50.07]]] };
  expect(() => validateGeometry(validTouchingHole)).not.toThrow();
  expect(() => validateGeometry({ type: 'MultiPolygon', coordinates: [fixtureArea.coordinates, fixtureArea.coordinates] })).toThrow();
  expect(() => validateGeometry({ type: 'Polygon', coordinates: [...fixtureArea.coordinates, [[14.5, 50], [14.51, 50], [14.51, 50.01], [14.5, 50.01], [14.5, 50]]] })).toThrow(/Otvor/);
});
test('rejects missing files, unknown CRS/encoding, corrupt indexes, CRC errors, traversal, duplicate paths and bombs', async () => {
  const base = shapeFiles(); const missing = { ...base }; delete (missing as Partial<typeof base>)['MPP_100_Parky_p.shx'];
  await expect(readParkFile(zipSync(missing), filename)).rejects.toThrow(/Chybí/);
  const wrong = shapeFiles(); wrong['MPP_100_Parky_p.shx'][107] ^= 1; await expect(readParkFile(zipSync(wrong), filename)).rejects.toThrow(/SHX/);
  await expect(readParkFile(zipSync({ ...base, '../evil': strToU8('bad') }), filename)).rejects.toThrow(/cesta|Unsafe filename/);
  await expect(readParkFile(zipSync({ ...base, 'mpp_100_parky_p.SHP': base['MPP_100_Parky_p.shp'] }), filename)).rejects.toThrow(/cesta|Unsafe filename/);
  await expect(readParkFile(zipSync({ ...base, 'bomb': new Uint8Array(1024 * 1024) }), filename)).rejects.toThrow(/ZIP bomb/);
  const cp1250 = shapeFiles(); cp1250['MPP_100_Parky_p.cpg'] = strToU8('1250');
  cp1250['MPP_100_Parky_p.dbf'].fill(32, 108, 188); cp1250['MPP_100_Parky_p.dbf'].set([0xc8, 0x65, 0x73, 0x6b, 0xfd, 0x20, 0x70, 0x61, 0x72, 0x6b], 108);
  expect((await readParkFile(zipSync(cp1250), filename)).features[0].properties.NAZEV).toBe('Český park');
  const invalidUtf8 = shapeFiles(); invalidUtf8['MPP_100_Parky_p.dbf'][108] = 255;
  await expect(readParkFile(zipSync(invalidUtf8), filename)).rejects.toThrow(/Objekt 1.*kódování/);
  await expect(readParkFile(zipSync({ ...base, 'MPP_100_Parky_p.cpg': strToU8('INVALID-ENCODING') }), filename)).rejects.toThrow();
  await expect(readParkFile(zipSync({ ...base, 'MPP_100_Parky_p.prj': strToU8('NOT A CRS') }), filename)).rejects.toThrow();
  const bytes = shapeZip(); const corrupted = bytes.slice(); const central = corrupted.findIndex((n, i) => n === 0x50 && corrupted[i + 1] === 0x4b && corrupted[i + 2] === 1 && corrupted[i + 3] === 2); corrupted[central + 16] ^= 1;
  await expect(readParkFile(corrupted, filename)).rejects.toThrow();
});
// Explicit opt-in: no network and no substituted synthetic geometry for this audit.
test.skipIf(!process.env.PARKS_ZIP)('real IPR ZIP: 953 records, three safe repairs, one union, 952 valid parks, interior points and stable decisions', async () => {
  const file = await readParkFile(new Uint8Array(await readFile(process.env.PARKS_ZIP!)), filename);
  expect(file.features).toHaveLength(953); expect(file.originalCrs).toContain('S-JTSK');
  const report = await analyzeParkFile(file, options);
  expect(report.issues).toEqual([]); expect(report.valid).toBe(953); expect(report.invalid).toBe(0);
  expect(report.repairs.map(r => r.sourceId).sort()).toEqual(['2440', '2589', '3121']);
  expect(report.repairs.every(r => r.accepted && r.areaDifferenceM2 < r.areaToleranceM2)).toBe(true);
  expect(report.merges).toHaveLength(1); expect(report.merges[0]).toMatchObject({ sourceId: '2773', names: ['Park u OC Letňany', 'Park u OC Letňany II.'] });
  const dataset = report.candidate!; expect(dataset.records).toHaveLength(952); expect(new Set(dataset.records.map(p => p.id)).size).toBe(952);
  for (const park of dataset.records) {
    expect(() => validateGeometry(park.geometry)).not.toThrow();
    if (!isArea(park.geometry)) throw new Error('Expected area');
    expect(park.point).toHaveLength(2); expect(booleanPointInPolygon(park.point, park.geometry, { ignoreBoundary: true })).toBe(true);
    // Independent GEOS validation of all output, including unchanged polygons.
    await expect(parkTopology(park.geometry, 'validate')).resolves.toHaveProperty('type');
  }
  expect(await verifyParkDataset(dataset)).toEqual(dataset);
  let config = applyParkUpdate(defaultPoiConfiguration(), dataset);
  for (const [i, status] of (['approved', 'excluded'] as const).entries()) config = decidePoi(config, dataset.records[i], { status, point: dataset.records[i].point, note: 'Zachovat po aktualizaci' });
  const again = (await analyzeParkFile(file, options)).candidate!;
  expect(again.records).toEqual(dataset.records);
  const updated = applyParkUpdate(config, again); expect(updated.decisions).toEqual(config.decisions);
  expect(importWorld(exportWorld({ ...newWorld(), poi: updated }, 'geojson')).poi).toEqual(updated);
  expect(report.originalFeatures).toHaveLength(953);
  expect(dataset.importRecord).toMatchObject({ originalChecksum: file.originalChecksum, originalFeatures: file.originalFeatures, repairs: report.repairs });
}, 120000);
