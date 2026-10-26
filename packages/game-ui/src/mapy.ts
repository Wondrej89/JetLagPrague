/** Mapy.com Map Tiles API: basic raster tiles have native zooms 0–20.
 * Official documentation checked 2026-10-26:
 * https://github.com/mapycom/developer/blob/c322fefbab6f18073f3bb80b2b965b632a1d2c03/docs/rest-api/map-tiles.md
 * @2x is the same geographic tile/zoom at higher pixel density; it must NOT
 * increment the tile zoom or enable overzoom above 20. */
export const MAPY_NATIVE_MIN_ZOOM=0;
export const MAPY_NATIVE_MAX_ZOOM=20;
export const MAPY_ATTRIBUTION='<a href="https://api.mapy.com/copyright" target="_blank" rel="noopener noreferrer">© Seznam.cz a.s. a další</a>';
export function mapyTileUrl(apiKey:string,retina=false){return `https://api.mapy.com/v1/maptiles/basic/${retina?'256@2x':'256'}/{z}/{x}/{y}?apikey=${encodeURIComponent(apiKey.trim())}`;}
