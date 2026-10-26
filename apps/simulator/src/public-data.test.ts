import {describe,it,expect,vi} from 'vitest';
import {publicReleaseFetch,releaseBase} from './public-data';

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
});
