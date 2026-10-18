import { booleanPointInPolygon, featureCollection, intersect, feature } from '@turf/turf';
import type { Position } from 'geojson';
import { distanceMeters, makeMetricCircle, validateGeometry, isArea, type AreaGeometry } from './index';
import { canonicalJson, type SourceDiff } from './administrative';
import { pragueDate, wgs84PointSchema, type PidSnapshot, type TransportMode, type PidPlatform } from './pid-snapshot';

export * from './game-stop-configuration';
import { validateGameStopConfiguration, defaultGameStopConfiguration, type GameStopConfiguration, type GameStopOverride } from './game-stop-configuration';

const priority: Partial<Record<TransportMode, number>> = { train: 1, metro: 2, tram: 3, bus: 4, trolleybus: 4 };
export function dominantModes(modes: readonly TransportMode[]): TransportMode[] {
  const ranked = [...new Set(modes)].filter(mode => priority[mode] !== undefined);
  const rank = Math.min(...ranked.map(mode => priority[mode]!));
  // Bus/trolleybus are a shared priority class. The stable representative is bus
  // when both occur, but both kinds of platform contribute to the reference point.
  return ranked.filter(mode => priority[mode] === rank).sort();
}
export interface GameStop {
  id: string; name: string; groupIds: string[];
  modes: TransportMode[]; dominantMode: TransportMode | null; referenceModes: TransportMode[];
  platformIds: string[]; relevantPlatformIds: string[];
  point: [number, number] | null;
  automaticPoint: [number, number] | null;
  pointMethod: 'platform-mean' | 'official' | 'manual' | 'unknown';
  eligibility: 'allowed' | 'excluded' | 'review'; reasons: string[];
  sourceSignature: string;
  service: 'day' | 'night' | 'both' | 'unknown';
  serviceHasUnknown: boolean;
  snapshotId: string; snapshotDate: string;
  activity: 'active' | 'inactive' | 'unknown';
}
function signature(groupIds: string[], platforms: PidPlatform[]): string {
  // Coordinate corrections do not delete a manual point. Identity or mode changes
  // require approval again, so a closed metro cannot retain its former manual center.
  return canonicalJson({ groups: [...groupIds].sort(), platforms: platforms.map(platform => ({ id: platform.id, groupId: platform.groupId, modes: [...new Set(platform.services.map(service => service.mode))].sort() })).sort((a, b) => a.id.localeCompare(b.id)) });
}
function mean(points: [number, number][]): [number, number] {
  return [points.reduce((sum, point) => sum + point[0], 0) / points.length, points.reduce((sum, point) => sum + point[1], 0) / points.length];
}
function period(platforms: PidPlatform[]): GameStop['service'] {
  const periods = platforms.flatMap(platform => platform.services.map(service => service.period));
  return periods.includes('both') || (periods.includes('day') && periods.includes('night')) ? 'both' : periods.includes('day') ? 'day' : periods.includes('night') ? 'night' : 'unknown';
}
export function buildGameStops(snapshot: PidSnapshot, input: GameStopConfiguration = defaultGameStopConfiguration()): GameStop[] {
  const configuration = validateGameStopConfiguration(input);
  const groups = new Map(snapshot.groups.map(group => [group.id, group]));
  const byGroup = new Map<string, PidPlatform[]>();
  const allByGroup = new Map<string, PidPlatform[]>();
  for (const platform of snapshot.platforms) { const list = allByGroup.get(platform.groupId) ?? []; list.push(platform); allByGroup.set(platform.groupId, list); }
  for (const original of snapshot.platforms) {
    const platform = configuration.allowedModes ? { ...original, services: original.services.filter(service => configuration.allowedModes!.includes(service.mode)) } : original;
    if (!platform.publicStop || !platform.services.length) continue;
    const list = byGroup.get(platform.groupId) ?? []; list.push(platform); byGroup.set(platform.groupId, list);
  }
  const linked = new Set(configuration.nodes.flatMap(node => node.groupIds));
  const nodes = [
    ...snapshot.groups.filter(group => !linked.has(group.id)).map(group => ({ id: `pid-group:${group.id}`, name: group.name, groupIds: [group.id] })),
    ...configuration.nodes,
  ];
  const overrides = new Map(configuration.overrides.map(override => [override.stopId, override]));
  return nodes.map(node => {
    const platforms = node.groupIds.flatMap(id => byGroup.get(id) ?? []);
    const allPlatforms = node.groupIds.flatMap(id => allByGroup.get(id) ?? []);
    const activity: GameStop['activity'] = platforms.length ? 'active' : allPlatforms.some(platform => platform.serviceStatus === 'unknown') ? 'unknown' : 'inactive';
    const modes = [...new Set(platforms.flatMap(platform => platform.services.map(service => service.mode)))].sort();
    const sourceSignature = signature(node.groupIds, platforms);
    const override = overrides.get(node.id);
    const reasons: string[] = [];
    if (snapshot.serviceDate !== pragueDate()) reasons.push(`Historická referenční data – neověřeno. Datum obsluhy ${snapshot.serviceDate} neodpovídá dnešnímu pražskému datu.`);
    if (snapshot.quality?.status === 'review') reasons.push('Zdrojový snapshot není časově nebo vazebně konzistentní; aktuální povolenost nelze určit.');
    const signatureChanged = !!override && override.sourceSignature !== sourceSignature;
    const missingGroups = node.groupIds.filter(id => !groups.has(id));
    if (missingGroups.length) reasons.push(`Chybí původní skupiny: ${missingGroups.join(', ')}.`);
    if (signatureChanged) reasons.push('Změnila se skladba zdrojových skupin nebo stanovišť; ruční rozhodnutí vyžaduje revizi.');
    const trustedOverride = signatureChanged || missingGroups.length ? undefined : override;
    const localReview = node.groupIds.some(id => snapshot.quality?.reviewGroupIds?.includes(id));
    if (localReview && !(trustedOverride?.decision === 'allowed' && trustedOverride.point)) reasons.push('Místní nejednoznačnost vazby GTFS nebo fyzických stanovišť; nutná revize referenčního bodu.');
    let referenceModes = dominantModes(modes);
    if (modes.some(mode => mode === 'ferry' || mode === 'funicular')) {
      if (trustedOverride?.mode && modes.includes(trustedOverride.mode)) referenceModes = [trustedOverride.mode];
      else if (modes.length === 1) referenceModes = [modes[0]];
      else { referenceModes = []; reasons.push('Přívoz nebo lanovka vyžaduje výslovný výběr druhu dopravy a schválení.'); }
    } else if (trustedOverride?.mode) {
      // An administrator cannot silently override the fixed hierarchy for ordinary modes.
      if (!referenceModes.includes(trustedOverride.mode)) reasons.push('Ruční volba dopravy neodpovídá aktivní prioritě.');
    }
    const relevant = platforms.filter(platform => platform.services.some(service => referenceModes.includes(service.mode)));
    const official = snapshot.stationReferences.filter(reference => referenceModes.length === 1 && reference.mode === referenceModes[0] && canonicalJson([...reference.groupIds].sort()) === canonicalJson([...node.groupIds].sort()));
    let point: GameStop['point'] = relevant.length ? mean(relevant.map(platform => platform.point)) : null;
    let pointMethod: GameStop['pointMethod'] = point ? 'platform-mean' : 'unknown';
    if (official.length === 1 && relevant.length) { point = official[0].point; pointMethod = 'official'; }
    const automaticPoint = point;
    if (trustedOverride?.point && relevant.length) { point = trustedOverride.point; pointMethod = 'manual'; }
    if (!platforms.length) reasons.push('Žádná doložená aktivní veřejná stanoviště.');
    if (!point) reasons.push('Referenční bod nelze určit.');
    const requiresSpecialApproval = modes.some(mode => mode === 'ferry' || mode === 'funicular') && trustedOverride?.decision !== 'allowed';
    if (requiresSpecialApproval) reasons.push('Chybí výslovné schválení herní zastávky pro přívoz nebo lanovku.');
    // Exclusion remains conservative even after source membership changes.
    const eligibility = override?.decision === 'excluded' ? 'excluded' : reasons.length || requiresSpecialApproval ? 'review' : 'allowed';
    return { id: node.id, name: node.name, groupIds: [...node.groupIds], modes, dominantMode: referenceModes[0] ?? null, referenceModes,
      platformIds: platforms.map(platform => platform.id), relevantPlatformIds: relevant.map(platform => platform.id), point, automaticPoint, pointMethod,
      eligibility, reasons, sourceSignature, service: period(platforms), serviceHasUnknown: platforms.some(platform => platform.services.some(service => service.period === 'unknown')), snapshotId: snapshot.id, snapshotDate: snapshot.serviceDate, activity };
  });
}

export interface StopFilter { modes?: TransportMode[]; dominant?: TransportMode; period?: 'all' | 'day' | 'night'; search?: string }
export function filterGameStops(stops: GameStop[], filter: StopFilter): GameStop[] {
  const search = filter.search?.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('cs');
  return stops.filter(stop => stop.platformIds.length &&
    (!filter.modes || stop.modes.some(mode => filter.modes!.includes(mode))) &&
    (!filter.dominant || stop.referenceModes.includes(filter.dominant)) &&
    (!filter.period || filter.period === 'all' || stop.service === filter.period || stop.service === 'both') &&
    (!search || stop.name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('cs').includes(search)));
}
/** Polygon approximation is display/export geometry only; it is never the distance test. */
export function hidingZoneGeometry(stop: GameStop, area: AreaGeometry | null, radiusMeters = 400): AreaGeometry | null {
  if (!stop.point || stop.eligibility !== 'allowed' || stop.snapshotDate !== pragueDate() || !area) return null;
  return referenceZoneGeometry(stop.point, area, radiusMeters);
}
export function referenceZoneGeometry(point: Position, area: AreaGeometry | null, radiusMeters = 400): AreaGeometry | null {
  if (!area) return null;
  const checked = validateGeometry(area);
  if (!isArea(checked)) throw new Error('Herní oblast musí být polygon.');
  return intersect(featureCollection([feature(makeMetricCircle(point, radiusMeters)), feature(checked)]))?.geometry ?? null;
}
export interface HidingPositionResult {
  status: 'allowed' | 'forbidden' | 'unknown';
  distanceMeters: number | null; withinRadius: boolean | null; insideGameArea: boolean | null;
  reason: string;
}
export const DISTANCE_TOLERANCE_METERS = 0.000001;
export function inspectHidingPosition(point: Position, stop: GameStop | null, area: AreaGeometry | null, radiusMeters = 400): HidingPositionResult {
  const unknown = (reason: string, measured: number | null = null, withinRadius: boolean | null = null): HidingPositionResult => ({ status: 'unknown', distanceMeters: measured, withinRadius, insideGameArea: null, reason });
  try {
    wgs84PointSchema.parse(point);
    if (!Number.isFinite(radiusMeters) || radiusMeters <= 0 || radiusMeters > 100000) return unknown('Neplatný poloměr úkrytové zóny.');
    if (!stop?.point) return unknown('Chybí spolehlivý referenční bod zastávky.');
    const measured = distanceMeters(point, stop.point);
    const withinRadius = measured <= radiusMeters + DISTANCE_TOLERANCE_METERS;
    if (!area) return unknown('Chybí definice herní oblasti.', measured, withinRadius);
    const checked = validateGeometry(area);
    if (!isArea(checked)) return unknown('Herní oblast nemá polygonovou geometrii.', measured, withinRadius);
    const insideGameArea = booleanPointInPolygon(point, checked);
    if (stop.snapshotDate !== pragueDate()) return { status: 'unknown', distanceMeters: measured, withinRadius, insideGameArea, reason: 'Historická referenční data – neověřeno. Geografický výsledek nelze použít jako povolení pro ostrou hru.' };
    if (stop.eligibility === 'review') return { status: 'unknown', distanceMeters: measured, withinRadius, insideGameArea, reason: stop.reasons.join(' ') || 'Zastávka vyžaduje ruční revizi.' };
    const allowed = stop.eligibility === 'allowed' && withinRadius && insideGameArea;
    return { status: allowed ? 'allowed' : 'forbidden', distanceMeters: measured, withinRadius, insideGameArea,
      reason: stop.eligibility === 'excluded' ? 'Zastávka je ručně vyloučená.' : !insideGameArea ? 'Bod leží mimo herní oblast.' : !withinRadius ? 'Bod je za povoleným poloměrem.' : 'Bod splňuje vzdálenost i herní oblast.' };
  } catch { return unknown('Polohu nelze spolehlivě vyhodnotit: neplatné geografické údaje.'); }
}
export function compareGameStops(previous: GameStop[], next: GameStop[]): SourceDiff {
  const content = (stop: GameStop) => canonicalJson({ ...stop, snapshotId: undefined, snapshotDate: undefined });
  const old = new Map(previous.map(stop => [stop.id, stop]));
  const diff: SourceDiff = { added: [], changed: [], removed: [], unchanged: [] };
  for (const stop of next) {
    const before = old.get(stop.id);
    (before ? content(before) === content(stop) ? diff.unchanged : diff.changed : diff.added).push(stop.id);
    old.delete(stop.id);
  }
  diff.removed = [...old.keys()];
  return diff;
}
export function orphanedOverrides(stops: GameStop[], configuration: GameStopConfiguration): GameStopOverride[] {
  const present = new Set(stops.map(stop => stop.id));
  return configuration.overrides.filter(override => !present.has(override.stopId));
}
