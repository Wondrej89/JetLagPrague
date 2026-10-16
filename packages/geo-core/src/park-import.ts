import { ZipReader, Uint8ArrayReader, type FileEntry } from '@zip.js/zip.js';
import { parseShp, parseDbf } from 'shpjs';
import proj4 from 'proj4';
import type { Geometry as JsonGeometry, FeatureCollection, Position } from 'geojson';
import { canonicalJson } from './administrative';
import { sha256 } from './pid-snapshot';
import { isArea, validateGeometry, type AreaGeometry } from './index';
import { interiorReferencePoint, parkId, poiSchema, poiSourceSchema, type ParkDataset, type Poi, type PoiSource } from './poi';

export const PARK_IMPORT_LIMITS = { archive: 20 * 1024 ** 2, file: 32 * 1024 ** 2, expanded: 64 * 1024 ** 2, entries: 100, ratio: 200, records: 10000, vertices: 1000000 };
export interface ImportFeature { geometry: JsonGeometry | null; properties: Record<string, unknown>; id?: string | number }
export interface ParkFile {
  filename: string; layerName: string; format: 'shapefile-zip' | 'geojson'; originalCrs: string; prj: string | null; cpg: string | null; encoding: string;
  originalChecksum: string; files: { name: string; bytes: number; checksum: string }[];
  features: ImportFeature[]; originalFeatures: ImportFeature[]; fields: string[]; suggestedId: string; suggestedName: string; transformation: string;
}
export type ParkFileInfo = Omit<ParkFile, 'features' | 'originalFeatures'> & { count: number };
export interface ParkImportOptions { source: Omit<PoiSource, 'rawChecksum'>; idField: string; nameField: string; removeRepeatedVertices?: boolean; identities?: Record<string, string>; confirmDuplicateIds?: boolean }
export interface ParkImportIssue { row: number; sourceId: string; name: string; message: string; geometry: AreaGeometry | null }
export interface DuplicateIdentity { row: number; sourceId: string; name: string; fingerprint: string; proposedKey: string; ambiguous: boolean; geometry: AreaGeometry | null }
export interface ParkImportReport { info: ParkFileInfo; valid: number; invalid: number; unnamed: number; duplicates: DuplicateIdentity[]; issues: ParkImportIssue[]; repairs: { row: number; removedVertices: number }[]; candidate: ParkDataset | null }
function fail(message: string): never { throw new Error(message); }
const readText = (bytes: Uint8Array) => new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '').trim();
function jsonValue(value: unknown): unknown {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}` : null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, jsonValue(entry)]));
  return value;
}
async function unzip(bytes: Uint8Array): Promise<Record<string, Uint8Array>> {
  const reader = new ZipReader(new Uint8ArrayReader(bytes), { useWebWorkers: false, checkCrc32: true, checkOverlappingEntry: true });
  const entries: FileEntry[] = []; const paths = new Set<string>(); let declared = 0;
  try {
    for await (const entry of reader.getEntriesGenerator()) {
      const path = entry.filename;
      if (++declared > PARK_IMPORT_LIMITS.entries) fail('ZIP obsahuje příliš mnoho souborů.');
      if (path.includes('\\') || path.includes('\0') || path.startsWith('/') || /^[a-z]:/i.test(path) || path.split('/').some(p => p === '..' || p === '.') || Array.from(path).some(character => character.charCodeAt(0) < 32)) fail(`Podezřelá cesta v ZIPu: ${path}`);
      if (paths.has(path.toLowerCase())) fail(`Duplicitní cesta v ZIPu: ${path}`); paths.add(path.toLowerCase());
      if (entry.encrypted) fail('Šifrované ZIP archivy nejsou podporované.');
      if (!entry.directory) entries.push(entry);
    }
    let total = 0;
    for (const entry of entries) {
      total += entry.uncompressedSize;
      if (entry.uncompressedSize > PARK_IMPORT_LIMITS.file || total > PARK_IMPORT_LIMITS.expanded || entry.uncompressedSize / Math.max(1, entry.compressedSize) > PARK_IMPORT_LIMITS.ratio) fail('ZIP překračuje limit rozbalených dat nebo kompresního poměru (možný ZIP bomb).');
    }
    const result: Record<string, Uint8Array> = Object.create(null); let expanded = 0;
    for (const entry of entries) {
      const chunks: Uint8Array[] = []; let size = 0;
      if (!entry.getData) fail('Neplatný soubor v ZIPu.');
      await entry.getData(new WritableStream<Uint8Array>({ write(chunk) {
        size += chunk.length; expanded += chunk.length;
        if (size > PARK_IMPORT_LIMITS.file || size > entry.uncompressedSize || expanded > PARK_IMPORT_LIMITS.expanded) fail('Skutečná velikost rozbalených dat překročila bezpečný limit.');
        chunks.push(chunk.slice());
      } }), { useWebWorkers: false, checkCrc32: true });
      if (size !== entry.uncompressedSize) fail(`Nesouhlasí velikost souboru ${entry.filename}.`);
      const output = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
      result[entry.filename] = output;
    }
    return result;
  } finally { await reader.close(); }
}
function checkShape(shp: Uint8Array, shx: Uint8Array, dbf: Uint8Array): { count: number; pointCounts: number[] } {
  const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const s = view(shp), x = view(shx), d = view(dbf);
  for (const [bytes, data] of [[shp, s], [shx, x]] as const) {
    if (bytes.length < 100 || data.getInt32(0) !== 9994 || data.getInt32(24) * 2 !== bytes.length || data.getInt32(28, true) !== 1000 || ![5, 15, 25].includes(data.getInt32(32, true))) fail('Neplatná hlavička nebo nepodporovaný polygonový typ SHP/SHX.');
  }
  if (s.getInt32(32, true) !== x.getInt32(32, true) || (shx.length - 100) % 8) fail('Nekonzistentní typ či index SHX.');
  const count = (shx.length - 100) / 8;
  if (!count || count > PARK_IMPORT_LIMITS.records || dbf.length < 33 || d.getUint32(4, true) !== count) fail('Nesouhlasí počet záznamů SHP/SHX/DBF nebo překračuje limit.');
  let expected = 100; const pointCounts: number[] = []; let totalPoints = 0;
  for (let i = 0; i < count; i++) {
    const offset = x.getInt32(100 + i * 8) * 2, length = x.getInt32(104 + i * 8) * 2;
    if (offset !== expected || length < 4 || offset + 8 + length > shp.length || s.getInt32(offset) !== i + 1 || s.getInt32(offset + 4) * 2 !== length) fail(`Nekonzistentní SHX index u objektu ${i + 1}.`);
    if (![0, s.getInt32(32, true)].includes(s.getInt32(offset + 8, true))) fail(`Jiný typ geometrie u objektu ${i + 1}.`);
    if (length > 4 && length < 44) fail(`Objekt ${i + 1}: neúplný polygonový záznam SHP.`);
    if (length > 4) {
      const parts = s.getInt32(offset + 44, true), points = s.getInt32(offset + 48, true);
      pointCounts.push(points); totalPoints += points;
      if (totalPoints > PARK_IMPORT_LIMITS.vertices) fail('Překročen souhrnný limit počtu vrcholů.');
      if (parts < 1 || points < 4 || points > PARK_IMPORT_LIMITS.vertices || 44 + parts * 4 + points * 16 > length) fail(`Poškozený počet vrcholů u objektu ${i + 1}.`);
    }
    if (length === 4) pointCounts.push(0);
    expected = offset + 8 + length;
  }
  if (expected !== shp.length) fail('SHP obsahuje neindexované nebo chybějící záznamy.');
  const header = d.getUint16(8, true), rowSize = d.getUint16(10, true);
  if (header < 33 || (header - 33) % 32 || header + count * rowSize > dbf.length || d.getUint8(header - 1) !== 13) fail('Neplatná struktura DBF.');
  let width = 1;
  for (let offset = 32; offset < header - 1; offset += 32) width += d.getUint8(offset + 16);
  if (width !== rowSize) fail('Nesouhlasí délka atributových řádků DBF.');
  for (let i = 0; i < count; i++) if (d.getUint8(header + i * rowSize) !== 32) fail(`Objekt ${i + 1}: smazaný nebo neplatný DBF řádek; automatické posunutí atributů není přípustné.`);
  return { count, pointCounts };
}
function validateDbfEncoding(bytes: Uint8Array, encoding: string) {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = data.getUint16(8, true), rowSize = data.getUint16(10, true), count = data.getUint32(4, true);
  const decoder = new TextDecoder(encoding, { fatal: true }); let column = 1;
  for (let field = 32; field < header - 1; field += 32) {
    decoder.decode(bytes.subarray(field, field + 11));
    const length = bytes[field + 16], type = String.fromCharCode(bytes[field + 11]);
    if (type === 'C' || type === 'M') for (let row = 0; row < count; row++) {
      try { decoder.decode(bytes.subarray(header + row * rowSize + column, header + row * rowSize + column + length)); }
      catch { fail(`Objekt ${row + 1}: text DBF neodpovídá kódování ${encoding} z CPG.`); }
    }
    column += length;
  }
}
function transformGeometry(geometry: JsonGeometry | null, transform: (point: number[]) => number[]): JsonGeometry | null {
  if (!geometry) return null;
  if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') fail('Vrstva neobsahuje pouze polygonové geometrie.');
  function coordinates(value: unknown): unknown {
    if (!Array.isArray(value)) fail('Poškozené souřadnice.');
    if (typeof value[0] === 'number') {
      if (value.length < 2 || value.some(n => typeof n !== 'number' || !Number.isFinite(n))) fail('Neplatné zdrojové souřadnice.');
      return transform(value);
    }
    return value.map(coordinates);
  }
  return { type: geometry.type, coordinates: coordinates(geometry.coordinates) } as JsonGeometry;
}
function detectFields(features: ImportFeature[]) {
  const fields = [...new Set(features.flatMap(f => Object.keys(f.properties)))];
  return { fields, suggestedId: ['park_id', 'ID'].find(field => fields.includes(field)) ?? (features.every(f => f.id !== undefined) ? '$id' : ''), suggestedName: ['NAZEV', 'name', 'title'].find(field => fields.includes(field)) ?? '' };
}
export function parkFileInfo(file: ParkFile): ParkFileInfo { const { features, originalFeatures: _original, ...info } = file; void _original; return { ...info, count: features.length }; }
export async function readParkFile(bytes: Uint8Array, filename: string): Promise<ParkFile> {
  if (!bytes.length || bytes.length > PARK_IMPORT_LIMITS.archive) fail('Vyberte neprázdný ZIP / GeoJSON nejvýše 20 MB.');
  const originalChecksum = await sha256(bytes);
  if (/\.(geojson|json)$/i.test(filename)) {
    const input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as FeatureCollection & { crs?: unknown };
    if (input?.type !== 'FeatureCollection' || input.crs || !Array.isArray(input.features) || !input.features.length || input.features.length > PARK_IMPORT_LIMITS.records) fail('Očekávána FeatureCollection WGS84 bez CRS, nejvýše 10 000 objektů.');
    const features = input.features.map((f, i) => { if (f?.type !== 'Feature' || (f.properties !== null && (typeof f.properties !== 'object' || Array.isArray(f.properties))) || 'crs' in f || (f.geometry && 'crs' in f.geometry)) fail(`Objekt ${i + 1}: neplatný GeoJSON Feature nebo CRS.`); return { geometry: f.geometry, properties: f.properties ?? {}, ...(f.id === undefined ? {} : { id: f.id }) }; });
    let vertices = 0;
    for (const f of features) {
      const geometry = displayGeometry(f.geometry);
      if (geometry) vertices += geometry.coordinates.flat(geometry.type === 'Polygon' ? 1 : 2).length;
      if (vertices > PARK_IMPORT_LIMITS.vertices) fail('Překročen souhrnný limit počtu vrcholů.');
    }
    return { filename, layerName: filename.replace(/\.(geojson|json)$/i, ''), format: 'geojson', originalCrs: 'WGS84 / EPSG:4326', prj: null, cpg: null, encoding: 'utf-8', originalChecksum, files: [{ name: filename, bytes: bytes.length, checksum: originalChecksum }], features, originalFeatures: features, ...detectFields(features), transformation: 'Bez transformace; vstup RFC 7946 WGS84.' };
  }
  if (!/\.zip$/i.test(filename)) fail('Podporovány jsou ZIP, GeoJSON a JSON.');
  const files = await unzip(bytes), names = Object.keys(files), shapes = names.filter(name => /\.shp$/i.test(name));
  const matches = shapes.filter(name => /(^|\/)MPP_100_Parky_p\.shp$/i.test(name));
  const shape = matches.length === 1 ? matches[0] : shapes.length === 1 ? shapes[0] : fail('ZIP musí obsahovat jednu jednoznačnou polygonovou vrstvu; pro MPP se vybírá MPP_100_Parky_p.');
  const base = shape.slice(0, -4);
  const get = (suffix: string) => { const name = names.find(n => n.toLowerCase() === `${base}.${suffix}`.toLowerCase()); if (!name) fail(`Chybí hlavní soubor ${base}.${suffix}.`); return files[name]; };
  const shp = get('shp'), shx = get('shx'), dbf = get('dbf');
  const { count, pointCounts } = checkShape(shp, shx, dbf); const prj = readText(get('prj')), cpg = readText(get('cpg'));
  if (!prj || !cpg) fail('PRJ ani CPG nesmějí být prázdné; CRS a kódování se neodhadují.');
  const label = /^65001$/.test(cpg) ? 'utf-8' : /^(?:ANSI\s*)?1250$/i.test(cpg) ? 'windows-1250' : cpg;
  const encoding = new TextDecoder(label, { fatal: true }).encoding;
  validateDbfEncoding(dbf, encoding);
  const projection = proj4(prj, 'EPSG:4326'); // Established PROJ-compatible implementation; no custom Krovak formulas.
  const geometries = parseShp(shp.slice().buffer);
  const attributes = parseDbf(dbf.slice().buffer, new TextEncoder().encode(encoding).buffer);
  if (geometries.length !== count || attributes.length !== count) fail('Dekodér nevrátil všechny indexované geometrie a atributy.');
  geometries.forEach((geometry, index) => {
    const amount = geometry && (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') ? geometry.coordinates.flat(geometry.type === 'Polygon' ? 1 : 2).length : 0;
    if (amount !== pointCounts[index]) fail(`Objekt ${index + 1}: dekodér nezachoval všechny původní vrcholy. Import byl zastaven bez vypouštění částí.`);
  });
  const originalFeatures = geometries.map((geometry, i) => ({ geometry, properties: jsonValue(attributes[i]) as Record<string, unknown> }));
  let vertices = 0;
  const features = originalFeatures.map(f => ({ ...f, geometry: transformGeometry(f.geometry, point => {
    if (++vertices > PARK_IMPORT_LIMITS.vertices) fail('Překročen limit počtu vrcholů.');
    const [longitude, latitude] = projection.forward(point.slice(0, 2), true);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) fail('Transformace nevrátila platné souřadnice WGS84.');
    return [longitude, latitude, ...point.slice(2)];
  }) }));
  return { filename, layerName: base.split('/').at(-1)!, format: 'shapefile-zip', originalCrs: /jtsk|krovak/i.test(prj) ? 'S-JTSK / Křovákovo zobrazení (definice PRJ)' : 'CRS z PRJ', prj, cpg, encoding, originalChecksum, features, originalFeatures,
    files: await Promise.all(names.map(async name => ({ name, bytes: files[name].length, checksum: await sha256(files[name]) }))), ...detectFields(features),
    transformation: `proj4 2.22.0: PRJ → EPSG:4326; pořadí vstupních os ze souboru, výstup [longitude, latitude]; datumová transformace podle PRJ a databáze proj4, bez lokálního transformačního gridu.` };
}
function displayGeometry(geometry: JsonGeometry | null): AreaGeometry | null {
  if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) return null;
  const coordinates: unknown = geometry.coordinates;
  if (!Array.isArray(coordinates) || !coordinates.length) return null;
  const parts = geometry.type === 'Polygon' ? [coordinates] : coordinates;
  for (const part of parts) {
    if (!Array.isArray(part) || !part.length) return null;
    for (const ring of part) {
      if (!Array.isArray(ring) || !ring.length) return null;
      for (const point of ring) if (!Array.isArray(point) || point.length < 2 || point.length > 3 || !point.every(n => typeof n === 'number' && Number.isFinite(n)) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) return null;
    }
  }
  return geometry;

}
function removeRepeated(geometry: AreaGeometry) {
  let removed = 0;
  const ring = (positions: Position[]) => positions.filter((p, i) => { const keep = !i || p.some((n, j) => n !== positions[i - 1][j]); if (!keep) removed++; return keep; });
  const coordinates = geometry.type === 'Polygon' ? geometry.coordinates.map(ring) : geometry.coordinates.map(part => part.map(ring));
  return { geometry: { type: geometry.type, coordinates } as AreaGeometry, removed };
}
export async function analyzeParkFile(file: ParkFile, options: ParkImportOptions): Promise<ParkImportReport> {
  const source = poiSourceSchema.parse({ ...options.source, rawChecksum: file.originalChecksum });
  const info = parkFileInfo(file), issues: ParkImportIssue[] = [], duplicates: DuplicateIdentity[] = [], repairs: ParkImportReport['repairs'] = [];
  const rows = await Promise.all(file.features.map(async (f, i) => {
    const code = options.idField === '$id' ? f.id : f.properties[options.idField];
    const sourceId = (typeof code === 'string' || typeof code === 'number') && String(code).trim() ? String(code) : '';
    const name = typeof f.properties[options.nameField] === 'string' ? String(f.properties[options.nameField]).trim() : '';
    const fingerprint = await sha256(canonicalJson({ sourceId, attributes: Object.fromEntries(Object.entries(f.properties).filter(([key]) => !/^(OBJECTID|FID|SHAPE[._](AREA|LEN|LENGTH)|SHAPE_AREA|SHAPE_LENG|AREA|PERIMETER)$/i.test(key))) }));
    return { f, row: i + 1, sourceId, name, fingerprint };
  }));
  const groups = new Map<string, typeof rows>();
  for (const row of rows) { const group = groups.get(row.sourceId) ?? []; group.push(row); groups.set(row.sourceId, group); }
  const records: Poi[] = []; let valid = 0;
  for (const row of rows) {
    let key = row.sourceId; let sourceIdentity: Poi['sourceIdentity'];
    const preview = displayGeometry(row.f.geometry);
    const group = groups.get(row.sourceId)!;
    if (row.sourceId && group.length > 1) {
      const ambiguous = group.filter(r => r.fingerprint === row.fingerprint).length > 1;
      const digest = ambiguous ? await sha256(canonicalJson(row.f.geometry)) : row.fingerprint;
      const proposedKey = `${row.sourceId}~${digest.slice(0, 16)}`;
      const manualKey = options.identities?.[String(row.row)];
      duplicates.push({ row: row.row, sourceId: row.sourceId, name: row.name, fingerprint: row.fingerprint, proposedKey, ambiguous, geometry: preview });
      key = manualKey?.trim() || proposedKey;
      sourceIdentity = { key, fingerprint: row.fingerprint, method: manualKey ? 'manual' : 'attribute-derived', reviewRequired: !options.confirmDuplicateIds || (ambiguous && !manualKey) };
    }
    try {
      if (!row.sourceId) fail('Chybí stabilní původní ID.');
      if (!preview) fail('Chybí platná polygonová geometrie WGS84.');
      const prepared = options.removeRepeatedVertices ? removeRepeated(preview) : { geometry: preview, removed: 0 };
      if (prepared.removed) repairs.push({ row: row.row, removedVertices: prepared.removed });
      const geometry = validateGeometry(prepared.geometry);
      if (!isArea(geometry)) fail('Park musí být Polygon nebo MultiPolygon.');
      const record: Poi = { id: parkId(source.id, key), category: 'park', sourceId: row.sourceId, name: row.name, geometry, point: interiorReferencePoint(geometry), source, status: 'review', reviewedAt: null,
        note: row.name ? 'Importovaný kandidát; ověřte název a vymezení.' : 'Bez doloženého názvu; nutná revize.', attributes: row.f.properties as Poi['attributes'], ...(sourceIdentity ? { sourceIdentity } : {}) };
      records.push(poiSchema.parse(record)); valid++;
    } catch (error) { issues.push({ row: row.row, sourceId: row.sourceId, name: row.name, message: (error as Error).message, geometry: preview }); }
  }
  const keys = new Set<string>();
  for (const record of records) { if (keys.has(record.id)) issues.push({ row: 0, sourceId: record.sourceId, name: record.name, message: 'Navržené identity nejsou jedinečné; přiřaďte odlišné stabilní klíče ručně.', geometry: record.geometry as AreaGeometry }); keys.add(record.id); }
  const unresolved = records.some(r => r.sourceIdentity?.reviewRequired);
  let candidate: ParkDataset | null = null;
  if (!issues.length && !unresolved) {
    const importRecord = JSON.parse(JSON.stringify({ format: file.format, filename: file.filename, layerName: file.layerName, originalCrs: file.originalCrs, prj: file.prj, cpg: file.cpg, encoding: file.encoding,
      files: file.files, originalChecksum: file.originalChecksum, transformation: file.transformation, originalFeatures: file.originalFeatures, repairs, idField: options.idField, nameField: options.nameField }));
    candidate = { source, records, importRecord, checksum: await sha256(canonicalJson({ source, records, importRecord })) };
  }
  return { info, valid, invalid: file.features.length - valid, unnamed: rows.filter(r => !r.name).length, duplicates, issues, repairs, candidate };
}
