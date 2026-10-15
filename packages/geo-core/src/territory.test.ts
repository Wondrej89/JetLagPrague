import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { area, booleanPointInPolygon, destination, difference, feature, featureCollection } from '@turf/turf';
import { describe, expect, it } from 'vitest';
import type { LineString, MultiLineString } from 'geojson';
import { applyAdministrativeUpdate, buildGameStops, exportWorld, hidingCoverage, importWorld, municipalGameArea, newFeature, newWorld, pointInArea, prepareTerritory, readAdministrativeSnapshot, setGameArea, territoryMembership, unionAreas, type AreaGeometry, type GameStop, type PidSnapshot } from './index';
import { testPlatform, testSnapshot } from './pid-test-fixtures';

const box = (x: number, y: number, span = 1): AreaGeometry => ({ type: 'Polygon', coordinates: [[[x, y], [x + span, y], [x + span, y + span], [x, y + span], [x, y]]] });
const line = (coordinates: number[][]): LineString => ({ type: 'LineString', coordinates });

describe('sjednocení herního území a prostorový výběr PID', () => {
  it('odstraní vnitřní hranici sousedních ploch, zachová konkávní okraj a nevytvoří obdélník', () => {
    const result = unionAreas([box(0, 0), box(1, 0), box(0, 1)]);
    expect(result.type).toBe('Polygon');
    expect(pointInArea([1, 0.5], result)).toBe(true);
    expect(pointInArea([1.5, 1.5], result)).toBe(false);
    expect(area(result)).toBeCloseTo(area(box(0, 0)) + area(box(1, 0)) + area(box(0, 1)), 0);
  });
  it('zachová otvory i nesouvislé části; zahrne vnější hranici i hranici otvoru', () => {
    const first = box(0, 0, 4); if (first.type !== 'Polygon') throw new Error();
    first.coordinates.push([[1, 1], [1, 3], [3, 3], [3, 1], [1, 1]]);
    const territory = prepareTerritory(unionAreas([first, box(10, 10)]));
    expect(territory.geometry.type).toBe('MultiPolygon');
    expect(territory.contains([0.5, 0.5])).toBe(true);
    expect(territory.contains([2, 2])).toBe(false);
    expect(territory.contains([1, 2])).toBe(true);
    expect(territory.contains([0, 2])).toBe(true);
    expect(territory.contains([10.5, 10.5])).toBe(true);
    expect(territory.contains([5, 5])).toBe(false);
    expect(territory.intersectsLine(line([[1.5, 2], [2.5, 2]]))).toBe(false);
    expect(territory.intersectsLine(line([[1, 1.5], [1, 2.5]]))).toBe(true);
    expect(territory.intersectsLine(line([[-1, 0], [5, 0]]))).toBe(true);
    expect(territory.intersectsLine(line([[-1, 1], [1, -1]]))).toBe(true);
    expect(territory.intersectsLine(line([[-1, 1], [-0.1, -1]]))).toBe(false);
    const multi: MultiLineString = { type: 'MultiLineString', coordinates: [[[20, 20], [21, 21]], [[10.2, 10.2], [10.8, 10.8]]] };
    expect(territory.intersectsLine(multi)).toBe(true);
  });
  it('ponechá průjezdnou linku i bez vrcholů uvnitř a odmítne pouhý překryv bounding boxů', () => {
    const territory = prepareTerritory(unionAreas([box(0, 0), box(1, 0), box(0, 1)]));
    expect(territory.intersectsLine(line([[-1, 0.5], [3, 0.5]]))).toBe(true);
    expect(territory.intersectsLine(line([[1.2, 1.2], [1.8, 1.8]]))).toBe(false);
    expect(territory.intersectsLine(line([[0.2, 0.2], [0.8, 0.8]]))).toBe(true);
  });
  it('chybějící referenční bod neodhaduje a zachová úplnou geometrii protínající linky', async () => {
    const stops = buildGameStops(await testSnapshot([testPlatform('a', 'a', 'bus', [0.5, 0.5]), testPlatform('b', 'b', 'bus', [2, 2])]));
    stops.push({ ...stops[0], id: 'unknown', point: null });
    const routes = [{ id: 'crossing', geometry: line([[-1, 0.5], [2, 0.5]]) }, { id: 'outside', geometry: line([[2, 2], [3, 3]]) }];
    const original = JSON.stringify(routes);
    const membership = territoryMembership(stops, routes, box(0, 0));
    expect(membership.stopIds).toEqual([stops[0].id]); expect(membership.routeIds).toEqual(['crossing']); expect(membership.unknownStops).toBe(1);
    expect(JSON.stringify(routes)).toBe(original);
  });
});

describe('souhrnná úkrytová plocha', () => {
  const center: [number, number] = [14.4, 50.07];
  async function stops(): Promise<GameStop[]> { return buildGameStops(await testSnapshot([testPlatform('a', 'a', 'bus', center), testPlatform('b', 'b', 'bus', [14.401, 50.07]), testPlatform('outside', 'outside', 'bus', [15, 51])])); }
  it('sjednotí překrývající se 400m kruhy, počítá všechny zastávky a nezahrne 401m bod', async () => {
    const input = await stops(), boundary = box(14.3, 50, 0.2);
    const result = hidingCoverage(input, boundary, 400);
    expect(result.usedStops).toBe(2); expect(result.outsideStops).toBe(1); expect(result.geometry?.type).toBe('Polygon');
    expect(result.areaSquareMeters).toBeLessThan(2 * Math.PI * 400 ** 2);
    expect(pointInArea(destination(center, 399, -90, { units: 'meters' }).geometry.coordinates, result.geometry!)).toBe(true);
    expect(pointInArea(destination(center, 401, -90, { units: 'meters' }).geometry.coordinates, result.geometry!)).toBe(false);
  });
  it('ořízne kruhy i u hranice a otvoru, nespojuje oddělené plochy obálkou', async () => {
    const input = await stops(); input[1].point = [14.43, 50.07];
    const boundary = box(14.4, 50.06, 0.04); if (boundary.type !== 'Polygon') throw new Error();
    boundary.coordinates.push([[14.4001, 50.0699], [14.4001, 50.0701], [14.4003, 50.0701], [14.4003, 50.0699], [14.4001, 50.0699]]);
    const result = hidingCoverage(input, boundary, 400);
    expect(result.geometry?.type).toBe('MultiPolygon');
    expect(pointInArea([14.3999, 50.07], result.geometry!)).toBe(false);
    expect(pointInArea([14.4002, 50.07], result.geometry!)).toBe(false);
    expect(pointInArea([14.415, 50.07], result.geometry!)).toBe(false);
  });
  it('vynechá vyloučené a neznámé body, revizi přizná a změnou poloměru přepočítá skutečnou plochu', async () => {
    const input = await stops(); input[0].eligibility = 'excluded'; input[1].eligibility = 'review';
    input.push({ ...input[1], id: 'unknown', point: null });
    const result = hidingCoverage(input, box(14.3, 50, 0.2), 400);
    expect(result.usedStops).toBe(1); expect(result.reviewStops).toBe(1); expect(result.excludedStops).toBe(1); expect(result.unknownStops).toBe(1);
    const smaller = hidingCoverage(input, box(14.3, 50, 0.2), 200);
    expect(smaller.areaSquareMeters / result.areaSquareMeters).toBeCloseTo(0.25, 5);
    expect(hidingCoverage([], box(14.3, 50), 400).geometry).toBeNull();
    expect(() => hidingCoverage([], box(14.3, 50), 0)).toThrow();
  });
});

it('skutečná Praha: všech 57 částí, přesné sjednocení, reálná PID data a zachování draftu', async () => {
  const municipal = await readAdministrativeSnapshot(await readFile('apps/editor/public/administrative/municipal.json', 'utf8'));
  const boundary = municipalGameArea(municipal);
  const geometry = boundary.geometry as AreaGeometry;
  for (const point of [[14.403878, 50.071970], [14.4473, 50.0921], [14.4243, 50.1], [14.4378, 50.0752]]) expect(pointInArea(point, geometry)).toBe(true);
  expect(pointInArea([14.1, 50], geometry)).toBe(false);
  // No district lost, no hull outside the input polygons. Planar clipping retains
  // exact source edges; small spherical area differences from shared vertices cancel.
  const parts = municipal.features.map(f => f.geometry as AreaGeometry);
  expect(area(geometry)).toBeCloseTo(parts.reduce((sum, part) => sum + area(part), 0), 0);
  for (const part of parts) expect(difference(featureCollection([feature(part), feature(geometry)]))).toBeNull();
  expect(boundary.attributes.datasetChecksum).toBe(municipal.dataset!.checksum);
  expect(boundary.attributes.codes).toHaveLength(57);
  const world = newWorld(); world.layers[0].features = [newFeature(box(14.4, 50), 'Původní hranice')];
  world.layers[1].features = [newFeature({ type: 'Point', coordinates: [14.4, 50.07] }, 'Vlastní objekt')]; world.layers.push(municipal);
  const before = JSON.stringify(world), changed = setGameArea(world, boundary);
  expect(changed.layers.slice(1)).toEqual(world.layers.slice(1)); expect(JSON.stringify(world)).toBe(before);
  expect(importWorld(exportWorld(changed)).layers[0].features[0]).toEqual(boundary);
  const updated = applyAdministrativeUpdate(changed, { ...municipal, dataset: { ...municipal.dataset!, version: 'test-update' } });
  expect(updated.layers[0]).toEqual(changed.layers[0]); expect(updated.layers[1]).toEqual(changed.layers[1]);
  const catalog = JSON.parse(await readFile('apps/editor/public/pid/index.json', 'utf8'));
  const snapshot = JSON.parse(gunzipSync(await readFile(`apps/editor/public/pid/${catalog.file}`)).toString()) as PidSnapshot;
  const stops = buildGameStops(snapshot), membership = territoryMembership(stops, snapshot.routes, geometry);
  expect(membership.stopIds.length).toBeGreaterThan(1000); expect(membership.stopIds.length).toBeLessThan(2000);
  expect(membership.routeIds).toContain('L992'); expect(membership.routeIds.length).toBeLessThan(snapshot.routes.length);
  const andel = stops.find(s => s.name === 'Anděl' && s.modes.includes('metro'))!; expect(membership.stopIds).toContain(andel.id);
  const coverage = hidingCoverage(stops, geometry, 400);
  expect(coverage.usedStops).toBe(membership.stopIds.length); expect(coverage.reviewStops).toBe(coverage.usedStops);
  expect(coverage.areaSquareMeters / 1e6).toBeGreaterThan(300); expect(coverage.areaSquareMeters / 1e6).toBeLessThan(330);
  expect(booleanPointInPolygon(andel.point!, coverage.geometry!)).toBe(true);
}, 30000);
