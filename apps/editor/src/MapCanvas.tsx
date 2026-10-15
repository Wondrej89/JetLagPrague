import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import { distanceMeters, isManagedLayer, validateGeometry, type Geometry, type WorldDraft } from '@jetlag/geo-core';
import type { Position, Feature } from 'geojson';

export type Tool = 'select' | 'point' | 'line' | 'polygon' | 'hole' | 'circle' | 'measure' | 'edit' | 'inspect';
export interface Selection { layerId: string; featureId: string }
export interface MapHandle { prague(): void; fit(): void; saveEdit(): void }
interface Props {
  world: WorldDraft; selected: Selection | null; tool: Tool; apiKey: string;
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
  const featureLayers = useRef(new Map<string, L.Marker | L.Polyline | L.Polygon>());
  const current = useRef(props);
  current.current = props;

  useImperativeHandle(ref, () => ({
    prague: () => map.current?.setView([50.0755, 14.4378], 12),
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
    return () => { resize.disconnect(); instance.remove(); map.current = null; };
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

  return <div ref={container} className="map-canvas" aria-label="Mapa geografického editoru" data-testid="map" />;
});
