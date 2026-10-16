import { expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';
import { analyzeParkFile, readParkFile, type ParkImportOptions } from './park-import';
import { applyParkUpdate, decidePoi, defaultPoiConfiguration, exportWorld, importWorld, newWorld, resolvePois, validateGeometry, verifyParkDataset } from './index';
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
test('duplicate identities are explicit, deterministic across reorder and geometry updates, preserve decisions and require manual review for ambiguous attributes', async () => {
  const rows = [{ id: 0, name: 'Část A', geometry: fixtureArea }, { id: 0, name: 'Část B', geometry: fixtureArea }];
  const file = await readParkFile(shapeZip(rows), filename);
  const unresolved = await analyzeParkFile(file, options); expect(unresolved.duplicates).toHaveLength(2); expect(unresolved.candidate).toBeNull();
  const first = (await analyzeParkFile(file, { ...options, confirmDuplicateIds: true })).candidate!;
  let config = applyParkUpdate(defaultPoiConfiguration(), first); config = decidePoi(config, first.records[0], { status: 'approved' }); config = decidePoi(config, first.records[1], { status: 'excluded' });
  const changed = structuredClone(rows).reverse(); changed[0].geometry.coordinates[0][1][1] += 0.001;
  const second = (await analyzeParkFile(await readParkFile(shapeZip(changed), filename), { ...options, confirmDuplicateIds: true })).candidate!;
  expect(second.records.map(r => r.id).sort()).toEqual(first.records.map(r => r.id).sort());
  config = applyParkUpdate(config, second); expect(resolvePois([], config).map(r => r.status).sort()).toEqual(['approved', 'excluded']);
  const same = await readParkFile(shapeZip([rows[0], rows[0]]), filename); const ambiguous = await analyzeParkFile(same, { ...options, confirmDuplicateIds: true }); expect(ambiguous.candidate).toBeNull(); expect(ambiguous.duplicates.every(r => r.ambiguous)).toBe(true);
  const manual = await analyzeParkFile(same, { ...options, confirmDuplicateIds: true, identities: { 1: 'curated-a', 2: 'curated-b' } }); expect(manual.candidate?.records).toHaveLength(2);
});
test('reports every invalid geometry with original ID, name and row; only explicitly selected lossless repairs are audited', async () => {
  const wrong = { type: 'Polygon', coordinates: [[[14.4, 50], [14.42, 50.02], [14.42, 50], [14.4, 50.02], [14.4, 50]]] };
  const file = await readParkFile(strToU8(JSON.stringify({ type: 'FeatureCollection', features: [1, 2].map(ID => ({ type: 'Feature', properties: { ID, NAZEV: `Špatný park ${ID}` }, geometry: wrong })) })), 'wrong.json');
  const report = await analyzeParkFile(file, options); expect(report.candidate).toBeNull(); expect(report.issues).toHaveLength(2); expect(report.issues[1]).toMatchObject({ row: 2, sourceId: '2', name: 'Špatný park 2' });
  const malformed = await readParkFile(strToU8(JSON.stringify({ type: 'FeatureCollection', features: [1, 2].map(ID => ({ type: 'Feature', properties: { ID, NAZEV: `Vadná struktura ${ID}` }, geometry: ID === 1 ? { type: 'Polygon', coordinates: null } : 'malformed geometry' })) })), 'malformed.json');
  const malformedReport = await analyzeParkFile(malformed, options); expect(malformedReport.issues).toHaveLength(2); expect(malformedReport.candidate).toBeNull();
  const repeated = structuredClone(fixtureArea); repeated.coordinates[0].splice(1, 0, repeated.coordinates[0][0]);
  const repeatedFile = await readParkFile(strToU8(JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { ID: 3 }, geometry: repeated }] })), 'repeated.json');
  const repaired = await analyzeParkFile(repeatedFile, { ...options, removeRepeatedVertices: true }); expect(repaired.repairs).toEqual([{ row: 1, removedVertices: 1 }]); expect(repaired.candidate).not.toBeNull();
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
test.skipIf(!process.env.PARKS_ZIP)('real IPR ZIP contains all 953 objects and a complete diagnostic report', async () => {
  const file = await readParkFile(new Uint8Array(await readFile(process.env.PARKS_ZIP!)), filename);
  expect(file.features).toHaveLength(953); expect(file.originalCrs).toContain('S-JTSK');
  const report = await analyzeParkFile(file, options); expect(report.valid + report.invalid).toBe(953);
  expect(file.features.some(feature => /[áčďéěíňóřšťúůýž]/i.test(String(feature.properties.NAZEV)))).toBe(true);
  console.log(JSON.stringify({ objects: file.features.length, valid: report.valid, invalid: report.invalid, duplicates: report.duplicates.length, unnamed: report.unnamed, issues: report.issues.map(({ geometry: _geometry, ...issue }) => { void _geometry; return issue; }) }));
}, 120000);
