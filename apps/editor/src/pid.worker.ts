import { buildGameStops, comparePidSnapshots, pragueDate, readPidSnapshot, referenceZoneGeometry, territoryMembership, type PidSnapshot } from '@jetlag/geo-core';
import { indexedPidStorage, readPidAttempt, writePidAttempt } from './pid-store';
import { decodePidData, loadLivePid, loadPublishedPid } from './pid-fetch';
import type { PidCommand, PidComparison, PidSummary, PidView, RouteDrawing } from './pid-types';

let snapshot: PidSnapshot | null = null;
let candidate: PidSnapshot | null = null;
const message = (error: unknown) => error instanceof Error ? error.message : 'Operace PID selhala.';
const summary = (source: PidSnapshot): PidSummary => ({ id: source.id, checksum: source.checksum, serviceDate: source.serviceDate, downloadedAt: source.downloadedAt, preparedAt: source.preparedAt, adapterVersion: source.adapterVersion, sources: source.sources, quality: source.quality, groupCount: source.groups.length, platformCount: source.platforms.length, routeCount: source.routes.length });
function view(configuration: Parameters<typeof buildGameStops>[1]): PidView {
  if (!snapshot) throw new Error('Chybí ověřený snapshot PID.');
  return { summary: summary(snapshot), stops: buildGameStops(snapshot, configuration), routes: snapshot.routes.map(({ id, number, mode, color, validity }) => ({ id, number, mode, color, validity })), configurationKey: JSON.stringify(configuration), referenceDate: pragueDate() };
}
function current(next: PidSnapshot): void {
  if (next.serviceDate !== pragueDate()) throw new Error(`Zdroj nabízí ${next.serviceDate}, dnešní pražské datum je ${pragueDate()}.`);
  if (next.quality?.status === 'review') throw new Error(next.quality.issues.join(' '));
}
async function run(command: PidCommand): Promise<unknown> {
  if (command.action === 'hydrate') {
    let cached: PidSnapshot | null = null; const warnings: string[] = [];
    try { const saved = await indexedPidStorage.read(); if (saved) cached = await readPidSnapshot(saved); } catch (error) { warnings.push(`Cache PID: ${message(error)}`); }
    let bundled: PidSnapshot | null = null;
    // A validated cache is immediately usable, regardless of age. Network work
    // belongs to refresh and must never delay opening that local snapshot.
    if (!cached) try { bundled = await loadPublishedPid(command.base); } catch (error) { warnings.push(message(error)); }
    snapshot = cached ?? snapshot;
    if (bundled && (!snapshot || (bundled.quality?.status !== 'review' && bundled.serviceDate > snapshot.serviceDate))) snapshot = bundled;
    if (!snapshot) throw new Error(warnings.join(' ') || 'Chybí data PID.');
    if (snapshot !== cached) try { await indexedPidStorage.write(snapshot); } catch (error) { warnings.push(`Snapshot je jen v paměti: ${message(error)}`); }
    let attempt = null;
    try { attempt = await readPidAttempt(); } catch (error) { warnings.push(message(error)); }
    return { ...view(command.configuration), attempt, warning: warnings.join(' ') };
  }
  if (command.action === 'derive') return view(command.configuration);
  if (command.action === 'refresh') {
    let attempt = null;
    try { attempt = await readPidAttempt(); } catch { /* Attempt metadata cannot block usable source data. */ }
    if (!command.force && attempt?.date === pragueDate()) return { ...view(command.configuration), error: attempt.error, skipped: true };
    let next: PidSnapshot | null = null; const errors: string[] = [];
    try { const live = await loadLivePid(); current(live); next = live; } catch (error) { errors.push(`Přímé URL PID: ${message(error)}`); }
    if (!next) try {
      const published = await loadPublishedPid(command.base, snapshot); current(published);
      if (snapshot && snapshot.quality?.status !== 'review' && snapshot.serviceDate === published.serviceDate && snapshot.checksum !== published.checksum && (published.preparedAt ?? published.downloadedAt ?? '') <= (snapshot.preparedAt ?? snapshot.downloadedAt ?? '')) throw new Error('Publikovaný snapshot je starší nebo nemá doložené novější pořadí verzí; přijatá verze nebyla přepsaná.');
      next = published;
    } catch (error) { errors.push(`Publikovaný snapshot: ${message(error)}`); }
    if (!next) {
      const error = errors.join(' ');
      try { await writePidAttempt({ date: pragueDate(), error }); } catch (failure) { errors.push(`Uložení pokusu: ${message(failure)}`); }
      throw new Error(`${errors.join(' ')} Poslední dostupný snapshot zůstal zachovaný.`);
    }
    const diff = comparePidSnapshots(snapshot, next);
    // Transaction and expensive integrity validation run in this worker.
    await indexedPidStorage.write(next); snapshot = next;
    let warning = '';
    try { await writePidAttempt({ date: pragueDate(), error: null }); } catch (error) { warning = `Data jsou načtená; nelze uložit datum pokusu: ${message(error)}`; }
    return { ...view(command.configuration), diff, error: null, warning };
  }
  if (command.action === 'platforms') {
    const groups = new Set(command.groupIds); return snapshot?.platforms.filter(platform => groups.has(platform.groupId)) ?? [];
  }
  if (command.action === 'membership') {
    if (!snapshot) throw new Error('Chybí snapshot pro prostorový filtr.');
    return territoryMembership(buildGameStops(snapshot, command.configuration), snapshot.routes, command.area);
  }
  if (command.action === 'routes') {
    const output: RouteDrawing[] = []; const [west, south, east, north] = command.bounds;
    const allowed = command.allowedIds && new Set(command.allowedIds);
    for (const route of snapshot?.routes ?? []) {
      if (allowed && !allowed.has(route.id)) continue;
      if (!command.modes.includes(route.mode) || (command.onlySelected && route.id !== command.selected)) continue;
      const parts = route.geometry.type === 'LineString' ? [route.geometry.coordinates] : route.geometry.coordinates;
      const visible = parts.filter((_part, index) => { const bounds = route.partBounds?.[index]; return !bounds || bounds[0] <= east && bounds[2] >= west && bounds[1] <= north && bounds[3] >= south; });
      if (visible.length) output.push({ id: route.id, number: route.number, mode: route.mode, color: route.color, geometry: { type: 'MultiLineString', coordinates: visible } });
    }
    return output;
  }
  if (command.action === 'zone') return referenceZoneGeometry(command.point, command.area, command.radius);
  if (command.action === 'compare') {
    candidate = await readPidSnapshot(await decodePidData(command.data));
    return { summary: summary(candidate), diff: comparePidSnapshots(snapshot, candidate), names: Object.fromEntries([...(snapshot?.groups ?? []), ...candidate.groups].map(group => [group.id, group.name])) } satisfies PidComparison;
  }
  if (command.action === 'apply') {
    if (!candidate) throw new Error('Nejprve načtěte a porovnejte snapshot.');
    await indexedPidStorage.write(candidate); snapshot = candidate; candidate = null;
    return view(command.configuration);
  }
  if (!snapshot) throw new Error('Chybí snapshot k exportu.');
  return new Response(new Blob([JSON.stringify(snapshot)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
}
// Sequential commands prevent an earlier hydrate/refresh from overwriting a later import.
let pending: Promise<unknown> = Promise.resolve();
self.onmessage = (event: MessageEvent<PidCommand & { requestId: number }>) => {
  const command = event.data;
  const work = async () => {
    try { const value = await run(command); if (value instanceof ArrayBuffer) self.postMessage({ requestId: command.requestId, value }, { transfer: [value] }); else self.postMessage({ requestId: command.requestId, value }); }
    catch (error) { self.postMessage({ requestId: command.requestId, error: message(error) }); }
  };
  if (['derive', 'platforms', 'routes', 'zone', 'membership', 'export'].includes(command.action)) void work();
  else pending = pending.then(work, work);
};
