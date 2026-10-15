import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import { distanceMeters, isManagedLayer, validateGeometry, type Geometry, type WorldDraft } from '@jetlag/geo-core';
import type { Position, Feature } from 'geojson';
import type { PidMapState } from './pid-types';
import { modeColors } from './PidPanel';

export type Tool = 'select' | 'point' | 'line' | 'polygon' | 'hole' | 'circle' | 'measure' | 'edit' | 'inspect';
export interface Selection { layerId: string; featureId: string }
export interface MapHandle { prague(): void; fit(): void; saveEdit(): void; focus(point: Position): void }
interface Props {
  world: WorldDraft; selected: Selection | null; tool: Tool; apiKey: string;
  pid?: PidMapState;
  testPoint: Position | null;
  onTestPoint(point: Position): void;
  onSelect(selection: Selection): void;
  onCreate(geometry: Geometry): void;
  onCircle(center: Position): void;
  onEdit(geometry: Geometry): void;
  onMeasure(meters: number | null): void;
  onError(message: string): void;
  onTileStatus(status: 'missing' | 'loading' | 'ready' | 'error'): void;
}

export const MapCanvas = forwardRef<MapHandle, Props>(function MapCanvas(props, ref) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const drawn = useRef<L.FeatureGroup>(L.featureGroup());
  const measurement = useRef<L.FeatureGroup>(L.featureGroup());
  const testMarker = useRef<L.Marker | null>(null);
  const pidStops = useRef<L.LayerGroup>(L.layerGroup());
  const pidRoutes = useRef<L.LayerGroup>(L.layerGroup());
  const pidDetails = useRef<L.LayerGroup>(L.layerGroup());
  const pidMarker = useRef<L.Marker | null>(null);
  const pidRenderer = useRef<L.Canvas | null>(null);
  const pidHit = useRef<(point: L.LatLng) => string | null>(() => null);
  const featureLayers = useRef(new Map<string, L.Marker | L.Polyline | L.Polygon>());
  const current = useRef(props);
  current.current = props;

  useImperativeHandle(ref, () => ({
    prague: () => map.current?.setView([50.0755, 14.4378], 12),
    focus: point => map.current?.setView([point[1], point[0]], Math.max(map.current?.getZoom() ?? 12, 15), { animate: false }),
    fit: () => { const bounds = drawn.current.getBounds(); if (bounds.isValid()) map.current?.fitBounds(bounds.pad(0.12)); },
    saveEdit: () => {
      const selection = current.current.selected;
      const layer = selection && featureLayers.current.get(`${selection.layerId}/${selection.featureId}`);
      if (!layer || !('toGeoJSON' in layer)) return;
      try {
        const geometry = validateGeometry(layer.toGeoJSON(false).geometry);
        current.current.onEdit(geometry);
      } catch (error) { current.current.onError((error as Error).message); }
    },
  }), []);

  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, { preferCanvas: false }).setView([50.0755, 14.4378], 12);
    map.current = instance;
    drawn.current.addTo(instance);
    measurement.current.addTo(instance);
    const pane = instance.createPane('pid-data'); pane.style.zIndex = '450'; pane.style.pointerEvents = 'none';
    pidRenderer.current = L.canvas({ padding: 0.2, pane: 'pid-data' });
    pidRoutes.current.addTo(instance); pidStops.current.addTo(instance); pidDetails.current.addTo(instance);
    const boundsChanged = () => { const bounds = instance.getBounds().pad(0.15); current.current.pid?.onBounds([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]); };
    instance.on('moveend', boundsChanged); const boundsFrame = requestAnimationFrame(boundsChanged);
    instance.pm.setLang('cz');
    instance.pm.setGlobalOptions({ allowSelfIntersection: false, snapDistance: 15 });
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(instance);
    const logo = new L.Control({ position: 'bottomleft' });
    logo.onAdd = () => {
      const element = L.DomUtil.create('div', 'mapy-logo');
      element.innerHTML = '<a href="https://mapy.com/" target="_blank" rel="noopener noreferrer"><img src="https://api.mapy.com/img/api/logo.svg" alt="Mapy.com" width="100" height="32" /></a>';
      L.DomEvent.disableClickPropagation(element);
      return element;
    };
    logo.addTo(instance);
    instance.on('pm:create', event => {
      const layer = event.layer as L.Polygon;
      try {
        const geometry = validateGeometry(layer.toGeoJSON(false).geometry);
        current.current.onCreate(geometry);
      } catch (error) { current.current.onError((error as Error).message); }
      instance.removeLayer(layer);
    });
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(container.current);
    return () => { cancelAnimationFrame(boundsFrame); resize.disconnect(); instance.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    if (!props.apiKey.trim()) { current.current.onTileStatus('missing'); return; }
    current.current.onTileStatus('loading');
    const tiles = L.tileLayer(`https://api.mapy.com/v1/maptiles/basic/256/{z}/{x}/{y}?apikey=${encodeURIComponent(props.apiKey.trim())}`, {
      maxZoom: 20, minZoom: 0, crossOrigin: true,
      attribution: '<a href="https://api.mapy.com/copyright" target="_blank" rel="noopener noreferrer">© Seznam.cz a.s. a další</a>',
    });
    tiles.on('tileerror', () => current.current.onTileStatus('error'));
    tiles.on('tileload', () => current.current.onTileStatus('ready'));
    tiles.addTo(instance);
    return () => { tiles.off(); tiles.remove(); };
  }, [props.apiKey]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    drawn.current.clearLayers();
    featureLayers.current.clear();
    for (const layer of props.world.layers.filter(l => l.visible)) {
      for (const f of layer.features) {
        const selected = props.selected?.layerId === layer.id && props.selected.featureId === f.id;
        const geoFeature: Feature = { type: 'Feature', properties: {}, geometry: f.geometry };
        const geo = L.geoJSON(geoFeature, {
          pmIgnore: isManagedLayer(layer),
          style: { color: layer.color, weight: selected ? 4 : isManagedLayer(layer) ? 1.5 : 2, fillOpacity: selected ? 0.30 : isManagedLayer(layer) ? 0.05 : 0.10, dashArray: layer.kind === 'game_area' ? '8 5' : undefined },
          pointToLayer: (_feature, latlng) => L.marker(latlng, { icon: L.divIcon({ className: '', html: `<span class="map-point${selected ? ' selected' : ''}" style="background:${layer.color}"></span>`, iconSize: [20, 20], iconAnchor: [10, 10] }) }),
        });
        geo.eachLayer(item => {
          featureLayers.current.set(`${layer.id}/${f.id}`, item as L.Marker | L.Polyline | L.Polygon);
          item.on('click', e => {
            if (['select', 'inspect'].includes(current.current.tool)) {
              const stop = pidHit.current((e as L.LeafletMouseEvent).latlng);
              if (stop) { L.DomEvent.stopPropagation(e); current.current.pid?.onSelect(stop); return; }
            }
            if (current.current.tool !== 'select') return;
            L.DomEvent.stopPropagation(e);
            current.current.onSelect({ layerId: layer.id, featureId: f.id });
          });
          // Plain text nodes avoid interpreting imported names as HTML.
          const label = document.createElement('span');
          label.textContent = f.name;
          item.bindTooltip(label);
        });
        geo.addTo(drawn.current);
      }
    }
  }, [props.world, props.selected]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const layers = [...featureLayers.current.values()];
    instance.pm.disableDraw();
    for (const layer of layers) layer.pm?.disable();
    measurement.current.clearLayers();
    let points: Position[] = [];
    const tool = props.tool;
    if (tool === 'point') instance.pm.enableDraw('Marker', { markerStyle: { icon: L.divIcon({ className: 'draw-point', iconSize: [16, 16] }) } });
    if (tool === 'line') instance.pm.enableDraw('Line');
    if (tool === 'polygon' || tool === 'hole') instance.pm.enableDraw('Polygon');
    if (tool === 'edit' && props.selected) featureLayers.current.get(`${props.selected.layerId}/${props.selected.featureId}`)?.pm?.enable({ allowSelfIntersection: false });
    if (tool === 'measure') current.current.onMeasure(null);
    const click = (event: L.LeafletMouseEvent) => {
      if (['select', 'inspect'].includes(tool)) {
        const stop = pidHit.current(event.latlng); if (stop) { current.current.pid?.onSelect(stop); return; }
      }
      if (tool === 'inspect') current.current.onTestPoint([event.latlng.lng, event.latlng.lat]);
      if (tool === 'circle') current.current.onCircle([event.latlng.lng, event.latlng.lat]);
      if (tool !== 'measure') return;
      if (points.length === 2) { points = []; measurement.current.clearLayers(); current.current.onMeasure(null); }
      points.push([event.latlng.lng, event.latlng.lat]);
      L.circleMarker(event.latlng, { radius: 5, color: '#163b32', pmIgnore: true }).addTo(measurement.current);
      if (points.length === 2) {
        L.polyline(points.map(p => [p[1], p[0]]), { color: '#163b32', dashArray: '5 6', pmIgnore: true }).addTo(measurement.current);
        current.current.onMeasure(distanceMeters(points[0], points[1]));
      }
    };
    instance.on('click', click);
    container.current?.classList.toggle('crosshair', ['circle', 'measure', 'inspect'].includes(tool));
    return () => {
      instance.off('click', click);
      instance.pm.disableDraw();
      for (const layer of layers) layer.pm?.disable();
    };
  }, [props.tool, props.selected, props.world]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || props.tool !== 'inspect' || !props.testPoint) {
      testMarker.current?.remove(); testMarker.current = null;
      return;
    }
    const latlng: L.LatLngTuple = [props.testPoint[1], props.testPoint[0]];
    if (!testMarker.current) {
      const marker = L.marker(latlng, { draggable: true, pmIgnore: true, snapIgnore: true, zIndexOffset: 1000, title: 'Testovací poloha · přetáhněte', icon: L.divIcon({ className: 'test-position-pin', html: '<span>⌖</span>', iconSize: [30, 38], iconAnchor: [15, 34] }) });
      marker.on('drag', () => { const p = marker.getLatLng(); current.current.onTestPoint([p.lng, p.lat]); });
      marker.addTo(instance); testMarker.current = marker;
    } else testMarker.current.setLatLng(latlng);
  }, [props.testPoint, props.tool]);

  useEffect(() => {
    const instance = map.current; if (!instance) return;
    const stopGroup = pidStops.current;
    const render = () => {
      stopGroup.clearLayers(); const bounds = instance.getBounds().pad(0.15);
      const cells = new Map<string, { id: string; pixel: L.Point }[]>();
      for (const stop of props.pid?.stops ?? []) {
        if (!stop.point || !bounds.contains([stop.point[1], stop.point[0]])) continue;
        const pixel = instance.latLngToContainerPoint([stop.point[1], stop.point[0]]); const cell = `${Math.floor(pixel.x / 24)},${Math.floor(pixel.y / 24)}`;
        const candidates = cells.get(cell) ?? []; candidates.push({ id: stop.id, pixel }); cells.set(cell, candidates);
        const marker = L.circleMarker([stop.point[1], stop.point[0]], { renderer: pidRenderer.current!, interactive: false, pmIgnore: true, radius: stop.id === current.current.pid?.selected?.id ? 8 : 5,
          color: stop.eligibility === 'review' ? '#b67929' : stop.eligibility === 'excluded' ? '#777777' : '#ffffff', weight: 1.5,
          fillColor: stop.dominantMode ? modeColors[stop.dominantMode] : '#8b754b', fillOpacity: 0.95 });
        marker.addTo(pidStops.current);
      }
      // Pixel hit testing is only an input optimization. All game distances and
      // polygon tests stay in geo-core; the canvas cannot intercept own polygons.
      pidHit.current = latlng => {
        const point = instance.latLngToContainerPoint(latlng); const x = Math.floor(point.x / 24), y = Math.floor(point.y / 24);
        let best: { id: string; distance: number } | null = null;
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const candidate of cells.get(`${x + dx},${y + dy}`) ?? []) {
          const distance = point.distanceTo(candidate.pixel); if (distance <= 9 && (!best || distance < best.distance)) best = { id: candidate.id, distance };
        }
        return best?.id ?? null;
      };
    };
    render(); instance.on('moveend', render);
    return () => { instance.off('moveend', render); stopGroup.clearLayers(); pidHit.current = () => null; };
  }, [props.pid?.stops]);

  useEffect(() => {
    const instance = map.current; if (!instance) return;
    const routeGroup = pidRoutes.current;
    routeGroup.clearLayers(); let index = 0; let frame = 0; let cancelled = false;
    const routes = props.pid?.routes ?? [];
    const render = () => {
      const started = performance.now();
      while (!cancelled && index < routes.length && performance.now() - started < 8) {
        const route = routes[index++];
        const highlighted = route.id === props.pid?.highlightedRoute;
        const feature: Feature = { type: 'Feature', properties: {}, geometry: route.geometry };
        L.geoJSON(feature, { pmIgnore: true, interactive: false, style: { renderer: pidRenderer.current!, color: route.color ?? modeColors[route.mode], weight: highlighted ? 5 : 2, opacity: props.pid?.highlightedRoute && !highlighted ? 0.25 : 0.85 } }).addTo(pidRoutes.current);
      }
      if (!cancelled && index < routes.length) frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => { cancelled = true; cancelAnimationFrame(frame); routeGroup.clearLayers(); };
  }, [props.pid?.routes, props.pid?.highlightedRoute]);

  useEffect(() => {
    const instance = map.current; if (!instance) return;
    pidDetails.current.clearLayers();
    if (props.pid?.zone) {
      const zone: Feature = { type: 'Feature', properties: {}, geometry: props.pid.zone };
      L.geoJSON(zone, { pmIgnore: true, interactive: false, style: { renderer: pidRenderer.current!, color: props.pid.selected?.eligibility === 'allowed' ? '#267a52' : '#b67929', weight: 2, dashArray: props.pid.selected?.eligibility === 'allowed' ? undefined : '6 5', fillOpacity: 0.12 } }).addTo(pidDetails.current);
    }
    if (props.pid?.showPlatforms) for (const platform of props.pid.platforms) {
      const marker = L.circleMarker([platform.point[1], platform.point[0]], { radius: 3, renderer: pidRenderer.current!, pmIgnore: true, color: '#535c66', weight: 1, fillColor: platform.services.length ? '#ffffff' : '#8c8c8c', fillOpacity: 1 });
      const label = document.createElement('span'); label.textContent = `${platform.id} · ${platform.services.length ? 'aktivní stanoviště ve snapshotu' : 'bez doložené aktivní obsluhy'}`; marker.bindTooltip(label); marker.addTo(pidDetails.current);
    }
  }, [props.pid?.zone, props.pid?.platforms, props.pid?.showPlatforms, props.pid?.selected?.eligibility]);

  useEffect(() => {
    const instance = map.current; const point = props.pid?.selected?.point;
    if (!instance || !point) { pidMarker.current?.remove(); pidMarker.current = null; return; }
    const latlng: L.LatLngTuple = [point[1], point[0]];
    if (!pidMarker.current) {
      const marker = L.marker(latlng, { pmIgnore: true, snapIgnore: true, zIndexOffset: 500, title: 'Referenční bod zastávky', icon: L.divIcon({ className: 'pid-reference-pin', html: '<span>+</span>', iconSize: [26, 26], iconAnchor: [13, 13] }) });
      marker.on('click', event => L.DomEvent.stopPropagation(event));
      marker.on('drag', () => { const p = marker.getLatLng(); current.current.pid?.onReference([p.lng, p.lat]); });
      marker.addTo(instance); pidMarker.current = marker;
    } else pidMarker.current.setLatLng(latlng);
    if (props.pid?.moveReference) pidMarker.current.dragging?.enable(); else pidMarker.current.dragging?.disable();
  }, [props.pid?.selected?.point, props.pid?.moveReference]);

  return <div ref={container} className="map-canvas" aria-label="Mapa geografického editoru" data-testid="map" data-pid-zone-type={props.pid?.zone?.type ?? 'none'} data-pid-route-count={props.pid?.routes.length ?? 0} data-pid-stop-count={props.pid?.stops.length ?? 0} />;
});
