// Editor-only topology operations: keep GEOS out of the public game bundle.
import { feature, featureCollection, union } from '@turf/turf';
import { canonicalJson } from './administrative';
import { isArea } from './index';
import { interiorReferencePoint, poiSchema, decidePoi, type Poi, type PoiConfiguration } from './poi';
import { sha256 } from './pid-snapshot';
import { parkTopology } from './park-topology';

/** Explicit administrator grouping only. Originals remain in the source and
 * their previous decisions are retained for an exact reversal. */
export async function mergeWaterbodies(configuration: PoiConfiguration, members: Poi[], name: string) {
  if (members.length < 2 || !name.trim() || members.some(p => p.category !== 'waterbody' || !isArea(p.geometry))) throw new Error('Vyberte nejméně dvě vodní plochy a název výsledné lokality.');
  const sorted = [...members].sort((a,b) => a.id.localeCompare(b.id));
  const combined = union(featureCollection(sorted.map(p => feature(p.geometry as import('./index').AreaGeometry))));
  if (!combined) throw new Error('Sjednocení vodních ploch se nezdařilo.');
  await parkTopology(combined.geometry, 'validate');
  const id = `waterbody:merged:${await sha256(canonicalJson(sorted.map(p => p.id)))}`;
  if ([...configuration.manual, ...(configuration.waterSources ?? []).flatMap(s => s.records)].some(p => p.id === id)) throw new Error('Tato skupina již existuje; vyberte ji v seznamu.');
  const poi = poiSchema.parse({ ...sorted[0], id, sourceId: id, name: name.trim(), geometry: combined.geometry, point: interiorReferencePoint(combined.geometry), waterbody: { globalIds: [...new Set(sorted.flatMap(p => p.waterbody!.globalIds))] }, status: 'review', reviewedAt: null, note: 'Ručně sjednocená lokalita; ověřte vymezení a schvalte.', memberIds: sorted.map(p => p.id), attributes: { previousDecisions: sorted.map(p => ({ id: p.id, decision: configuration.decisions.find(d => d.id === p.id) ?? null })) } });
  let next = { ...configuration, manual: [...configuration.manual, poi] };
  for (const member of sorted) next = decidePoi(next, member, { status: 'excluded' });
  poi.attributes.mergeDecisions=sorted.map(p=>next.decisions.find(d=>d.id===p.id)!);
  return { configuration: next, poi };
}
