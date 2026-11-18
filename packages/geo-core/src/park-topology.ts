import initGeos from 'geos-wasm';
import type { Geometry } from 'geojson';
import type { AreaGeometry } from './index';

// geos-wasm embeds GEOS 3.13.0 and its WASM in the module: no CDN, network
// dependency or absolute asset path, including on GitHub Pages subpaths.
let engine: ReturnType<typeof initGeos> | undefined;
async function geos() { return engine ??= initGeos(); }
export const PARK_TOPOLOGY_ENGINE = 'GEOS 3.13.0 / geos-wasm 3.1.1';

/** Own all C allocations for a synchronous operation, including failures. */
export async function withGeos<T>(operation: (g: Awaited<ReturnType<typeof initGeos>>, io: {
  read(input: Geometry): number;
  write(geometry: number): Geometry;
  own(geometry: number): number;
  release(geometry: number): void;
  allocate(bytes: number): number;
}) => T): Promise<T> {
  const g = await geos();
  const reader = g.GEOSGeoJSONReader_create(), writer = g.GEOSGeoJSONWriter_create();
  const geometries = new Set<number>(), buffers: number[] = [];
  const own = (geometry: number) => {
    if (!geometry) throw new Error('Operace GEOS selhala.');
    geometries.add(geometry);
    return geometry;
  };
  const release = (geometry: number) => { if (geometries.delete(geometry)) g.GEOSGeom_destroy(geometry); };
  const allocate = (bytes: number) => {
    const buffer = g.Module._malloc(bytes);
    if (!buffer) throw new Error('GEOS nemá dostatek paměti.');
    buffers.push(buffer);
    return buffer;
  };
  const read = (input: Geometry) => {
    const json = JSON.stringify(input);
    const size = new TextEncoder().encode(json).length + 1;
    const text = g.Module._malloc(size);
    if (!text) throw new Error('GEOS nemá dostatek paměti.');
    try {
      g.Module.stringToUTF8(json, text, size);
      return own(g.GEOSGeoJSONReader_readGeometry(reader, text));
    } finally { g.Module._free(text); }
  };
  const write = (geometry: number): Geometry => {
    const output = g.GEOSGeoJSONWriter_writeGeometry(writer, geometry, -1);
    if (!output) throw new Error('GEOS nemůže zapsat výsledek.');
    try { return JSON.parse(g.Module.UTF8ToString(output)); }
    finally { g.GEOSFree(output); }
  };
  try { return operation(g, { read, write, own, release, allocate }); }
  finally {
    for (const geometry of geometries) g.GEOSGeom_destroy(geometry);
    for (const buffer of buffers) g.Module._free(buffer);
    g.GEOSGeoJSONWriter_destroy(writer);
    g.GEOSGeoJSONReader_destroy(reader);
  }
}

export async function parkTopology(input: Geometry, operation: 'make-valid' | 'union' | 'validate'): Promise<Geometry> {
  return withGeos((g,{read,write,own})=>{
    const source=read(input);
    const result=own(operation==='make-valid'?g.GEOSMakeValid(source):operation==='union'?g.GEOSUnaryUnion(source):g.GEOSGeom_clone(source));
    if(g.GEOSisValid(result)!==1)throw new Error('GEOS nevrátil platnou geometrii.');
    if(g.GEOSNormalize(result)!==0)throw new Error('GEOS nemůže normalizovat výsledek.');
    return write(result);
  });
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
