import {describe,it,expect,vi} from 'vitest';
import {publicReleaseFetch,releaseBase} from './public-data';
import {atlasTiles,ATLAS_ZOOM,loadBasemap} from './basemap';

describe('read-only browser sandbox',()=>{
 it('resolves the public catalog on Pages and on the local dev server',()=>{
  expect(releaseBase('https://example.test/JetLagPrague/simulator/',false).href).toBe('https://example.test/JetLagPrague/releases/');
  expect(releaseBase('http://127.0.0.1:4177/',true).href).toBe('http://127.0.0.1:4177/releases/');
  expect(releaseBase('https://example.test/simulator/',false).href).toBe('https://example.test/releases/');
 });
 it('reads only public artifacts, without credentials, request bodies or redirects',async()=>{
  const base=new URL('https://example.test/JetLagPrague/releases/'),fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response('{}')),get=publicReleaseFetch(base,fetcher);
  await get(new URL('current.json',base),{headers:{Authorization:'private'},body:'private',credentials:'include'});
  expect(fetcher).toHaveBeenCalledWith(new URL('current.json',base),expect.objectContaining({method:'GET',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'}));
  expect(fetcher.mock.calls[0][1]).not.toHaveProperty('body');expect(fetcher.mock.calls[0][1]).not.toHaveProperty('headers');
  for(const input of ['https://other.test/current.json',new URL('../editor/',base).href,new URL('current.json?gps=50,14',base).href,new URL('auth/start',base).href])await expect(get(input)).rejects.toThrow('pouze číst');
  await expect(get(new URL('current.json',base),{method:'POST'})).rejects.toThrow('pouze číst');
  await expect(get(new Request(new URL('current.json',base),{method:'POST'}))).rejects.toThrow('pouze číst');
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('loads the same finite Prague atlas once for all maps; no player coordinates enter tile URLs',async()=>{
  const ids=atlasTiles();expect(new Set(ids).size).toBe(ids.length);expect(ids.length).toBeGreaterThan(50);expect(ids.length).toBeLessThan(200);expect(ids.every(id=>id.startsWith(`${ATLAS_ZOOM}/`))).toBe(true);
  const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>new Response(new Blob(['image'],{type:'image/png'})));vi.stubGlobal('fetch',fetcher);
  try{
   const first=await loadBasemap('public-client-key'),second=await loadBasemap('public-client-key');expect(first).toBe(second);expect(first.missing).toBe(0);expect(first.basemap.tiles.size).toBe(ids.length);expect(fetcher).toHaveBeenCalledTimes(ids.length);
   expect(fetcher.mock.calls.map(([url])=>String(url))).toEqual(ids.map(id=>`https://api.mapy.com/v1/maptiles/basic/256/${id}?apikey=public-client-key`));
   expect(fetcher.mock.calls.every(([,options])=>options?.method==='GET'&&options?.credentials==='omit'&&!options?.body)).toBe(true);
   first.basemap.tiles.forEach(url=>URL.revokeObjectURL(url));
  }finally{vi.unstubAllGlobals();}
 });
});
