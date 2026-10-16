import { buildGameStops, type GameStopConfiguration } from './game-stops';
import { distanceMeters, type AreaGeometry } from './index';
import { prepareTerritory } from './territory';
import { isHistoricalPid, pragueDate, readPidSnapshot, snapshotReference, type SnapshotReference } from './pid-snapshot';

export interface HideCandidate { id: string; name: string; point: [number, number]; modes: ReturnType<typeof buildGameStops>[number]['modes'] }
export interface PrivateHideSelection {
  visibility: 'hider-only'; hiderId: string; stopId: string; snapshot: SnapshotReference;
  referencePoint: [number, number]; radiusMeters: number; confirmedAt: string;
}
/** Inputs (area, configuration, date) must come from trusted backend game state,
 * never from a confirmation request supplied by the hider. */
export async function hideCandidates(raw: unknown, configuration: GameStopConfiguration, options: { area: AreaGeometry; near?: [number, number]; maxDistanceMeters?: number; referenceDate?: string }): Promise<HideCandidate[]> {
  const snapshot = await readPidSnapshot(raw);
  if (isHistoricalPid(snapshot, options.referenceDate ?? pragueDate())) throw new Error('Historická data nejsou zdroj nové ostré hry.');
  if (options.maxDistanceMeters !== undefined && (!options.near || !Number.isFinite(options.maxDistanceMeters) || options.maxDistanceMeters < 0)) throw new Error('Neplatný filtr okolí.');
  const territory = prepareTerritory(options.area);
  return buildGameStops(snapshot, configuration).filter(stop => stop.activity === 'active' && stop.eligibility === 'allowed' && stop.point && territory.contains(stop.point) && (options.maxDistanceMeters === undefined || distanceMeters(stop.point, options.near!) <= options.maxDistanceMeters)).map(stop => ({ id: stop.id, name: stop.name, point: stop.point!, modes: stop.modes }));
}
export async function confirmHideSelection(request: { stopId: string }, trusted: { hiderId: string; snapshot: SnapshotReference; configuration: GameStopConfiguration; area: AreaGeometry }, readPinned: (reference: SnapshotReference) => Promise<unknown>): Promise<PrivateHideSelection> {
  const raw = await readPinned(trusted.snapshot), snapshot = await readPidSnapshot(raw), actual = snapshotReference(snapshot);
  if (Object.keys(actual).some(key => actual[key as keyof SnapshotReference] !== trusted.snapshot[key as keyof SnapshotReference])) throw new Error('Výběr neodpovídá uzamčené verzi.');
  const candidate = (await hideCandidates(snapshot, trusted.configuration, { area: trusted.area })).find(stop => stop.id === request.stopId);
  if (!candidate) throw new Error('Zvolená zastávka není v uzamčeném snapshotu aktivní a povolená.');
  return { visibility: 'hider-only', hiderId: trusted.hiderId, stopId: candidate.id, snapshot: actual, referencePoint: candidate.point, radiusMeters: trusted.configuration.radiusMeters, confirmedAt: new Date().toISOString() };
}
/** Role/identity must be resolved by server authentication. Hunters receive null,
 * including when the requesting account happens to know a hider's public ID. */
export function hideSelectionForViewer(selection: PrivateHideSelection, viewer: { playerId: string; role: 'hider' | 'hunter' }): PrivateHideSelection | null {
  return viewer.role === 'hider' && viewer.playerId === selection.hiderId ? selection : null;
}
