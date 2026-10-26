import {expect,it} from 'vitest';
import {mapyTileUrl,MAPY_NATIVE_MAX_ZOOM,MAPY_NATIVE_MIN_ZOOM} from './mapy';
it('uses the documented basic native zoom range, with no atlas overzoom',()=>{expect([MAPY_NATIVE_MIN_ZOOM,MAPY_NATIVE_MAX_ZOOM]).toEqual([0,20]);const url=new URL(mapyTileUrl(' public key&value '));expect(url.origin).toBe('https://api.mapy.com');expect(url.pathname).toBe('/v1/maptiles/basic/256/%7Bz%7D/%7Bx%7D/%7By%7D');expect(url.searchParams.get('apikey')).toBe('public key&value');});
it('uses retina pixels at the same XYZ zoom rather than fetching an artificial higher zoom',()=>{const url=mapyTileUrl('client-key',true);expect(url).toContain('/basic/256@2x/{z}/{x}/{y}');expect(url).not.toContain('21/');});
