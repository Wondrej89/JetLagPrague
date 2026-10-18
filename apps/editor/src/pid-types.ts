import type { PidSnapshot, GameStop, PidPlatform, SourceDiff, AreaGeometry, GameStopConfiguration, TransportMode, WorldDraft, Poi } from '@jetlag/geo-core';

export type PidSummary = Pick<PidSnapshot, 'id' | 'checksum' | 'serviceDate' | 'downloadedAt' | 'preparedAt' | 'adapterVersion' | 'sources' | 'quality' | 'schemaVersion' | 'routePeriod' | 'gtfs'> & { groupCount: number; platformCount: number; routeCount: number; activePlatformCount: number; inactivePlatformCount: number; unknownPlatformCount: number };
export type RouteSummary = Pick<PidSnapshot['routes'][number], 'id' | 'number' | 'mode' | 'color' | 'validity'>;
export type RouteDrawing = RouteSummary & { geometry: PidSnapshot['routes'][number]['geometry'] };
export interface PidView { summary: PidSummary; stops: GameStop[]; routes: RouteSummary[]; configurationKey: string; referenceDate: string }
export interface PidComparison { summary: PidSummary; diff: SourceDiff; routeDiff: SourceDiff; names: Record<string, string> }
export interface PidFilters { visible: boolean; modes: TransportMode[]; dominant: TransportMode | ''; period: 'all' | 'day' | 'night'; search: string; routesVisible: boolean; routeSearch: string; selectedRoute: string; onlySelectedRoute: boolean; territoryOnly: boolean }
export type ViewBounds = [number, number, number, number];
export interface PidMapState {
  stops: GameStop[]; routes: RouteDrawing[]; selected: GameStop | null; platforms: PidPlatform[]; showPlatforms: boolean;
  zone: AreaGeometry | null; coverage: AreaGeometry | null; coverageReview: boolean; moveReference: boolean;
  highlightedRoute: string;
  onSelect(id: string): void; onReference(point: [number, number]): void; onBounds(bounds: ViewBounds): void;
}
export type PidCommand =
  | { action: 'hydrate'; base: string; configuration: GameStopConfiguration }
  | { action: 'derive'; configuration: GameStopConfiguration }
  | { action: 'refresh'; base: string; configuration: GameStopConfiguration }
  | { action: 'compare-published'; base: string }
  | { action: 'platforms'; groupIds: string[] }
  | { action: 'membership'; area: AreaGeometry; configuration: GameStopConfiguration }
  | { action: 'routes'; bounds: ViewBounds; modes: TransportMode[]; selected: string; onlySelected: boolean; allowedIds?: string[] }
  | { action: 'zone'; point: [number, number]; area: AreaGeometry | null; radius: number }
  | { action: 'compare'; data: ArrayBuffer }
  | { action: 'apply'; configuration: GameStopConfiguration }
  | { action: 'game-release'; world: WorldDraft; airports: Poi[] }
  | { action: 'export' };
