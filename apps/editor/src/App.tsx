import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { addHole, exportWorld, importGeoJson, importWorld, isArea, loadDraft, makeMetricCircle, newFeature, newLayer, newWorld, applyAdministrativeUpdate, isManagedLayer, verifyAdministrativeSources, validateGeometry, validateWorld, type GeoFeature, type GeoLayer, type Geometry, type WorldDraft } from '@jetlag/geo-core';
import { PublicationDialog } from './PublicationDialog';
import { MapCanvas, type MapHandle, type Selection, type Tool } from './MapCanvas';
import type { Position } from 'geojson';
import { readIndexedDraft, persistWorld } from './draft-store';
import { loadBundledAdministrativeData } from './administrative-data';
import { AdministrativeDialog, SourceMetadata } from './AdministrativePanel';
import { PositionInspector } from './PositionInspector';
import { defaultGameStopConfiguration, filterGameStops, type AreaGeometry, type GameStop, type PidPlatform } from '@jetlag/geo-core';
import { usePid } from './use-pid';
import { PidControls, PidSourceDialog } from './PidPanel';
import { readPidPreferences, writePidPreferences } from './pid-preferences';
import { PidStopProperties } from './PidStopProperties';
import type { RouteDrawing, ViewBounds } from './pid-types';
import { type TerritoryMembership, type HidingCoverage } from '@jetlag/geo-core';
import { territoryTask } from './territory-task';
import { TerritoryControls } from './TerritoryControls';
import { PidDataNotice } from './PidDataNotice';
import { defaultParkFilters, filterParkPois, decideParkHierarchies, undoParkBulk, parkMatchesHierarchy, withPublishedParks, withPublishedZoos, withPublishedHospitals, withPublishedCinemas, createManualCinema, removeManualCinema, createManualZoo, removeManualZoo, createManualHospital, removeManualHospital, applyParkUpdate, decidePoi, createManualPark, mergeParks, resolvePois, verifyPoiSources, type Poi, type PoiDecision, type ParkDecisionChange } from '@jetlag/geo-core';
import { publishedAirports, publishedParks, publishedZoos, publishedHospitals, publishedCinemas, publishedLibraries, publishedUnlocatedLibraries } from './poi-data';
import { PoiControls, PoiProperties, ParkImportDialog } from './PoiPanel';
import { LibraryProperties, UnlocatedLibraryProperties, NewLibraryDialog, type LibraryPlacement } from './LibraryProperties';
import { withPublishedLibraries, resolveUnlocatedLibraries, decideUnlocatedLibrary, addLibrary, verifyLibraryDecision, removeManualLibrary, type UnlocatedLibrary } from '@jetlag/geo-core';
import { loadDefaultGameArea } from './default-game-area';
import { DefaultAreaLoadError, initializeEditorWorld, recordGameAreaChoice, withDefaultGameArea } from './world-initialization';

interface History { past: WorldDraft[]; present: WorldDraft; future: WorldDraft[] }
const withBundledPois = (saved: WorldDraft['poi']) => withPublishedCinemas(withPublishedLibraries(withPublishedHospitals(withPublishedZoos(withPublishedParks(saved, publishedParks), publishedZoos), publishedHospitals), publishedLibraries, publishedUnlocatedLibraries), publishedCinemas);

const toolNames: Record<Tool, string> = { select: 'Výběr', point: 'Bod', line: 'Linie', polygon: 'Polygon', hole: 'Otvor', circle: 'Kruh', measure: 'Měření', edit: 'Úprava vrcholů', inspect: 'Ověřit polohu', park: 'Kreslení parku', zoo: 'Vložení zoo', hospital: 'Vložení nemocnice', library: 'Vložení knihovny', cinema: 'Vložení kina' };
function CursorIcon() { return <svg className="cursor-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 3 19 13 11 14 8 21Z" /></svg>; }
function errorText(error: unknown) { return error instanceof Error ? error.message : 'Operace se nezdařila.'; }
function download(contents: string, filename: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function App() {
  const [initial] = useState(newWorld);
  const [history, setHistory] = useState<History>({ past: [], present: initial, future: [] });
  const world = history.present;
  const latestWorld = useRef(world); latestWorld.current = world;
  const [activeId, setActiveId] = useState(world.layers.find(l => l.kind === 'custom')?.id ?? world.layers[0].id);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [error, setError] = useState('');
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [defaultLoadFailed, setDefaultLoadFailed] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [hydrating, setHydrating] = useState(true);
  const [bundled, setBundled] = useState<GeoLayer[]>([]);
  const [sourceError, setSourceError] = useState('');
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [publicationOpen, setPublicationOpen] = useState(false);
  const [relocationNotice, setRelocationNotice] = useState(() => { try { return !sessionStorage.getItem('jetlag-editor-location-notice'); } catch { return true; } });
  const [testPoint, setTestPoint] = useState<Position | null>(null);
  const [radius, setRadius] = useState('250');
  const [measurement, setMeasurement] = useState<number | null>(null);
  const [tileStatus, setTileStatus] = useState<'missing' | 'loading' | 'ready' | 'error'>('missing');
  const [apiKey, setApiKey] = useState(import.meta.env.VITE_MAPY_API_KEY ?? '');
  const [mapSettings, setMapSettings] = useState(false);
  const [importing, setImporting] = useState(false);
  const [filter, setFilter] = useState('');
  const map = useRef<MapHandle>(null);
  const active = world.layers.find(l => l.id === activeId) ?? world.layers[0];
  const selectedLayer = world.layers.find(l => l.id === selected?.layerId);
  const selectedFeature = selectedLayer?.features.find(f => f.id === selected?.featureId);
  const editing = tool === 'edit';
  const poiConfiguration = useMemo(() => withBundledPois(world.poi), [world.poi]);
  const pois = useMemo(() => resolvePois(publishedAirports, poiConfiguration), [poiConfiguration]);
  const parkFilters = useMemo(() => poiConfiguration.parkFilters ?? defaultParkFilters(), [poiConfiguration.parkFilters]);
  const mapPois = useMemo(() => filterParkPois(pois, parkFilters, 'map'), [pois, parkFilters]);
  const [parkBulkBusy, setParkBulkBusy] = useState(false);
  const [parkBulkUndo, setParkBulkUndo] = useState<{ worldId: string; changes: ParkDecisionChange[] } | null>(null);
  const [parkBulkNotice, setParkBulkNotice] = useState<{ message: string; skipped: { id: string; name: string; reason: string }[] } | null>(null);
  async function bulkParkStatus(status: 'approved' | 'excluded') {
    const before = latestWorld.current;
    const configuration = withBundledPois(before.poi);
    const selectedHierarchies = (configuration.parkFilters ?? defaultParkFilters()).hierarchies;
    const count = resolvePois([], configuration).filter(poi => parkMatchesHierarchy(poi, selectedHierarchies)).length;
    if (!count || !confirm(`${status === 'approved' ? 'Schválit' : 'Vyloučit'} všechny parky vybraných hierarchií (${count})? Hledání, stav a mapový výřez nemají na výběr vliv.`)) return;
    setParkBulkBusy(true); setParkBulkNotice(null);
    try {
      const result = await decideParkHierarchies(configuration, selectedHierarchies, status, () => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
      if (latestWorld.current !== before) throw new Error('Svět se během zpracování změnil. Hromadná akce nebyla uložena; spusťte ji znovu.');
      if (result.changed) {
        commit({ ...before, poi: result.configuration });
        setParkBulkUndo({ worldId: before.id, changes: result.undo });
      }
      setParkBulkNotice({ message: `Výběr: ${result.matched}. ${status === 'approved' ? 'Schváleno' : 'Vyloučeno'}: ${result.changed}. Beze změny: ${result.matched - result.changed - result.skipped.length}. Přeskočeno: ${result.skipped.length}.`, skipped: result.skipped });
    } catch (error) { setError(errorText(error)); }
    finally { setParkBulkBusy(false); }
  }
  function undoParkStatus() {
    if (!parkBulkUndo || parkBulkUndo.worldId !== latestWorld.current.id) return;
    const before = latestWorld.current;
    const result = undoParkBulk(withBundledPois(before.poi), parkBulkUndo.changes);
    if (result.restored) commit({ ...before, poi: result.configuration });
    setParkBulkUndo(null);
    setParkBulkNotice({ message: `Vráceno rozhodnutí: ${result.restored}. Zachováno pozdějších individuálních změn: ${result.preserved}.`, skipped: [] });
  }
  const [poiSelected, setPoiSelected] = useState<string | null>(null);
  const unlocatedLibraries = useMemo(() => resolveUnlocatedLibraries(poiConfiguration), [poiConfiguration]);
  const selectedLibraryCandidate = unlocatedLibraries.find(row => row.id === poiSelected);
  const [libraryDialog, setLibraryDialog] = useState(false);
  const [libraryPlacement, setLibraryPlacement] = useState<LibraryPlacement | null>(null);
  const selectedPoi = pois.find(p => p.id === poiSelected) ?? null;
  const [poiMoving, setPoiMoving] = useState(false);
  const [parkImporting, setParkImporting] = useState(false);
  const [parkImportPreview, setParkImportPreview] = useState<AreaGeometry | null>(null);
  function selectPoi(poi: Poi) {
    setPoiSelected(poi.id); setPoiMoving(false); setSelected(null); setPidSelected(null); setTool('select');
    if (isArea(poi.geometry)) map.current?.fitArea(poi.geometry); else map.current?.focus(poi.point);
  }
  function selectLibraryCandidate(row: UnlocatedLibrary) {
    setPoiSelected(row.id); setPoiMoving(false); setSelected(null); setPidSelected(null); setTool('select');
  }
  function placeLibrary(value: LibraryPlacement) {
    setLibraryPlacement(value); setLibraryDialog(false); setPoiSelected(null); setPoiMoving(false); setSelected(null); setPidSelected(null); setTool('library');
  }
  function locateLibrary(point: [number, number], value: LibraryPlacement) {
    const configuration = withBundledPois(latestWorld.current.poi), candidate = resolveUnlocatedLibraries(configuration).find(row => row.id === value.candidateId);
    if (value.candidateId && !candidate) throw new Error('Kandidát knihovny již má polohu nebo není dostupný.');
    const result = addLibrary(configuration, point, value, candidate);
    commit({ ...latestWorld.current, poi: result.configuration }); setLibraryPlacement(null); selectPoi(result.poi);
  }
  function updateLibrary(change: Partial<PoiDecision>, confirmed: boolean) {
    if (!selectedPoi) return;
    attempt(() => commit({ ...latestWorld.current, poi: verifyLibraryDecision(withBundledPois(latestWorld.current.poi), selectedPoi, change, confirmed) }));
  }
  function updatePoi(change: Partial<PoiDecision>): boolean {
    if (!selectedPoi) return false;
    try { commit({ ...latestWorld.current, poi: selectedPoi.category === 'library' ? verifyLibraryDecision(withBundledPois(latestWorld.current.poi), selectedPoi, change, false) : decidePoi(withBundledPois(latestWorld.current.poi), selectedPoi, change) }); return true; }
    catch (error) { setError(errorText(error)); return false; }
  }
  const pidConfiguration = useMemo(() => world.gameStops ?? defaultGameStopConfiguration(), [world.gameStops]);
  const pid = usePid(pidConfiguration);
  const pidRequest = pid.request;
  const [pidPreferences] = useState(() => readPidPreferences());
  const [pidFilters, setPidFilters] = useState(pidPreferences.value.filters);
  const [pidPreferencesWarning, setPidPreferencesWarning] = useState(pidPreferences.warning);
  const [pidSelected, setPidSelected] = useState<string | null>(null);
  const [pidSources, setPidSources] = useState(false);
  const [pidPlatforms, setPidPlatforms] = useState<PidPlatform[]>([]);
  const [pidShowPlatforms, setPidShowPlatforms] = useState(pidPreferences.value.showPlatforms);
  const [pidShowZone, setPidShowZone] = useState(pidPreferences.value.showZone);
  const [pidMoving, setPidMoving] = useState(false);
  const [pidPreview, setPidPreview] = useState<[number, number] | null>(null);
  const [pidZone, setPidZone] = useState<AreaGeometry | null>(null);
  const [pidZoneStatus, setPidZoneStatus] = useState<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle');
  const [pidBounds, setPidBounds] = useState<ViewBounds>([14.1, 49.9, 14.8, 50.25]);
  const [pidRoutes, setPidRoutes] = useState<RouteDrawing[]>([]);
  const pidStop = useMemo(() => pid.view?.stops.find(stop => stop.id === pidSelected) ?? null, [pid.view, pidSelected]);
  const pidPreviewStop: GameStop | null = useMemo(() => pidStop && (pidPreview || pid.deriving) ? { ...pidStop, point: pidPreview ?? pidStop.point, eligibility: 'review', reasons: [...pidStop.reasons, pid.deriving ? 'Přepočítávám pravidla PID; vyčkejte na ověřený výsledek.' : 'Návrh referenčního bodu ještě nebyl schválen.'] } : pidStop, [pidStop, pidPreview, pid.deriving]);
  const gameGeometry = world.layers.find(layer => layer.kind === 'game_area')?.features[0]?.geometry;
  const pidArea = gameGeometry && isArea(gameGeometry) ? gameGeometry : null;
  const presetActivated = useRef(pidPreferences.saved);
  useEffect(() => {
    if (!presetActivated.current && world.layers.find(layer => layer.kind === 'game_area')?.features[0]?.attributes.preset === 'praha-municipal-union') {
      presetActivated.current = true; setPidFilters(filters => ({ ...filters, territoryOnly: true }));
    }
  }, [world]);
  const [pragueBusy, setPragueBusy] = useState(false);
  const [membershipState, setMembershipState] = useState<{ view: typeof pid.view; area: AreaGeometry; value?: TerritoryMembership; error?: string } | null>(null);
  const membership = !pid.deriving && membershipState?.view === pid.view && membershipState?.area === pidArea ? membershipState.value : undefined;
  const membershipError = membershipState?.view === pid.view && membershipState?.area === pidArea ? membershipState.error ?? '' : '';
  const [showCoverage, setShowCoverage] = useState(pidPreferences.value.showCoverage);
  useEffect(() => {
    try { writePidPreferences(localStorage, { schemaVersion: 1, filters: pidFilters, showCoverage, showPlatforms: pidShowPlatforms, showZone: pidShowZone }); }
    catch { setPidPreferencesWarning('Nastavení PID nelze uložit mezi návštěvami. Zdrojový snapshot a herní draft tím nejsou smazány.'); }
  }, [pidFilters, showCoverage, pidShowPlatforms, pidShowZone]);
  const membershipFailure = pidFilters.territoryOnly ? !pidArea ? 'Herní oblast není definovaná; polohu nelze určit.' : membershipError : '';
  const membershipPending = !!pid.view && pidFilters.territoryOnly && !membership && !membershipFailure;
  const [coverageState, setCoverageState] = useState<{ stops: GameStop[]; area: AreaGeometry; radius: number; value?: HidingCoverage; error?: string } | null>(null);
  const coverageCurrent = showCoverage && !pid.deriving && coverageState?.stops === pid.view?.stops && coverageState?.area === pidArea && coverageState?.radius === pidConfiguration.radiusMeters;
  const coverage = coverageCurrent ? coverageState?.value ?? null : null;
  const coverageError = coverageCurrent ? coverageState?.error : '';
  const filteredPidView = useMemo(() => {
    if (!pid.view || !pidFilters.territoryOnly) return pid.view;
    const previous = membershipState?.area === pidArea && membershipState.view?.configurationKey === pid.view.configurationKey ? membershipState : null;
    const base = membership ? pid.view : previous?.value ? previous.view! : pid.view;
    const stopIds = new Set((membership ?? previous?.value)?.stopIds), routeIds = new Set((membership ?? previous?.value)?.routeIds);
    return { ...base, stops: base.stops.filter(stop => stopIds.has(stop.id)), routes: base.routes.filter(route => routeIds.has(route.id)) };
  }, [pid.view, pidFilters.territoryOnly, membership, membershipState, pidArea]);
  const pidStops = useMemo(() => pidFilters.visible && filteredPidView ? filterGameStops(filteredPidView.stops, { modes: pidFilters.modes, dominant: pidFilters.dominant || undefined, period: pidFilters.period, search: pidFilters.search }) : [], [filteredPidView, pidFilters.visible, pidFilters.modes, pidFilters.dominant, pidFilters.period, pidFilters.search]);
  useEffect(() => {
    if (!pid.ready || !pid.view || !pidArea || !pidFilters.territoryOnly || pid.deriving) return;
    let cancelled = false;
    const view = pid.view, area = pidArea;
    // Retain the preceding spatial result until the replacement is ready.
    pidRequest<TerritoryMembership>({ action: 'membership', area, configuration: pidConfiguration }).then(value => { if (!cancelled) setMembershipState({ view, area, value }); }).catch(error => { if (!cancelled) setMembershipState({ view, area, error: errorText(error) }); });
    return () => { cancelled = true; };
  }, [pid.ready, pid.view, pidArea, pidFilters.territoryOnly, pidConfiguration, pidRequest, pid.deriving]);
  useEffect(() => {
    // Source diagnostics must remain accessible for inactive/unknown nodes,
    // whose absence of an active point prevents territorial membership.
    if (pidFilters.territoryOnly && membership && pidStop?.activity === 'active' && pidStop.point && !membership.stopIds.includes(pidStop.id)) setPidSelected(null);
  }, [pidFilters.territoryOnly, membership, pidStop]);
  useEffect(() => {
    if (!showCoverage || !pid.view || !pidArea || pid.deriving) return;
    const controller = new AbortController(); const stops = pid.view.stops, area = pidArea, radius = pidConfiguration.radiusMeters;
    setCoverageState(null);
    territoryTask<HidingCoverage>({ action: 'coverage', stops, area, radius }, controller.signal).then(value => setCoverageState({ stops, area, radius, value })).catch(error => { if (!controller.signal.aborted) setCoverageState({ stops, area, radius, error: errorText(error) }); });
    return () => controller.abort();
  }, [showCoverage, pid.view, pidArea, pid.deriving, pidConfiguration.radiusMeters]);
  useEffect(() => { setPidPreview(null); setPidMoving(false); }, [pidSelected]);
  useEffect(() => { if (tool !== 'select') setPidMoving(false); }, [tool]);
  useEffect(() => {
    if (!pidStop) { setPidPlatforms([]); return; }
    let cancelled = false;
    pidRequest<PidPlatform[]>({ action: 'platforms', groupIds: pidStop.groupIds }).then(value => { if (!cancelled) setPidPlatforms(value); }).catch(error => { if (!cancelled) setError(errorText(error)); });
    return () => { cancelled = true; };
  }, [pidStop, pidRequest]);
  useEffect(() => {
    if (!pidPreviewStop?.point || !pidShowZone || !pidArea) { setPidZone(null); setPidZoneStatus('idle'); return; }
    let cancelled = false;
    setPidZone(null); setPidZoneStatus('loading');
    pidRequest<AreaGeometry | null>({ action: 'zone', point: pidPreviewStop.point, area: pidArea, radius: pidConfiguration.radiusMeters }).then(value => { if (!cancelled) { setPidZone(value); setPidZoneStatus(value ? 'ready' : 'empty'); } }).catch(error => { if (!cancelled) { setPidZoneStatus('error'); setError(errorText(error)); } });
    return () => { cancelled = true; };
  }, [pidPreviewStop, pidShowZone, pidArea, pidConfiguration.radiusMeters, pidRequest]);
  useEffect(() => {
    if (!pid.ready || !pid.view || !pidFilters.routesVisible) { setPidRoutes([]); return; }
    if (membershipPending || membershipFailure) return;
    let cancelled = false;
    pidRequest<RouteDrawing[]>({ action: 'routes', bounds: pidBounds, modes: pidFilters.modes, selected: pidFilters.selectedRoute, onlySelected: pidFilters.onlySelectedRoute, allowedIds: pidFilters.territoryOnly ? membership?.routeIds ?? [] : undefined }).then(value => { if (!cancelled) setPidRoutes(value); }).catch(error => { if (!cancelled) setError(errorText(error)); });
    return () => { cancelled = true; };
  }, [pid.ready, pid.view, pidBounds, pidFilters.modes, pidFilters.routesVisible, pidFilters.selectedRoute, pidFilters.onlySelectedRoute, pidFilters.territoryOnly, membership, pidRequest, membershipPending, membershipFailure]);
  async function restorePragueArea() {
    if (pragueBusy) return;
    if (pidArea && !confirm('Nahradit současnou herní hranici výchozím územím Prahy? Vlastní objekty zůstanou zachované. Změnu lze vrátit tlačítkem Zpět.')) return;
    setPragueBusy(true);
    try {
      const boundary = await loadDefaultGameArea();
      commit(withDefaultGameArea(latestWorld.current, boundary)); setTool('select'); setSelected(null); setPidSelected(null);
      if (defaultLoadFailed) { setDefaultLoadFailed(false); setStorageBlocked(false); }
      setPidFilters(filters => ({ ...filters, territoryOnly: true })); map.current?.fitArea(boundary.geometry);
    } catch (error) { setError(errorText(error)); } finally { setPragueBusy(false); }
  }
  function selectPid(stop: GameStop, focus = false) {
    setPoiSelected(null); setPoiMoving(false); setPidSelected(stop.id); setSelected(null); setTool(value => value === 'inspect' ? 'inspect' : 'select');
    if (focus && stop.point) map.current?.focus(stop.point);
  }
  async function exportPid() {
    const bytes = await pidRequest<ArrayBuffer>({ action: 'export' });
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/gzip' }));
    const link = document.createElement('a'); link.href = url; link.download = `jetlag-praha-pid-${pid.view?.summary.serviceDate ?? 'snapshot'}.json.gz`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  useEffect(() => {
    const controller = new AbortController();
    initializeEditorWorld({ placeholder: initial, readIndexed: readIndexedDraft, readLegacy: () => loadDraft(localStorage), loadDefault: () => loadDefaultGameArea(controller.signal) }).then(loaded => {
      if (controller.signal.aborted) return;
      // Complete the additive POI initialization before enabling autosave.
      const saved = { ...loaded, poi: withBundledPois(loaded.poi) };
      setHistory({ past: [], present: saved, future: [] });
      setActiveId(saved.layers.find(l => l.kind === 'custom')?.id ?? saved.layers[0].id);
      setStorageBlocked(false); setError('');
    }).catch(error => {
      if (controller.signal.aborted) return;
      setStorageBlocked(true);
      if (error instanceof DefaultAreaLoadError) {
        setHistory({ past: [], present: error.world, future: [] }); setDefaultLoadFailed(true); setError(error.message);
      } else setError('Uložený draft nelze načíst nebo nesouhlasí kontrolní součet zdroje. Nebyl přepsán; importujte zálohu nebo obnovte původní data. Automatické ukládání je pozastavené.');
    }).finally(() => { if (!controller.signal.aborted) setHydrating(false); });
    return () => controller.abort();
  }, [initial]);

  useEffect(() => {
    if (storageBlocked || hydrating) return;
    let cancelled = false;
    setSaveStatus('Ukládám…');
    persistWorld(world).then(status => { if (!cancelled) setSaveStatus(status); }).catch(() => { if (!cancelled) setSaveStatus('Neuloženo! Úložiště je nedostupné nebo plné. Exportujte zálohu.'); });
    return () => { cancelled = true; };
  }, [world, storageBlocked, hydrating]);

  useEffect(() => {
    const controller = new AbortController();
    loadBundledAdministrativeData(controller.signal).then(setBundled).catch(error => {
      if (!controller.signal.aborted) setSourceError(`Administrativní hranice nelze načíst: ${errorText(error)}`);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (hydrating || !['select', 'inspect'].includes(tool) || !bundled.length || !bundled.some(l => !world.layers.some(w => w.id === l.id))) return;
    try {
      let enriched = world;
      for (const layer of bundled) if (!enriched.layers.some(l => l.id === layer.id)) enriched = applyAdministrativeUpdate(enriched, layer);
      setHistory(h => ({ ...h, present: enriched }));
    } catch (error) { setSourceError(errorText(error)); }
  }, [bundled, world, hydrating, tool]);

  useEffect(() => {
    if (hydrating || storageBlocked || !['select', 'inspect'].includes(tool)) return;
    if (!publishedParks.sources.length && !publishedParks.manual.length && !publishedZoos.length && !publishedHospitals.length && !publishedLibraries.length && !publishedUnlocatedLibraries.length) return;
    const effective = withBundledPois(world.poi);
    if (JSON.stringify(effective) === JSON.stringify(world.poi)) return;
    setHistory(h => ({ ...h, present: { ...h.present, poi: effective } }));
  }, [hydrating, storageBlocked, tool, world.poi]);

  function commit(next: WorldDraft) {
    try {
      const validated = validateWorld({ ...recordGameAreaChoice(latestWorld.current, next), updatedAt: new Date().toISOString() });
      setHistory(h => ({ past: [...h.past.slice(-49), h.present], present: validated, future: [] }));
      setError('');
    } catch (error) { setError(errorText(error)); throw error; }
  }
  function attempt(action: () => void) { try { action(); } catch (error) { setError(errorText(error)); } }
  function updateLayer(id: string, change: Partial<GeoLayer>) {
    commit({ ...world, layers: world.layers.map(l => l.id === id ? { ...l, ...change } : l) });
  }
  function updateFeature(change: Partial<GeoFeature>) {
    if (!selectedFeature || !selectedLayer) return;
    if (isManagedLayer(selectedLayer)) throw new Error('Oficiální hranice měňte pouze aktualizací zdroje. Pro vlastní geometrii použijte vlastní vrstvu.');
    updateLayer(selectedLayer.id, { features: selectedLayer.features.map(f => f.id === selectedFeature.id ? { ...f, ...change } : f) });
  }
  function addGeometry(geometry: Geometry, circle?: { center: Position; radiusMeters: number }) {
    setPidSelected(null);
    if (tool === 'library') {
      if (geometry.type !== 'Point' || !libraryPlacement) throw new Error('Nejdříve vyplňte údaje knihovny.');
      locateLibrary([geometry.coordinates[0], geometry.coordinates[1]], libraryPlacement); return;
    }
    if (tool === 'cinema') {
      if (geometry.type !== 'Point') throw new Error('Kino musí mít bodovou geometrii.');
      const cinema = createManualCinema([geometry.coordinates[0], geometry.coordinates[1]]);
      commit({ ...world, poi: { ...poiConfiguration, manual: [...poiConfiguration.manual, cinema] } });
      selectPoi(cinema); return;
    }
    if (tool === 'hospital') {
      if (geometry.type !== 'Point') throw new Error('Nemocnice musí být bod.');
      const hospital = createManualHospital([geometry.coordinates[0], geometry.coordinates[1]]);
      commit({ ...world, poi: { ...poiConfiguration, manual: [...poiConfiguration.manual, hospital] } });
      selectPoi(hospital); return;
    }
    if (tool === 'zoo') {
      if (geometry.type !== 'Point') throw new Error('Zoo musí být bod.');
      const zoo = createManualZoo([geometry.coordinates[0], geometry.coordinates[1]]);
      commit({ ...world, poi: { ...poiConfiguration, manual: [...poiConfiguration.manual, zoo] } });
      selectPoi(zoo); return;
    }
    if (tool === 'park') {
      if (!isArea(geometry)) throw new Error('Park musí být polygon.');
      const park = createManualPark(geometry);
      commit({ ...world, poi: { ...poiConfiguration, manual: [...poiConfiguration.manual, park] } });
      selectPoi(park); return;
    }
    setPoiSelected(null); setPoiMoving(false);
    if (tool === 'hole') {
      if (!selectedFeature || !isArea(selectedFeature.geometry) || geometry.type !== 'Polygon') throw new Error('Nejprve vyberte polygon, do kterého chcete nakreslit otvor.');
      updateFeature({ geometry: addHole(selectedFeature.geometry, geometry) });
    } else {
      if (isManagedLayer(active)) throw new Error('Do oficiální vrstvy nelze kreslit. Vyberte vlastní vrstvu nebo herní oblast.');
      if (!active.visible) throw new Error('Aktivní vrstva je skrytá. Nejprve ji zobrazte.');
      if (active.kind === 'game_area' && (!isArea(geometry) || active.features.length)) throw new Error('Herní oblast musí být jeden Polygon nebo MultiPolygon. Pro další objekty vyberte vlastní vrstvu.');
      const f = { ...newFeature(geometry, circle ? `Kruh ${circle.radiusMeters} m` : active.kind === 'game_area' ? 'Herní hranice' : 'Nový objekt', active.source), ...(circle ? { circle } : {}) };
      updateLayer(active.id, { features: [...active.features, f] });
      setSelected({ layerId: active.id, featureId: f.id });
    }
    setTool('select');
  }
  function undo(redo = false) {
    setTool('select'); setSelected(null); setPoiSelected(null); setPoiMoving(false);
    setHistory(h => redo
      ? h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h
      : h.past.length ? { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [h.present, ...h.future] } : h);
  }
  const areaReady = world.layers.find(l => l.kind === 'game_area')!.features.length > 0;

  return <div className="app-shell" aria-busy={hydrating}>
    {(hydrating || pragueBusy) && <div className="modal-backdrop"><div className="import-dialog" role="status">{pragueBusy ? 'Načítám ověřenou výchozí hranici Prahy…' : 'Načítám uložený svět nebo výchozí hranici Prahy…'}</div></div>}
    <header className="app-header">
      <div className="brand-mark" aria-hidden="true">J<span><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 13 13 3M3 3h10v10" /></svg></span></div>
      <div className="brand-copy"><span className="eyebrow">JET LAG / PRAHA</span><h1>Geografický editor</h1></div>
      <span className="version-tag">ITERACE 04A <span>·</span> DRAFT</span>
      <div className="header-actions">
        <button disabled={editing} onClick={() => setPublicationOpen(true)}>Publikace herních podkladů</button>
        <button disabled={editing} onClick={() => setSourcesOpen(true)}>Správa zdrojů</button>
        <button disabled={editing} onClick={() => setPidSources(true)}>Doprava PID</button>
        <button onClick={() => setMapSettings(v => !v)}>Nastavení mapy</button>
        <button disabled={editing} onClick={() => setImporting(true)}>↓ Import</button>
        <button className="primary" disabled={editing} onClick={() => attempt(() => download(exportWorld(world), 'jetlag-praha-draft.json'))}>↑ Export zálohy</button>
      </div>
    </header>
    {relocationNotice && !hydrating && <div className="message warning">Editor má novou adresu /JetLagPrague/editor/. Úložiště i formát světa zůstávají stejné. Před dalšími úpravami si stáhněte úplnou zálohu. <button onClick={() => download(exportWorld(world), 'jetlag-praha-draft.json')}>Stáhnout zálohu</button><button aria-label="Zavřít oznámení přesunu" onClick={() => { try { sessionStorage.setItem('jetlag-editor-location-notice', 'seen'); } catch { /* Storage may be disabled. */ } setRelocationNotice(false); }}>×</button></div>}
    {error && <div className="message error" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Zavřít chybu">×</button></div>}
    {storageBlocked && <div className="message warning">Automatické ukládání je pozastavené, aby zůstala zachována původní data. <button onClick={() => { if (confirm('Nahradit původní uložený záznam současným draftem?')) setStorageBlocked(false); }}>Nahradit uložený draft</button></div>}
    {mapSettings && <form className="map-settings" onSubmit={e => { e.preventDefault(); setApiKey(String(new FormData(e.currentTarget).get('key') ?? '')); setMapSettings(false); }}>
      <label>Klientský API klíč Mapy.com <input name="key" type="password" autoComplete="off" defaultValue={apiKey} /></label>
      <p>Klíč se použije jen do obnovení stránky. Pro trvalé nastavení použijte <code>.env.local</code>. Není součástí draftu ani exportu. Klientský klíč je viditelný v síťových požadavcích; omezte jeho referery a služby.</p>
      <button className="primary">Použít klíč</button><button type="button" onClick={() => setMapSettings(false)}>Zavřít</button>
    </form>}
    {pid.view && <PidDataNotice summary={pid.view.summary} />}
    <div className="workspace">
      <aside className="left-panel panel">
        <div className="panel-heading"><div><span className="eyebrow">PRACOVNÍ PROSTOR</span><h2>Vrstvy světa</h2></div><span className="count">{world.layers.length}</span></div>
        <label className="world-name">Název světa<input aria-label="Název světa" disabled={editing} key={world.id + world.title} defaultValue={world.title} onBlur={e => { if (e.target.value.trim() && e.target.value !== world.title) attempt(() => commit({ ...world, title: e.target.value.trim() })); }} /></label>
        <div className="layer-list" aria-label="Vrstvy">{world.layers.map(layer => <article key={layer.id} className={`layer-card ${active.id === layer.id ? 'active' : ''}`}>
          <div className="layer-topline"><input aria-label={`Zobrazit ${layer.title}`} type="checkbox" checked={layer.visible} disabled={editing} onChange={e => attempt(() => updateLayer(layer.id, { visible: e.target.checked }))} /><input className="color-input" aria-label={`Barva ${layer.title}`} type="color" value={layer.color} disabled={editing} onChange={e => attempt(() => updateLayer(layer.id, { color: e.target.value }))} /><button className="layer-select" disabled={editing} onClick={() => { setActiveId(layer.id); setTool('select'); }}>{layer.title}</button><span className="count small">{layer.features.length}</span></div>
          <div className="layer-meta"><span>{layer.dataset ? 'ZDROJOVÉ HRANICE' : layer.kind === 'game_area' ? 'HERNÍ OBLAST' : 'VLASTNÍ VRSTVA'}</span>{active.id === layer.id && <span className="active-label">AKTIVNÍ</span>}</div>
          {layer.dataset && active.id === layer.id && <details><summary>Zdroj a licence</summary><SourceMetadata layer={layer} /></details>}
          {!layer.dataset && active.id === layer.id && <details><summary>Nastavení vrstvy</summary><form onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); attempt(() => updateLayer(layer.id, { title: String(data.get('title')).trim(), source: String(data.get('source')) })); }}><fieldset disabled={editing}>
            <label>Název vrstvy<input name="title" defaultValue={layer.title} required maxLength={200} /></label><label>Zdroj vrstvy<input name="source" defaultValue={layer.source} maxLength={10000} /></label><button>Uložit vrstvu</button>
            {layer.kind !== 'game_area' && <button type="button" className="danger" onClick={() => { if (confirm(`Smazat vrstvu „${layer.title}“ včetně ${layer.features.length} objektů?`)) { attempt(() => commit({ ...world, layers: world.layers.filter(l => l.id !== layer.id) })); setSelected(null); } }}>Smazat vrstvu</button>}
          </fieldset></form></details>}
        </article>)}</div>
        <button className="add-layer" disabled={editing} onClick={() => { const layer = newLayer(`Vrstva ${world.layers.length}`); attempt(() => commit({ ...world, layers: [...world.layers, layer] })); setActiveId(layer.id); }}>+ Přidat vrstvu</button>
        {world.gameAreaInitialization?.state === 'legacy-empty' && <p className="source-load-error" role="status" data-testid="legacy-empty-area">Uložený svět nemá herní oblast. Nelze zjistit, zda byla dříve smazaná, proto ji automaticky nedoplňujeme. Obnovit ji můžete tlačítkem níže; vlastní data zůstanou zachovaná.</p>}
        <TerritoryControls hasArea={!!pidArea} busy={pragueBusy} disabled={editing} onPrague={() => void restorePragueArea()} onFit={() => { if (pidArea) map.current?.fitArea(pidArea); }} territoryOnly={pidFilters.territoryOnly} onFilter={territoryOnly => setPidFilters(filters => ({ ...filters, territoryOnly }))} filterError={!!membershipFailure} membershipStatus={!pidArea ? 'Herní oblast není definovaná; polohu nelze určit.' : membershipError || (membership ? `${membership.stopIds.length} zastávek a ${membership.routeIds.length} linek v oblasti · ${membership.unknownStops} neurčených bodů` : 'Ověřuji polohu zastávek a průnik tras…')} showCoverage={showCoverage} onCoverage={setShowCoverage} radius={pidConfiguration.radiusMeters} coverage={coverage} coverageStatus={!pidArea ? 'Chybí herní oblast.' : coverageError || (coverage ? coverage.geometry ? 'Společná úkrytová plocha zobrazena.' : 'Žádná společná úkrytová plocha.' : 'Počítám sjednocení všech úkrytových zón…')} />
        <PidControls disabled={editing} view={filteredPidView} sourceView={pid.view} filterPending={membershipPending} filterError={membershipFailure} loadError={pid.loadError} updateError={pid.updateError} warning={[pid.warning, pidPreferencesWarning].filter(Boolean).join(" ")} filters={pidFilters} onChange={setPidFilters} onSelect={stop => selectPid(stop, true)} selected={pidSelected} onSources={() => setPidSources(true)} onRetry={() => void pid.refresh()} busy={pid.busy} radius={pidConfiguration.radiusMeters} onRadius={radiusMeters => attempt(() => commit({ ...world, gameStops: { ...pidConfiguration, radiusMeters } }))} />
        <PoiControls onAddCinema={() => { setTool(value => value === 'cinema' ? 'select' : 'cinema'); setPoiSelected(null); setPoiMoving(false); setSelected(null); setPidSelected(null); }} addingCinema={tool === 'cinema'} libraryCandidates={unlocatedLibraries} onSelectLibraryCandidate={selectLibraryCandidate} onAddLibrary={() => { if (tool === 'library') { setTool('select'); setLibraryPlacement(null); } else setLibraryDialog(true); }} addingLibrary={tool === 'library'} onFilters={parkFilters => attempt(() => commit({ ...world, poi: { ...poiConfiguration, parkFilters } }))} onBulk={status => void bulkParkStatus(status)} onUndoBulk={() => attempt(undoParkStatus)} canUndoBulk={!!parkBulkUndo && parkBulkUndo.worldId === world.id} bulkBusy={parkBulkBusy} bulkNotice={parkBulkNotice} pois={pois} configuration={poiConfiguration} selected={poiSelected} disabled={editing || hydrating} drawing={tool === 'park'} onVisibility={visibility => attempt(() => commit({ ...world, poi: { ...poiConfiguration, visibility } }))} onSelect={selectPoi} onAdd={() => { setTool(value => value === 'park' ? 'select' : 'park'); setSelected(null); setPidSelected(null); setPoiSelected(null); setPoiMoving(false); }} onImport={() => setParkImporting(true)} onAddZoo={() => { setTool(value => value === 'zoo' ? 'select' : 'zoo'); setPoiSelected(null); setPoiMoving(false); setSelected(null); setPidSelected(null); }} addingZoo={tool === 'zoo'} onAddHospital={() => { setTool(value => value === 'hospital' ? 'select' : 'hospital'); setPoiSelected(null); setPoiMoving(false); setSelected(null); setPidSelected(null); }} addingHospital={tool === 'hospital'} onMerge={(ids, name) => attempt(() => { const result = mergeParks(poiConfiguration, pois.filter(p => ids.includes(p.id)), name); commit({ ...world, poi: result.configuration }); selectPoi(result.park); })} />
        <div className="objects-heading"><h3>Objekty <span>{active.features.length}</span></h3><button onClick={() => map.current?.fit()}>Zobrazit vše</button></div>
        <label className="search-label"><input aria-label="Hledat objekty aktivní vrstvy" placeholder="Vyhledat oblast nebo objekt…" value={filter} onChange={e => setFilter(e.target.value)} /></label>
        <div className="object-list">{active.features.filter(f => f.name.toLocaleLowerCase('cs').includes(filter.toLocaleLowerCase('cs'))).map(f => <button disabled={editing} key={f.id} className={selected?.featureId === f.id && selected.layerId === active.id ? 'chosen' : ''} onClick={() => { setPoiSelected(null); setPoiMoving(false); setPidSelected(null); setSelected({ layerId: active.id, featureId: f.id }); setTool('select'); }}><span aria-hidden="true">{f.geometry.type === 'Point' ? '●' : f.geometry.type === 'LineString' ? '╱' : '⬡'}</span><span>{f.name}<small>{f.circle ? 'Metrický kruh' : f.geometry.type}</small></span></button>)}
          {!active.features.length && <p className="empty-copy">Vrstva je zatím prázdná.<br />Nakreslete první objekt nebo importujte GeoJSON.</p>}
        </div>
        {sourceError && <div className="source-load-error" role="status">{sourceError}</div>}
        <div className="storage-note"><span className="status-dot" />{saveStatus || 'Lokální draft'}<p>Data zůstávají v tomto prohlížeči. Nejde o týmovou ani cloudovou databázi. Pravidelně exportujte zálohu.</p></div>
      </aside>
      <main className="map-panel">
        <div className="toolbar" aria-label="Geografické nástroje">
          {(['select', 'point', 'line', 'polygon', 'hole', 'circle', 'measure', 'inspect'] as Tool[]).map((item, i) => <button key={item} aria-label={toolNames[item]} aria-pressed={tool === item} disabled={editing || (isManagedLayer(active) && !['select', 'inspect', 'measure'].includes(item)) || (item === 'hole' && (!selectedFeature || !isArea(selectedFeature.geometry) || !!selectedFeature.circle))} onClick={() => { setTool(item); setError(''); }}><span aria-hidden="true">{item === 'select' ? <CursorIcon /> : ['', '●', '╱', '⬡', '◌', '◯', '↔', '⌖'][i]}</span>{toolNames[item]}</button>)}
          <div className="history-buttons"><button aria-label="Zpět" disabled={!history.past.length || editing} onClick={() => undo()}>↶</button><button aria-label="Znovu" disabled={!history.future.length || editing} onClick={() => undo(true)}>↷</button></div>
        </div>
        <div className="map-stage">
          <MapCanvas ref={map} poi={{ preview: parkImportPreview, records: mapPois, visibility: poiConfiguration.visibility, selected: poiSelected, moving: poiMoving && tool === 'select', onSelect: id => { const poi = pois.find(p => p.id === id); if (poi) selectPoi(poi); }, onReference: point => updatePoi({ point }) }} pid={{ stops: pidStops, routes: pidRoutes, selected: pidPreviewStop, platforms: pidPlatforms, showPlatforms: pidShowPlatforms, zone: pidZone, coverage: coverage?.geometry ?? null, coverageReview: !!coverage?.reviewStops, moveReference: pidMoving, highlightedRoute: pidFilters.selectedRoute, onSelect: id => { const stop = pid.view?.stops.find(value => value.id === id); if (stop) selectPid(stop); }, onReference: setPidPreview, onBounds: setPidBounds }} testPoint={testPoint} onTestPoint={setTestPoint} world={world} selected={selected} tool={tool} apiKey={apiKey} onSelect={selection => { setPoiSelected(null); setPoiMoving(false); setPidSelected(null); setSelected(selection); setActiveId(selection.layerId); }} onCreate={geometry => attempt(() => addGeometry(geometry))} onCircle={center => attempt(() => addGeometry(makeMetricCircle(center, Number(radius)), { center, radiusMeters: Number(radius) }))} onEdit={geometry => attempt(() => { updateFeature({ geometry }); setTool('select'); })} onMeasure={setMeasurement} onError={setError} onTileStatus={setTileStatus} />
          {(membershipPending || membershipFailure) && <div className="pid-map-status" role="status" data-testid="pid-filter-map-status">{membershipFailure || 'Ověřuji polohu PID v herní oblasti… Poslední zobrazení může čekat na přepočet.'}{membershipFailure && <button onClick={() => setPidFilters(filters => ({ ...filters, territoryOnly: false }))}>Vypnout prostorový filtr</button>}</div>}
          {tileStatus !== 'ready' && <div className={`map-notice ${tileStatus === 'error' ? 'warning' : ''}`} role="status"><strong>{tileStatus === 'missing' ? 'Chybí API klíč Mapy.com' : tileStatus === 'error' ? 'Mapový podklad se nepodařilo načíst' : 'Načítám mapový podklad…'}</strong><span>{tileStatus === 'missing' ? 'Přidejte klientský klíč v Nastavení mapy nebo do .env.local. Geometrie lze editovat i bez podkladu.' : tileStatus === 'error' ? 'Ověřte klíč, povolený HTTP referer, službu maptiles, limit a síťové připojení. Vaše geometrie zůstávají zachované.' : 'Mapy.com REST API'}</span></div>}
          <button className="prague-button" onClick={() => map.current?.prague()}>⌖ Zpět na Prahu</button>
          <div className="map-help" aria-live="polite"><strong>{toolNames[tool]}</strong><span>{tool === 'select' ? 'Kliknutím vyberte objekt. Pro kreslení zvolte nástroj.' : tool === 'inspect' ? 'Klikněte na mapu nebo přetáhněte testovací špendlík. Výsledky jsou vpravo.' : tool === 'library' ? 'Klikněte na skutečnou polohu knihovny. Bod potom vyžaduje ověření a schválení.' : tool === 'cinema' ? 'Klikněte do mapy pro vložení kina. Potom doplňte název, adresu a kino schvalte.' : tool === 'hospital' ? 'Klikněte do mapy pro vložení nemocnice. Potom doplňte název a bod schvalte.' : tool === 'zoo' ? 'Klikněte do mapy pro vložení zoo. Potom doplňte název, adresu a bod schvalte.' : tool === 'point' ? 'Klikněte na mapu a vložte bod.' : tool === 'circle' ? 'Kliknutím určete střed kruhu.' : tool === 'measure' ? measurement === null ? 'Klikněte na dva body. Měří se vzdálenost po povrchu Země.' : `${measurement.toLocaleString('cs', { maximumFractionDigits: 1 })} m · ${(measurement / 1000).toLocaleString('cs', { maximumFractionDigits: 3 })} km. Další kliknutí začne nové měření.` : tool === 'edit' ? 'Přetáhněte vrcholy. Klik na hranu přidá vrchol, pravé tlačítko vrchol odstraní. Potom změny uložte.' : tool === 'hole' ? 'Nakreslete otvor uvnitř vybraného polygonu. Kliknutím na první vrchol jej uzavřete.' : 'Klikáním přidávejte vrcholy. Polygon dokončíte prvním, linii posledním vrcholem.'}</span>
            {tool === 'circle' && <label>Poloměr (m)<input aria-label="Poloměr nového kruhu (m)" type="number" min="1" max="100000" value={radius} onChange={e => setRadius(e.target.value)} /></label>}
            {tool !== 'select' && <button onClick={() => { setTool('select'); if (editing) setHistory(h => ({ ...h, present: structuredClone(h.present) })); }}>Zrušit nástroj</button>}
          </div>
          <div className="map-legend"><span className="legend-line" />Herní hranice <span className="legend-shape" />Vlastní geometrie</div>
        </div>
        <div className="map-footer">{pidShowZone && pidStop && <span role="status">{!pidArea ? 'Pro průnik úkrytové zóny nejprve definujte herní oblast.' : !pidPreviewStop?.point ? 'Referenční bod nelze určit.' : pidZoneStatus === 'loading' ? 'Počítám průnik zóny s herní oblastí…' : pidZoneStatus === 'empty' ? 'Kruh nemá společnou plochu s herní oblastí.' : pidZoneStatus === 'ready' ? 'Úkrytová geometrie zobrazena' : 'Zónu nelze zobrazit.'}</span>}<span>WGS84 · [délka, šířka] · metry</span><span className={areaReady ? '' : 'unconfigured'}>{areaReady ? '● Herní oblast definována' : '○ Herní oblast zatím není definována'}</span></div>
      </main>
      <aside className="right-panel panel">
        <div className="panel-heading"><div><span className="eyebrow">VYBRANÝ OBJEKT</span><h2>Vlastnosti</h2></div><span className="draft-chip">draft</span></div>
        {tool !== 'inspect' && selectedLibraryCandidate ? <UnlocatedLibraryProperties key={selectedLibraryCandidate.id + ':' + world.updatedAt} row={selectedLibraryCandidate} onDecision={change => attempt(() => commit({ ...latestWorld.current, poi: decideUnlocatedLibrary(withBundledPois(latestWorld.current.poi), selectedLibraryCandidate, change) }))} onPlace={placeLibrary} onLocate={(point, value) => attempt(() => locateLibrary(point, value))}/> : tool !== 'inspect' && selectedPoi?.category === 'library' ? <LibraryProperties key={selectedPoi.id + ':' + world.updatedAt} poi={selectedPoi} moving={poiMoving} onMove={() => { setPoiMoving(value => !value); setTool('select'); }} onDecision={updateLibrary} onDelete={poiConfiguration.manual.some(poi => poi.id === selectedPoi.id && !poi.library?.selectionKey) ? () => attempt(() => { if (!confirm('Odstranit vlastní knihovnu? Změnu lze vrátit tlačítkem Zpět.')) return; commit({ ...world, poi: removeManualLibrary(poiConfiguration, selectedPoi.id) }); setPoiSelected(null); setPoiMoving(false); }) : undefined}/> : tool !== 'inspect' && selectedPoi ? <PoiProperties key={selectedPoi.id + ':' + world.updatedAt} poi={selectedPoi} dataset={poiConfiguration.sources.find(source => source.source.id === selectedPoi.source.id)} moving={poiMoving} onDelete={poiConfiguration.manual.some(poi => poi.id === selectedPoi.id && ['zoo', 'hospital', 'cinema'].includes(poi.category)) ? () => attempt(() => { if (!confirm(selectedPoi.category === 'cinema' ? 'Odstranit ručně vytvořené kino? Změnu lze vrátit tlačítkem Zpět.' : `Odstranit ručně vytvořenou ${selectedPoi.category === 'hospital' ? 'nemocnici' : 'zoo'}? Změnu lze vrátit tlačítkem Zpět.`)) return; commit({ ...world, poi: selectedPoi.category === 'cinema' ? removeManualCinema(poiConfiguration, selectedPoi.id) : selectedPoi.category === 'hospital' ? removeManualHospital(poiConfiguration, selectedPoi.id) : removeManualZoo(poiConfiguration, selectedPoi.id) }); setPoiSelected(null); setPoiMoving(false); }) : undefined} onMove={() => { setPoiMoving(value => !value); setTool('select'); }} onDecision={updatePoi} /> : tool !== 'inspect' && pidStop ? <PidStopProperties key={pidStop.id + ':' + (pidConfiguration.overrides.find(value => value.stopId === pidStop.id)?.approvedAt ?? '')} stop={pidStop} configuration={pidConfiguration} allStops={pid.view?.stops ?? []} platforms={pidPlatforms} point={pidPreview} moving={pidMoving} showPlatforms={pidShowPlatforms} showZone={pidShowZone} disabled={editing} onPoint={setPidPreview} onMove={value => { setPidMoving(value); setTool('select'); }} onPlatforms={setPidShowPlatforms} onZone={setPidShowZone} onConfiguration={value => attempt(() => commit({ ...world, gameStops: value }))} /> : tool === 'inspect' ? <><PositionInspector point={testPoint} world={world} stop={pidPreviewStop} radius={pidConfiguration.radiusMeters} />{pidStop && <button className="wide" aria-pressed={pidShowZone} onClick={() => setPidShowZone(value => !value)}>{pidShowZone ? "Skrýt úkrytovou zónu" : "Zobrazit úkrytovou zónu"}</button>}</> : selectedFeature && selectedLayer?.dataset ? <div className="managed-properties"><h3>{selectedFeature.name}</h3><p>Oficiální kód: <code>{String(selectedFeature.attributes.code)}</code><br />{selectedFeature.geometry.type}</p><SourceMetadata layer={selectedLayer} /><details><summary>Zdrojové atributy</summary><pre>{JSON.stringify(selectedFeature.attributes, null, 2)}</pre></details><p>Oficiální geometrii lze nahradit ověřenou aktualizací zdroje.</p><button onClick={() => setSourcesOpen(true)}>Porovnat / aktualizovat zdroj</button></div> : selectedFeature ? <FeatureProperties key={`${selectedLayer!.id}/${selectedFeature.id}/${world.updatedAt}`} feature={selectedFeature} editing={editing} onChange={change => attempt(() => updateFeature(change))} onEdit={() => { if (!selectedLayer?.visible) { setError('Vybraná vrstva je skrytá. Před úpravou vrcholů ji zobrazte.'); return; } setTool('edit'); }} onSaveEdit={() => map.current?.saveEdit()} onDelete={() => { attempt(() => updateLayer(selectedLayer!.id, { features: selectedLayer!.features.filter(f => f.id !== selectedFeature.id) })); setSelected(null); setTool('select'); }} /> : <div className="selection-empty"><div aria-hidden="true"><CursorIcon /></div><h3>Prostor pro vaše data</h3><p>Vyberte objekt v mapě nebo v seznamu. Zde uvidíte jeho geometrii, původ a vlastnosti.</p><hr /><span className="eyebrow">JAK ZAČÍT</span><ol><li>Vyberte vrstvu Herní oblast.</li><li>Praha je přednastavená; hranici můžete upravit nebo obnovit.</li><li>Do vlastní vrstvy přidejte další objekty.</li><li>Exportujte zálohu svého světa.</li></ol></div>}
        <div className="export-section"><h3>Přenosná data</h3><p>JSON obsahuje celý draft. GeoJSON navíc otevřete v běžných GIS nástrojích; metadata editoru jsou v rozšířených polích.</p><button disabled={editing} onClick={() => attempt(() => download(exportWorld(world, 'geojson'), 'jetlag-praha-draft.geojson'))}>Exportovat GeoJSON</button></div>
      </aside>
    </div>
    {publicationOpen && <PublicationDialog world={world} pidKey={pid.view?.summary.checksum ?? ''} onClose={() => setPublicationOpen(false)} onBackup={() => download(exportWorld(world), 'jetlag-praha-draft.json')} onRules={gameStops => commit({ ...world, gameStops })} onBuild={async () => {
      const layers = [...world.layers];
      for (const layer of bundled) if (!layers.some(existing => existing.id === layer.id)) layers.push(layer);
      return pid.request({ action: 'game-release', world: { ...world, layers, poi: poiConfiguration }, airports: publishedAirports });
    }} />}
    {libraryDialog && <NewLibraryDialog onClose={() => setLibraryDialog(false)} onPlace={placeLibrary}/>}
    {parkImporting && <ParkImportDialog configuration={poiConfiguration} onClose={() => { setParkImporting(false); setParkImportPreview(null); }} onPreview={geometry => { setParkImportPreview(geometry); if (geometry) map.current?.fitArea(geometry); }} onApply={dataset => { commit({ ...world, poi: applyParkUpdate(poiConfiguration, dataset) }); setParkImporting(false); setParkImportPreview(null); }} />}
    {pidSources && <PidSourceDialog view={pid.view} busy={pid.busy} loadError={pid.loadError} updateError={pid.updateError} warning={pid.warning} configuration={pidConfiguration} onClose={() => setPidSources(false)} onRefresh={pid.refresh} onPublished={pid.comparePublished} onCompare={pid.compare} onApply={pid.apply} onExport={exportPid} onReview={stop => { selectPid(stop, true); setPidSources(false); }} />}
    {sourcesOpen && <AdministrativeDialog world={world} bundled={bundled} loadError={sourceError} onClose={() => setSourcesOpen(false)} onApply={layer => { commit(applyAdministrativeUpdate(world, layer)); setSelected(null); setTool('select'); }} />}
    {importing && <ImportDialog onClose={() => setImporting(false)} onImport={async (contents, mode, title, source) => {
      if (mode === 'world') {
        const imported = importWorld(contents);
        await verifyAdministrativeSources(imported);
        await verifyPoiSources(imported.poi);
        if (!confirm('Nahradit současný draft importovaným světem? Změnu lze vrátit tlačítkem Zpět.')) return;
        commit(imported); setActiveId(imported.layers[0].id); setStorageBlocked(false); setDefaultLoadFailed(false);
      } else {
        const layer = importGeoJson(contents, { title, source, kind: mode === 'game_area' ? 'game_area' : 'custom' });
        if (mode === 'game_area' && areaReady && !confirm('Nahradit současnou herní hranici importovanou geometrií?')) return;
        commit({ ...world, layers: mode === 'game_area' ? world.layers.map(l => l.kind === 'game_area' ? layer : l) : [...world.layers, layer] });
        if (mode === 'game_area' && defaultLoadFailed) { setStorageBlocked(false); setDefaultLoadFailed(false); }
        setActiveId(layer.id);
      }
      setSelected(null); setPoiSelected(null); setPoiMoving(false); setTool('select'); setImporting(false);
    }} />}
  </div>;
}

function FeatureProperties({ feature: f, editing, onChange, onEdit, onSaveEdit, onDelete }: { feature: GeoFeature; editing: boolean; onChange(change: Partial<GeoFeature>): void; onEdit(): void; onSaveEdit(): void; onDelete(): void }) {
  const [geometryError, setGeometryError] = useState('');
  return <div className="feature-properties">
    <dl className="feature-facts"><dt>ID</dt><dd className="mono">{f.id}</dd><dt>Geometrie</dt><dd>{f.circle ? 'Polygon · metrický kruh' : f.geometry.type}</dd><dt>Datum importu / vytvoření</dt><dd>{new Date(f.importedAt).toLocaleString('cs', { timeZone: 'Europe/Prague' })}</dd></dl>
    <form onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); onChange({ name: String(data.get('name')), note: String(data.get('note')), source: String(data.get('source')) }); }}><fieldset disabled={editing}>
      <label>Jméno<input name="name" defaultValue={f.name} required maxLength={10000} /></label><label>Poznámka<textarea name="note" defaultValue={f.note} rows={3} maxLength={10000} /></label><label>Zdroj objektu<input name="source" defaultValue={f.source} maxLength={10000} /></label><button className="wide">Uložit vlastnosti</button>
    </fieldset></form>
    {editing ? <button className="primary wide" onClick={onSaveEdit}>Uložit geometrii</button> : !f.circle && <button className="wide" onClick={onEdit}>Upravit vrcholy v mapě</button>}
    {f.circle && <form className="circle-form" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); const center = [Number(data.get('lon')), Number(data.get('lat'))]; const radiusMeters = Number(data.get('radius')); try { onChange({ circle: { center, radiusMeters }, geometry: makeMetricCircle(center, radiusMeters) }); setGeometryError(''); } catch (error) { setGeometryError(errorText(error)); } }}><fieldset disabled={editing}><h3>Metrický kruh</h3><label>Zeměpisná délka<input name="lon" type="number" step="any" min="-180" max="180" required defaultValue={f.circle.center[0]} /></label><label>Zeměpisná šířka<input name="lat" type="number" step="any" min="-90" max="90" required defaultValue={f.circle.center[1]} /></label><label>Poloměr (m)<input name="radius" type="number" step="any" min="0.01" max="100000" required defaultValue={f.circle.radiusMeters} /></label><button>Přepočítat kruh</button><p>128 geodeticky vypočtených úseků. Střed a poloměr se zachovávají i v exportu.</p></fieldset></form>}
    {geometryError && <p className="inline-error" role="alert">{geometryError}</p>}
    <details className="raw-geometry"><summary>Souřadnice GeoJSON</summary><form onSubmit={e => { e.preventDefault(); try { const geometry = validateGeometry(JSON.parse(String(new FormData(e.currentTarget).get('geometry')))); onChange({ geometry }); setGeometryError(''); } catch (error) { setGeometryError(errorText(error)); } }}><textarea aria-label="Geometrie GeoJSON" name="geometry" rows={9} defaultValue={JSON.stringify(f.geometry, null, 2)} readOnly={!!f.circle || editing} />{!f.circle && <button disabled={editing}>Použít geometrii</button>}</form></details>
    <details><summary>Zdrojové atributy ({Object.keys(f.attributes).length})</summary><pre>{JSON.stringify(f.attributes, null, 2)}</pre></details>
    <button className="danger wide" disabled={editing} onClick={() => { if (confirm(`Smazat objekt „${f.name}“?`)) onDelete(); }}>Smazat objekt</button>
  </div>;
}

function ImportDialog({ onClose, onImport }: { onClose(): void; onImport(contents: string, mode: string, title: string, source: string): void | Promise<void> }) {
  const [mode, setMode] = useState('layer');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const data = new FormData(e.currentTarget); const file = data.get('file') as File;
    if (!file?.size) { setError('Vyberte neprázdný soubor.'); return; }
    if (file.size > (mode === 'world' ? 100 : 10) * 1024 * 1024) { setError(`Limit importu je ${mode === 'world' ? 100 : 10} MB. Pro větší soubory nejprve data rozdělte.`); return; }
    setBusy(true); setError('');
    try { await onImport(await file.text(), mode, String(data.get('title') ?? file.name), String(data.get('source') ?? '')); }
    catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  return <div className="modal-backdrop"><section className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title"><span className="eyebrow">VLASTNÍ A OTEVŘENÁ DATA</span><h2 id="import-title">Import dat</h2><p>Geometrie se validují před uložením. Import chybných dat nezmění rozpracovaný svět.</p><form onSubmit={submit}><label>Co importovat<select value={mode} onChange={e => setMode(e.target.value)}><option value="layer">GeoJSON → nová vrstva</option><option value="game_area">GeoJSON → herní oblast</option><option value="world">Kompletní svět JSON / GeoJSON</option></select></label>
    {mode !== 'world' && <><label>Název importované vrstvy<input name="title" required maxLength={200} defaultValue="Importovaná vrstva" /></label><label>Popis zdroje / licence<input name="source" required maxLength={10000} placeholder="Vlastní data nebo název a licence otevřeného zdroje" /></label></>}
    <label>Soubor<input name="file" type="file" accept=".json,.geojson,application/json,application/geo+json" required /></label><p>WGS84 · [longitude, latitude] · Point, LineString, Polygon, MultiPolygon. Nejvýše 10 MB pro vlastní GeoJSON, 100 MB pro celý svět; 10 000 objektů na vrstvu.</p>{error && <div className="inline-error" role="alert">{error}</div>}<div className="dialog-actions"><button type="button" disabled={busy} onClick={onClose}>Zrušit</button><button className="primary" disabled={busy}>{busy ? 'Validuji…' : 'Importovat'}</button></div></form></section></div>;
}
