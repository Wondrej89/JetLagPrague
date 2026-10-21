import { area } from '@turf/turf';
import { canonicalJson } from './administrative';
import { validateGeometry } from './index';
import { interiorReferencePoint, poiSchema, waterbodyId, verifyPoiSources, parkDatasetSchema, type Poi, type ParkDataset } from './poi';
import { readParkFile, parkFileInfo, type ParkFile } from './park-import';
import { parkTopology, polygonalResult, PARK_TOPOLOGY_ENGINE } from './park-topology';
import { sha256 } from './pid-snapshot';
import { classifyWaterbody, waterNameKey, WATER_RULES as rules } from './waterbodies';

export async function prepareWaterDataset(file: ParkFile): Promise<ParkDataset> {
  const selected = file.features.map((feature, index) => ({ feature, index })).filter(({feature}) => feature.properties.TYP === 'P' && typeof feature.properties.NAZEV === 'string' && feature.properties.NAZEV.trim());
  if (!selected.length) throw new Error('Dataset neobsahuje pojmenované vodní plochy TYP=P.');
  const counts = new Map<string, number>(); for (const {feature} of selected) counts.set(waterNameKey(String(feature.properties.NAZEV)), (counts.get(waterNameKey(String(feature.properties.NAZEV))) ?? 0) + 1);
  const at = new Date().toISOString();
  const source = { id: 'praha-water-areas', provider: 'Hlavní město Praha / IPR Praha – Oázy chladu: vodní plochy a toky', url: 'https://geoportalpraha.cz/data-a-sluzby/ke-stazeni/e01b4bb6d148496abff4f065686290ff', license: { name: 'Otevřená data IPR; konkrétní licence není v dodaném ZIPu doložena', url: null }, dataDate: file.originalChecksum === 'e778e595fc2a6efe606d167468230cad3523583146417620c6245ade6c096f9d' ? '2026-10-05' : null, retrievedAt: at, rawChecksum: file.originalChecksum, verification: 'user_supplied' as const, note: 'Dodaný oficiální Shapefile; EPSG:5514 → WGS84 podle PRJ pomocí PROJ/proj4. Pouze pojmenované objekty TYP=P. Žádné odvození Vltavy ani změny objektů TYP=T. Datum 5. 10. 2026 odpovídá synchronizaci metadat ZIPu, nikoli novému geodetickému měření.' };
  const records: Poi[] = [], repairs = [];
  for (const { feature: input, index } of selected) {
    const name = String(input.properties.NAZEV), globalId = input.properties.GLOBALID;
    if (typeof globalId !== 'string') throw new Error(`Objekt ${index + 1}: chybí GLOBALID; import neproveden.`);
    const id = waterbodyId(globalId); let geometry = input.geometry;
    if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) throw new Error(`${name}: chybí polygon; import neproveden.`);
    try { validateGeometry(geometry); await parkTopology(geometry, 'validate'); }
    catch {
      const repaired = polygonalResult(await parkTopology(geometry, 'make-valid'));
      const before = area(geometry), after = repaired ? area(repaired) : NaN;
      if (!repaired || !Number.isFinite(before) || before <= 0 || !Number.isFinite(after) || Math.abs(after - before) > Math.max(.01, before * .001)) throw new Error(`${name} (${globalId}): oprava by změnila plochu nebo zahodila nepolygonové části; import není přijat. Původní dataset zůstává zachován.`);
      await parkTopology(repaired, 'validate'); validateGeometry(repaired);
      repairs.push({ globalId, engine: PARK_TOPOLOGY_ENGINE, before: input.geometry, beforeAreaM2: before, afterAreaM2: after, afterChecksum: await sha256(canonicalJson(repaired)) }); geometry = repaired;
    }
    const classification = classifyWaterbody(name, counts.get(waterNameKey(name)));
    records.push(poiSchema.parse({ id, category: 'waterbody', name, point: interiorReferencePoint(geometry), geometry, sourceId: globalId, source,
      waterbody: { globalIds: [globalId] }, status: classification.status, reviewedAt: classification.status === 'approved' ? at : null, note: classification.reason,
      attributes: { original: input.properties, classification, rulesVersion: rules.version, originalGeometryChecksum: await sha256(canonicalJson(input.geometry)), sourceRow: index + 1 },
    }));
  }
  if (new Set(records.map(p => p.id)).size !== records.length) throw new Error('Duplicitní GLOBALID; import neproveden.');
  const importRecord = { info: parkFileInfo(file), rules, originalFeatures: selected.map(({index}) => file.originalFeatures[index]), repairs, total: file.features.length, waterPolygons: file.features.filter(f => f.properties.TYP === 'P').length, ignoredUnnamed: file.features.filter(f => f.properties.TYP === 'P').length - selected.length, ignoredStreams: file.features.filter(f => f.properties.TYP === 'T').length };
  const dataset = parkDatasetSchema.parse({ source, records, importRecord, checksum: await sha256(canonicalJson({ source, records, importRecord })) });
  await verifyPoiSources({ version: 1, sources: [], waterSources: [dataset], manual: [], decisions: [], visibility: { airports: true, parks: true, referencePoints: false } });
  return dataset;
}
export async function importWaterZip(bytes: Uint8Array, filename: string): Promise<ParkDataset> { if(!/\.zip$/i.test(filename))throw new Error('Vyberte původní Shapefile ZIP vodních ploch.');return prepareWaterDataset(await readParkFile(bytes, filename)); }
