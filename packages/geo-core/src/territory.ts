import { area, booleanPointInPolygon, feature, featureCollection, intersect, union } from '@turf/turf';
import type { LineString, MultiLineString, Position } from 'geojson';
import { isArea, makeMetricCircle, newFeature, validateGeometry, type AreaGeometry, type GeoFeature, type GeoLayer, type WorldDraft } from './index';
import type { GameStop } from './game-stops';
import { wgs84PointSchema } from './pid-model';
import { pragueDate } from './pid-snapshot';

export function unionAreas(geometries: AreaGeometry[]): AreaGeometry {
  if (!geometries.length) throw new Error('Chybí polygonové podklady pro sjednocení.');
  const result = geometries.length === 1 ? geometries[0] : union(featureCollection(geometries.map(geometry => feature(geometry))))?.geometry;
  if (!result) throw new Error('Sjednocení hranic nevrátilo plochu.');
  const checked = validateGeometry(result);
  if (!isArea(checked)) throw new Error('Sjednocení musí být polygon.');
  return checked;
}

export function municipalGameArea(layer: GeoLayer): GeoFeature {
  if (layer.dataset?.id !== 'praha-municipal' || layer.features.length !== 57 || new Set(layer.features.map(f => f.id)).size !== 57) throw new Error('Předvolba Prahy vyžaduje úplnou oficiální vrstvu 57 městských částí.');
  const geometries = layer.features.map(f => { const geometry = validateGeometry(f.geometry); if (!isArea(geometry)) throw new Error('Městská část nemá polygonovou geometrii.'); return geometry; });
  const dataset = layer.dataset;
  return {
    ...newFeature(unionAreas(geometries), 'Praha · všech 57 městských částí', `${dataset.provider} · ${dataset.sourceUrl}`),
    note: 'Skutečné sjednocení všech městských částí bez zjednodušení hranic. Aktualizace zdroje tuto uloženou herní hranici automaticky nemění; předvolbu lze použít znovu.',
    attributes: { preset: 'praha-municipal-union', datasetId: dataset.id, datasetVersion: dataset.version, datasetChecksum: dataset.checksum, sourceUrl: dataset.sourceUrl, license: { ...dataset.license }, dataDate: dataset.dataDate, codes: layer.features.map(f => String(f.attributes.code)).sort() },
  };
}

export function setGameArea(world: WorldDraft, boundary: GeoFeature): WorldDraft {
  if (!isArea(boundary.geometry)) throw new Error('Herní hranice musí být polygon.');
  return { ...world, layers: world.layers.map(layer => layer.kind === 'game_area' ? { ...layer, visible: true, features: [boundary] } : layer) };
}

type Segment = [Position, Position];
// GeoJSON edges are straight in WGS84 coordinate space. Inclusive segment tests
// handle crossings, tangency and collinear overlap, including hole boundaries.
function segmentsIntersect([a, b]: Segment, [c, d]: Segment): boolean {
  const cross = (p: Position, q: Position, r: Position) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const on = (p: Position, q: Position, r: Position) => r[0] >= Math.min(p[0], q[0]) && r[0] <= Math.max(p[0], q[0]) && r[1] >= Math.min(p[1], q[1]) && r[1] <= Math.max(p[1], q[1]);
  const x = cross(a, b, c), y = cross(a, b, d), z = cross(c, d, a), w = cross(c, d, b);
  return ((x > 0 && y < 0 || x < 0 && y > 0) && (z > 0 && w < 0 || z < 0 && w > 0)) || x === 0 && on(a, b, c) || y === 0 && on(a, b, d) || z === 0 && on(c, d, a) || w === 0 && on(c, d, b);
}

export function prepareTerritory(input: AreaGeometry) {
  const geometry = validateGeometry(input);
  if (!isArea(geometry)) throw new Error('Chybí polygonová herní oblast.');
  const rings = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates).flat();
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const ring of rings) for (const p of ring) { west = Math.min(west, p[0]); south = Math.min(south, p[1]); east = Math.max(east, p[0]); north = Math.max(north, p[1]); }
  const contains = (point: Position) => point[0] >= west && point[0] <= east && point[1] >= south && point[1] <= north && booleanPointInPolygon(point, geometry);
  // The grid only selects candidate edges. Each candidate is tested geometrically;
  // bounding boxes never decide whether a line belongs to the territory.
  const size = 48;
  const cellX = (x: number) => Math.max(0, Math.min(size - 1, Math.floor((x - west) / (east - west) * size)));
  const cellY = (y: number) => Math.max(0, Math.min(size - 1, Math.floor((y - south) / (north - south) * size)));
  const cells = (a: Position, b: Position, visit: (key: number) => void) => {
    for (let x = cellX(Math.min(a[0], b[0])); x <= cellX(Math.max(a[0], b[0])); x++) for (let y = cellY(Math.min(a[1], b[1])); y <= cellY(Math.max(a[1], b[1])); y++) visit(x * size + y);
  };
  let grid: Map<number, Segment[]> | null = null;
  function intersectsLine(line: LineString | MultiLineString): boolean {
    if (!grid) {
      grid = new Map();
      for (const ring of rings) for (let i = 1; i < ring.length; i++) { const edge: Segment = [ring[i - 1], ring[i]]; cells(...edge, key => { const list = grid!.get(key) ?? []; list.push(edge); grid!.set(key, list); }); }
    }
    for (const part of line.type === 'LineString' ? [line.coordinates] : line.coordinates) {
      if (part.length && contains(part[0])) return true;
      for (let i = 1; i < part.length; i++) {
        const a = part[i - 1], b = part[i];
        if (Math.max(a[0], b[0]) < west || Math.min(a[0], b[0]) > east || Math.max(a[1], b[1]) < south || Math.min(a[1], b[1]) > north) continue;
        let hit = false;
        cells(a, b, key => { if (!hit) hit = (grid!.get(key) ?? []).some(edge => segmentsIntersect([a, b], edge)); });
        if (hit) return true;
      }
    }
    return false;
  }
  return { geometry, contains, intersectsLine };
}

export interface TerritoryMembership { stopIds: string[]; routeIds: string[]; unknownStops: number }
export function territoryMembership(stops: GameStop[], routes: { id: string; geometry: LineString | MultiLineString }[], area: AreaGeometry): TerritoryMembership {
  const territory = prepareTerritory(area);
  let unknownStops = 0;
  const stopIds = stops.filter(stop => { if (!stop.platformIds.length) return false; if (!stop.point || !wgs84PointSchema.safeParse(stop.point).success) { unknownStops++; return false; } return territory.contains(stop.point); }).map(stop => stop.id);
  return { stopIds, routeIds: routes.filter(route => territory.intersectsLine(route.geometry)).map(route => route.id), unknownStops };
}

export interface HidingCoverage {
  geometry: AreaGeometry | null; usedStops: number; allowedStops: number; reviewStops: number;
  excludedStops: number; unknownStops: number; outsideStops: number; areaSquareMeters: number;
}
export function hidingCoverage(stops: GameStop[], areaGeometry: AreaGeometry, radiusMeters: number): HidingCoverage {
  const territory = prepareTerritory(areaGeometry);
  const result: HidingCoverage = { geometry: null, usedStops: 0, allowedStops: 0, reviewStops: 0, excludedStops: 0, unknownStops: 0, outsideStops: 0, areaSquareMeters: 0 };
  const points = new Map<string, [number, number]>();
  // Validate the radius even when there are no eligible centers.
  makeMetricCircle([0, 0], radiusMeters);
  for (const stop of stops) {
    if (!stop.platformIds.length) continue;
    if (!stop.point || !wgs84PointSchema.safeParse(stop.point).success) { result.unknownStops++; continue; }
    if (!territory.contains(stop.point)) { result.outsideStops++; continue; }
    if (stop.eligibility === 'excluded') { result.excludedStops++; continue; }
    result.usedStops++;
    if (stop.eligibility === 'allowed' && stop.snapshotDate === pragueDate()) result.allowedStops++; else result.reviewStops++;
    points.set(JSON.stringify(stop.point), stop.point);
  }
  if (points.size) {
    // Union once and clip once: no alpha stacking of overlapping circles and no
    // artificial hull bridging gaps between disconnected hiding areas.
    const circles = [...points.values()].map(point => makeMetricCircle(point, radiusMeters));
    const merged = circles.length === 1 ? circles[0] : union(featureCollection(circles.map(geometry => feature(geometry))))?.geometry;
    if (!merged) throw new Error('Sjednocení úkrytových kruhů selhalo.');
    result.geometry = intersect(featureCollection([feature(merged), feature(territory.geometry)]))?.geometry ?? null;
    if (result.geometry) result.areaSquareMeters = area(result.geometry);
  }
  return result;
}
