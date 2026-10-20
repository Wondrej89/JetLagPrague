import { canonicalJson } from './administrative';
import { resolvePois, preparePoiDecision, type Poi, type PoiConfiguration, type PoiDecision, type ParkHierarchy, type ParkFilters } from './poi';

export function defaultParkFilters(): ParkFilters { return { hierarchies: [1], showOutside: false, status: 'all', approvedOnlyMap: false }; }
function readHierarchy(value: unknown): ParkHierarchy {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return 'unknown';
  const number = Number(value);
  return number === 1 || number === 2 || number === 3 || number === 4 ? number : 'unknown';
}
export function parkHierarchy(poi: Pick<Poi, 'attributes' | 'importAudit'>): ParkHierarchy {
  if (poi.importAudit?.merged) {
    const values = poi.importAudit.sourceRecords.map(record => readHierarchy(record.attributes.HIERARCHIE));
    return values.length && values.every(value => value === values[0]) ? values[0] : 'unknown';
  }
  return readHierarchy(poi.attributes.HIERARCHIE);
}
export function parkMatchesHierarchy(poi: Poi, selected: readonly ParkHierarchy[]): boolean {
  return poi.category === 'park' && selected.includes(parkHierarchy(poi));
}
/** Map game preview always shows the complete approved set, including exceptions
 * outside the working hierarchy. List status/search never change that preview. */
export function filterParkPois(pois: Poi[], filters: ParkFilters, target: 'list' | 'map', search = ''): Poi[] {
  const query = search.trim().toLocaleLowerCase('cs');
  return pois.filter(poi => {
    if (target === 'map' && poi.category === 'park' && filters.approvedOnlyMap) return poi.status === 'approved';
    if (poi.category === 'park' && ((!filters.showOutside && !parkMatchesHierarchy(poi, filters.hierarchies)) || (filters.status !== 'all' && poi.status !== filters.status))) return false;
    return target !== 'list' || `${poi.name} ${poi.id} ${poi.sourceId}${['library', 'cinema'].includes(poi.category) ? ` ${poi.address ?? ''}` : ''}`.toLocaleLowerCase('cs').includes(query);
  });
}
export interface ParkDecisionChange { id: string; previous: PoiDecision | null; applied: PoiDecision }
export interface ParkBulkResult { configuration: PoiConfiguration; matched: number; changed: number; skipped: { id: string; name: string; reason: string }[]; undo: ParkDecisionChange[] }
/** One configuration replacement; no storage or UI calls in the core. A caller
 * can yield between batches without committing partial decisions. */
export async function decideParkHierarchies(configuration: PoiConfiguration, selected: readonly ParkHierarchy[], status: 'approved' | 'excluded', yieldBatch?: () => Promise<void>): Promise<ParkBulkResult> {
  const candidates = resolvePois([], configuration).filter(poi => parkMatchesHierarchy(poi, selected));
  const decisions = new Map(configuration.decisions.map(decision => [decision.id, decision]));
  const skipped: ParkBulkResult['skipped'] = [], undo: ParkDecisionChange[] = [];
  const reviewedAt = new Date().toISOString();
  for (const [index, poi] of candidates.entries()) {
    if (index % 32 === 0) await yieldBatch?.();
    try {
      const previous = decisions.get(poi.id);
      const applied = preparePoiDecision(poi, previous, { status }, reviewedAt);
      if (previous?.status === status && poi.status === status) continue;
      decisions.set(poi.id, applied); undo.push({ id: poi.id, previous: previous ?? null, applied });
    } catch (error) { skipped.push({ id: poi.id, name: poi.name, reason: error instanceof Error ? error.message : 'Objekt nelze zpracovat.' }); }
  }
  return { configuration: undo.length ? { ...configuration, decisions: [...decisions.values()] } : configuration, matched: candidates.length, changed: undo.length, skipped, undo };
}
/** Restore only decisions still equal to this batch's output. Later individual
 * edits, source updates, filters and other world data are never rolled back. */
export function undoParkBulk(configuration: PoiConfiguration, changes: ParkDecisionChange[]) {
  const decisions = new Map(configuration.decisions.map(decision => [decision.id, decision]));
  let restored = 0, preserved = 0;
  for (const change of changes) {
    if (canonicalJson(decisions.get(change.id) ?? null) !== canonicalJson(change.applied)) { preserved++; continue; }
    if (change.previous) decisions.set(change.id, change.previous); else decisions.delete(change.id);
    restored++;
  }
  return { configuration: restored ? { ...configuration, decisions: [...decisions.values()] } : configuration, restored, preserved };
}
