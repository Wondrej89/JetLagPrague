/** Only explicit coordinate targets qualify. A viewport or Street View camera
 * is not the branch's reference point. The caller must establish provenance. */
export function explicitLibraryMapPoint(input: string): [number, number] | null {
  try {
    const url = new URL(input);
    if (url.username || url.password || url.port) return null;
    for (const key of ['center', 'marker', 'source', 'id', 'q', 'query']) if (url.searchParams.getAll(key).length > 1) return null;
    let pair: string | null = null, order: 'lat-lon' | 'lon-lat' = 'lat-lon';
    if (url.protocol === 'geo:') pair = url.pathname.split(';')[0];
    else if (!['http:', 'https:'].includes(url.protocol)) return null;
    else if (['mapy.cz', 'www.mapy.cz', 'mapy.com', 'www.mapy.com'].includes(url.hostname)) {
      if (url.searchParams.has('center')) {
        if (url.searchParams.get('marker') !== 'true') return null;
        pair = url.searchParams.get('center'); order = 'lon-lat';
      } else if (url.searchParams.get('source') === 'coor') { pair = url.searchParams.get('id'); order = 'lon-lat'; }
      else pair = url.searchParams.get('q');
    } else if (url.hostname === 'maps.google.com' || (['www.google.com', 'google.com'].includes(url.hostname) && /^\/maps(?:\/|$)/.test(url.pathname))) {
      if (url.searchParams.get('marker') === 'false') return null;
      pair = url.searchParams.get('query') ?? url.searchParams.get('q');
      if (url.searchParams.has('query') && url.searchParams.has('q') && url.searchParams.get('query') !== url.searchParams.get('q')) return null;
    }
    if (!pair || !/^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/.test(pair)) return null;
    const numbers = pair.split(',').map(Number), point: [number, number] = order === 'lon-lat' ? [numbers[0], numbers[1]] : [numbers[1], numbers[0]];
    return Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90 ? point : null;
  } catch { return null; }
}

/** All supplied target links must agree exactly at the precision of the source.
 * No averaging, geocoding or tolerance can silently turn a conflict into approval. */
export function agreedLibraryMapPoint(urls: readonly string[]): [number, number] | null {
  const points = urls.map(explicitLibraryMapPoint), first = points[0];
  return first && points.every(point => point?.[0] === first[0] && point?.[1] === first[1]) ? first : null;
}
