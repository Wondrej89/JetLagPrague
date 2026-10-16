import initGeos from 'geos-wasm';
import type { Geometry } from 'geojson';
import type { AreaGeometry } from './index';

// geos-wasm embeds GEOS 3.13.0 and its WASM in the module: no CDN, network
// dependency or absolute asset path, including on GitHub Pages subpaths.
let engine: ReturnType<typeof initGeos> | undefined;
async function geos() { return engine ??= initGeos(); }
export const PARK_TOPOLOGY_ENGINE = 'GEOS 3.13.0 / geos-wasm 3.1.1';

/** All C allocations belong to this invocation, including failed operations. */
export async function parkTopology(input: Geometry, operation: 'make-valid' | 'union' | 'validate'): Promise<Geometry> {
  const g = await geos();
  const reader = g.GEOSGeoJSONReader_create(), writer = g.GEOSGeoJSONWriter_create();
  let text = 0, source = 0, result = 0, output = 0;
  try {
    const json = JSON.stringify(input), size = new TextEncoder().encode(json).length + 1;
    text = g.Module._malloc(size); g.Module.stringToUTF8(json, text, size);
    source = g.GEOSGeoJSONReader_readGeometry(reader, text);
    if (!source) throw new Error('GEOS nemůže načíst geometrii.');
    result = operation === 'make-valid' ? g.GEOSMakeValid(source) : operation === 'union' ? g.GEOSUnaryUnion(source) : g.GEOSGeom_clone(source);
    if (!result || g.GEOSisValid(result) !== 1) throw new Error('GEOS nevrátil platnou geometrii.');
    if (g.GEOSNormalize(result) !== 0) throw new Error('GEOS nemůže normalizovat výsledek.');
    output = g.GEOSGeoJSONWriter_writeGeometry(writer, result, -1);
    if (!output) throw new Error('GEOS nemůže zapsat výsledek.');
    return JSON.parse(g.Module.UTF8ToString(output)) as Geometry;
  } finally {
    if (output) g.GEOSFree(output);
    if (result) g.GEOSGeom_destroy(result);
    if (source) g.GEOSGeom_destroy(source);
    if (text) g.Module._free(text);
    g.GEOSGeoJSONWriter_destroy(writer); g.GEOSGeoJSONReader_destroy(reader);
  }
}
/** Collections of polygons are flattened without discarding any component.
 * A collapsed line/point anywhere makes automatic acceptance unsafe. */
export function polygonalResult(result: Geometry): AreaGeometry | null {
  if (result.type === 'Polygon' || result.type === 'MultiPolygon') return result;
  if (result.type !== 'GeometryCollection' || !result.geometries.length) return null;
  const polygons: number[][][][] = [];
  for (const member of result.geometries) {
    const geometry = polygonalResult(member);
    if (!geometry) return null;
    polygons.push(...(geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates));
  }
  return { type: 'MultiPolygon', coordinates: polygons };
}
