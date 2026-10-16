import { z } from 'zod';
import { canonicalJson, type SourceDiff } from './administrative';

/** Internal, source-independent model. These names are NOT claimed to be PID attributes. */
export { transportModes, transportModeSchema, wgs84PointSchema } from './pid-model';
export type { TransportMode } from './pid-model';
import { transportModeSchema, wgs84PointSchema } from './pid-model';
const identifier = z.string().min(1).max(300);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const rawReferenceSchema = z.object({ source: z.enum(['active-stops', 'stop-groups', 'routes', 'gtfs']), pointer: z.string().startsWith('/') });
const uniqueStrings = z.array(identifier).refine(values => new Set(values).size === values.length, 'Duplicitní identifikátory.');
const serviceSchema = z.enum(['day', 'night', 'both', 'unknown']);
const sourceSchema = z.object({
  id: z.enum(['active-stops', 'stop-groups', 'routes', 'gtfs']),
  url: z.url().refine(value => new URL(value).protocol === 'https:'),
  sha256: digest,
  version: z.string().min(1).nullable(),
  declaredValidity: z.string().min(1).nullable(),
  license: z.object({ name: z.string().min(1), url: z.url().nullable() }).nullable(),
});
const groupSchema = z.object({
  id: identifier, name: z.string().trim().min(1),
  evidence: rawReferenceSchema,
  codes: z.object({ node: z.string(), cis: z.string(), category: z.string(), anchorPlatform: z.string() }).optional(),
  municipality: z.string().optional(),
});
const platformSchema = z.object({
  id: identifier, groupId: identifier, name: z.string().min(1), point: wgs84PointSchema,
  // The active record is positive evidence of service in the snapshot day.
  // No departure time, outgoing edge or terminal test is used to infer inactivity.
  services: z.array(z.object({ mode: transportModeSchema, period: serviceSchema, evidence: rawReferenceSchema })),
  active: z.boolean().optional(),
  publicStop: z.boolean(),
  evidence: rawReferenceSchema,
  activePoint: wgs84PointSchema.optional(),
  gtfsIds: z.array(z.string()).optional(),
  routeIds: z.array(z.string()).optional(),
  joinMethod: z.enum(['gtfs-id', 'asw-ids']).optional(),
  serviceStatus: z.enum(['active', 'inactive', 'unknown']).optional(),
  reviewReasons: z.array(z.string()).optional(),
});
const routeSchema = z.object({
  id: identifier, number: z.string().min(1), mode: transportModeSchema,
  geometry: z.discriminatedUnion('type', [
    z.object({ type: z.literal('LineString'), coordinates: z.array(wgs84PointSchema).min(2) }),
    z.object({ type: z.literal('MultiLineString'), coordinates: z.array(z.array(wgs84PointSchema).min(2)).min(1) }),
  ]),
  evidence: rawReferenceSchema,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  validity: z.array(z.iso.date()).optional(),
  partBounds: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])).optional(),
  shapeIds: uniqueStrings.optional(),
});
const stationReferenceSchema = z.object({
  groupIds: uniqueStrings.nonempty(), mode: transportModeSchema, point: wgs84PointSchema,
  evidence: rawReferenceSchema,
});
const snapshotSchema = z.object({
  format: z.literal('jetlag-praha-pid'), schemaVersion: z.union([z.literal(1), z.literal(2)]),
  id: identifier, serviceDate: z.iso.date(), downloadedAt: z.iso.datetime().nullable(),
  preparedAt: z.iso.datetime().optional(),
  checksum: digest,
  adapterVersion: identifier,
  sources: z.array(sourceSchema).min(1).max(3),
  groups: z.array(groupSchema).min(1).max(100000),
  platforms: z.array(platformSchema).min(1).max(200000),
  stationReferences: z.array(stationReferenceSchema).max(100000),
  routes: z.array(routeSchema).max(100000),
  routePeriod: z.enum(['seven-days', 'service-day']),
  quality: z.object({ status: z.enum(['verified', 'review']), issues: z.array(z.string()), unmappedActiveIds: z.array(z.string()), groupsGeneratedAt: z.string(), reviewGroupIds: uniqueStrings.optional() }).optional(),
  gtfs: z.object({ feedStart: z.iso.date(), feedEnd: z.iso.date(), timezone: z.literal('Europe/Prague'), dateSemantics: z.literal('gtfs-service-day'),
    publisher: z.string().min(1), tableChecksums: z.record(z.string(), digest), serviceIds: uniqueStrings,
    counts: z.record(z.string(), z.number().int().nonnegative()), minServiceSeconds: z.number().int().nonnegative().nullable(), maxServiceSeconds: z.number().int().nonnegative().nullable(),
  }).optional(),
});
export type PidSnapshot = z.infer<typeof snapshotSchema>;
export type PidPlatform = PidSnapshot['platforms'][number];
export type SnapshotReference = Pick<PidSnapshot, 'id' | 'checksum' | 'serviceDate' | 'adapterVersion'>;

export function pragueDate(instant: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  const value = (type: string) => parts.find(part => part.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function isHistoricalPid(source: Pick<PidSnapshot, 'serviceDate' | 'quality'>, referenceDate = pragueDate()): boolean {
  return source.serviceDate !== referenceDate || source.quality?.status === 'review';
}
export function snapshotReference(snapshot: PidSnapshot): SnapshotReference {
  return { id: snapshot.id, checksum: snapshot.checksum, serviceDate: snapshot.serviceDate, adapterVersion: snapshot.adapterVersion };
}
function freezeDeep(value: unknown): void {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
}
function uniqueIds(values: { id: string }[], label: string): void {
  if (new Set(values.map(value => value.id)).size !== values.length) throw new Error(`Duplicitní ID: ${label}.`);
}
/** Structural validation never establishes that an upstream join or mode mapping is correct. */
export function validatePidSnapshot(input: unknown): PidSnapshot {
  const snapshot = snapshotSchema.parse(input);
  uniqueIds(snapshot.groups, 'skupiny'); uniqueIds(snapshot.platforms, 'stanoviště'); uniqueIds(snapshot.routes, 'trasy');
  const sourceIds = new Set(snapshot.sources.map(source => source.id));
  if (sourceIds.size !== snapshot.sources.length) throw new Error('Duplicitní zdroje; snapshot v1 musí obsahovat všechny tři různé povinné zdroje.');
  if (snapshot.schemaVersion === 1 && (sourceIds.size !== 3 || !['active-stops', 'stop-groups', 'routes'].every(id => sourceIds.has(id as PidSnapshot['sources'][number]['id'])) || !snapshot.routes.length || snapshot.routePeriod !== 'seven-days' || snapshot.gtfs)) throw new Error('Snapshot v1 musí obsahovat všechny tři různé povinné zdroje a sedmidenní trasy.');
  if (snapshot.schemaVersion === 2 && (!sourceIds.has('gtfs') || [...sourceIds].some(id => id !== 'gtfs' && id !== 'stop-groups') || snapshot.routePeriod !== 'service-day' || !snapshot.gtfs || !snapshot.quality || snapshot.serviceDate < snapshot.gtfs.feedStart || snapshot.serviceDate > snapshot.gtfs.feedEnd)) throw new Error('Snapshot GTFS v2 nemá doložené zdroje nebo platnost požadovaného dne.');
  if (snapshot.gtfs) {
    const required = ['agency.txt', 'feed_info.txt', 'stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt', 'shapes.txt'];
    if (required.some(name => !snapshot.gtfs!.tableChecksums[name]) || !snapshot.gtfs.tableChecksums['calendar.txt'] && !snapshot.gtfs.tableChecksums['calendar_dates.txt']) throw new Error('GTFS postrádá kontrolní součty povinných tabulek.');
    if (['stops', 'routes', 'trips', 'stopTimes', 'shapePoints'].some(key => !snapshot.gtfs!.counts[key]) || snapshot.gtfs.counts.activeTrips === undefined || snapshot.gtfs.counts.activeTrips > snapshot.gtfs.counts.trips) throw new Error('Neúplná evidence zpracování GTFS.');
  }
  const groups = new Set(snapshot.groups.map(group => group.id));
  for (const platform of snapshot.platforms) {
    if (!platform.services.length && platform.active !== false) throw new Error('Aktivní stanoviště musí mít doloženou obsluhu.');
    if (platform.active === false && platform.services.length) throw new Error('Neaktivní stanoviště nesmí předstírat aktivní obsluhu.');
    if (!groups.has(platform.groupId)) throw new Error(`Stanoviště ${platform.id} odkazuje na neexistující skupinu.`);
    if (!sourceIds.has(platform.evidence.source) || platform.services.some(service => service.evidence.source !== (snapshot.schemaVersion === 1 ? 'active-stops' : 'gtfs'))) throw new Error('Stanoviště a aktivní obsluha musí mít odpovídající zdrojové doklady.');
    if (snapshot.schemaVersion === 2 && (!platform.serviceStatus || (platform.services.length > 0) !== (platform.serviceStatus === 'active'))) throw new Error('Stav obsluhy GTFS neodpovídá dokladům služby.');
  }
  for (const group of snapshot.groups) if (!sourceIds.has(group.evidence.source) || !['gtfs', 'stop-groups'].includes(group.evidence.source)) throw new Error('Skupina musí odkazovat na doložený zdroj skupin.');
  for (const route of snapshot.routes) {
    if (route.evidence.source !== (snapshot.schemaVersion === 1 ? 'routes' : 'gtfs')) throw new Error('Trasa musí odkazovat na zdroj tras.');
    const parts = route.geometry.type === 'LineString' ? [route.geometry.coordinates] : route.geometry.coordinates;
    if (route.partBounds && route.partBounds.length !== parts.length || route.shapeIds && route.shapeIds.length !== parts.length) throw new Error('Metadata částí trasy nesouhlasí s geometrií.');
    if (snapshot.schemaVersion === 2 && (!route.shapeIds?.length || route.validity?.length !== 1 || route.validity[0] !== snapshot.serviceDate)) throw new Error('Trasa GTFS nemá doložené tvary a platnost dne.');
  }
  if (snapshot.quality?.reviewGroupIds?.some(id => !groups.has(id))) throw new Error('Revize odkazuje na neexistující skupinu.');
  const references = new Set<string>();
  for (const reference of snapshot.stationReferences) {
    if (reference.groupIds.some(id => !groups.has(id))) throw new Error('Referenční bod odkazuje na neexistující skupinu.');
    const key = `${reference.mode}:${[...reference.groupIds].sort().join('|')}`;
    if (references.has(key)) throw new Error('Nejednoznačné oficiální referenční body.');
    references.add(key);
  }
  freezeDeep(snapshot);
  return snapshot;
}
export async function sha256(input: string | Uint8Array): Promise<string> {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
}
export async function pidChecksum(snapshot: Omit<PidSnapshot, 'checksum' | 'id'>): Promise<string> {
  const { format, schemaVersion, serviceDate, downloadedAt, preparedAt, adapterVersion, sources, groups, platforms, stationReferences, routes, routePeriod, quality, gtfs } = snapshot;
  return sha256(canonicalJson({ format, schemaVersion, serviceDate, downloadedAt, preparedAt, adapterVersion, sources, groups, platforms, stationReferences, routes, routePeriod, quality, gtfs }));
}
export async function createPidSnapshot(input: Omit<PidSnapshot, 'checksum' | 'id'>): Promise<PidSnapshot> {
  // Normalize first (for example whitespace in names), then hash exactly the
  // validated model that will be saved and subsequently read back.
  const normalized = validatePidSnapshot({ ...input, id: 'pending', checksum: '0'.repeat(64) });
  const checksum = await pidChecksum(normalized);
  return Object.freeze({ ...normalized, id: `pid:${normalized.serviceDate}:${checksum}`, checksum });
}
export async function readPidSnapshot(input: unknown): Promise<PidSnapshot> {
  const snapshot = validatePidSnapshot(typeof input === 'string' ? JSON.parse(input) : input);
  const { id, checksum, ...content } = snapshot;
  if (await pidChecksum(content) !== checksum || id !== `pid:${snapshot.serviceDate}:${checksum}`) throw new Error('Kontrolní součet nebo identifikátor snapshotu PID nesouhlasí.');
  return snapshot;
}

/** Source-level diff also sees lower-priority platforms whose movement cannot
 * affect the current reference point (and hence a derived game-stop diff). */
export function comparePidSnapshots(previous: PidSnapshot | null, next: PidSnapshot): SourceDiff {
  const content = (snapshot: PidSnapshot) => {
    const platforms = new Map<string, PidPlatform[]>();
    for (const platform of snapshot.platforms) {
      const list = platforms.get(platform.groupId) ?? []; list.push(platform); platforms.set(platform.groupId, list);
    }
    return new Map(snapshot.groups.map(group => [group.id, canonicalJson({ group,
      platforms: (platforms.get(group.id) ?? []).sort((a, b) => a.id.localeCompare(b.id)),
      references: snapshot.stationReferences.filter(reference => reference.groupIds.includes(group.id)).map(reference => canonicalJson(reference)).sort(),
    })]));
  };
  const old = previous ? content(previous) : new Map<string, string>();
  const diff: SourceDiff = { added: [], changed: [], removed: [], unchanged: [] };
  for (const [id, value] of content(next)) {
    (old.has(id) ? old.get(id) === value ? diff.unchanged : diff.changed : diff.added).push(id);
    old.delete(id);
  }
  diff.removed = [...old.keys()];
  return diff;
}
export function comparePidRoutes(previous: PidSnapshot | null, next: PidSnapshot): SourceDiff {
  const old = new Map((previous?.routes ?? []).map(route => [route.id, canonicalJson({ ...route, validity: undefined })]));
  const diff: SourceDiff = { added: [], changed: [], removed: [], unchanged: [] };
  for (const route of next.routes) { const value = canonicalJson({ ...route, validity: undefined }); (old.has(route.id) ? old.get(route.id) === value ? diff.unchanged : diff.changed : diff.added).push(route.id); old.delete(route.id); }
  diff.removed = [...old.keys()]; return diff;
}

export interface PidSnapshotStorage { read(): Promise<unknown | null>; write(snapshot: PidSnapshot): Promise<void> }
export interface PidRefreshResult { snapshot: PidSnapshot | null; refreshed: boolean; stale: boolean; error: string | null }
/** The loader must return a complete, source-audited snapshot, never a partial download. */
export async function refreshPidSnapshot(storage: PidSnapshotStorage, load: () => Promise<unknown>, options: { now?: Date; force?: boolean } = {}): Promise<PidRefreshResult> {
  const today = pragueDate(options.now);
  let previous: PidSnapshot | null = null;
  let readError: string | null = null;
  try { const cached = await storage.read(); if (cached !== null) previous = await readPidSnapshot(cached); }
  catch (error) { readError = `Uložený snapshot nelze ověřit: ${error instanceof Error ? error.message : 'chyba úložiště'}`; }
  if (!options.force && previous?.serviceDate === today) return { snapshot: previous, refreshed: false, stale: false, error: null };
  try {
    const next = await readPidSnapshot(await load());
    if (next.serviceDate !== today) throw new Error(`Zdroj nabízí datum ${next.serviceDate}, očekáváno ${today}.`);
    if (next.quality?.status === 'review') throw new Error(`Zdroje PID vyžadují revizi: ${next.quality.issues.join(' ')}`);
    await storage.write(next);
    return { snapshot: next, refreshed: true, stale: false, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Aktualizace PID selhala.';
    return { snapshot: previous, refreshed: false, stale: previous?.serviceDate !== today, error: [readError, message].filter(Boolean).join(' · ') };
  }
}
