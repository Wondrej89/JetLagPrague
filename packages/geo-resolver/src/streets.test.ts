import {afterEach,expect,it,vi} from 'vitest';
import {createMapyStreetProvider,mapyStreetResult,MAPY_REVERSE_GEOCODING_ENDPOINT} from './streets';
afterEach(()=>vi.useRealTimers());
it('reads only explicitly typed streets from the documented items/parent structure, never an address or a municipality',()=>{
 expect(mapyStreetResult({items:[{type:'regional.street',name:'Seifertova'}]})).toEqual({state:'known',name:'Seifertova'});
 expect(mapyStreetResult({items:[{type:'regional.address',name:'Husitská 123',regionalStructure:[{type:'regional.street',name:'Husitská'},{type:'regional.municipality',name:'Praha'}]}]})).toEqual({state:'known',name:'Husitská'});
 for(const response of [{},{items:[]},{items:[{type:'regional.address',name:'Seifertova 22'}]},{items:[{type:'regional.municipality',name:'Praha'}]},{items:[{type:'regional.street',name:''}]},{items:[{type:'regional.street',name:'Seifertova'},{type:'regional.street',name:'Husitská'}]}])expect(mapyStreetResult(response).state).toBe('unknown');
});
it('uses the exact endpoint, WGS84 lon/lat and Czech names without cookies; does not store the API key in the result',async()=>{
 const fetcher=vi.fn(async()=>Response.json({items:[{type:'regional.street',name:'Seifertova'}]}));const result=await createMapyStreetProvider('public-test-client',fetcher).resolve([14.45,50.08]);
 const [input,options]=fetcher.mock.calls[0] as unknown as [URL,RequestInit];expect(input.origin+input.pathname).toBe(MAPY_REVERSE_GEOCODING_ENDPOINT);expect(Object.fromEntries(input.searchParams)).toEqual({apikey:'public-test-client',lon:'14.45',lat:'50.08',lang:'cs'});expect(options.credentials).toBe('omit');expect(result).toEqual({state:'known',name:'Seifertova'});expect(JSON.stringify(result)).not.toContain('public-test-client');
});
it('handles a missing key, network errors, malformed JSON, HTTP errors, timeouts and rate-limit backoff honestly',async()=>{
 const fetcher=vi.fn(async()=>new Response('{}'));expect((await createMapyStreetProvider(undefined,fetcher).resolve([14,50])).state).toBe('unknown');expect(fetcher).not.toHaveBeenCalled();
 for(const response of [new Response('not json'),new Response('',{status:403}),new Response('',{status:503})])expect((await createMapyStreetProvider('test',vi.fn(async()=>response)).resolve([14,50])).state).toBe('unknown');
 expect((await createMapyStreetProvider('test',vi.fn(async()=>{throw new Error('secret-bearing URL must never be copied');})).resolve([14,50]))).toMatchObject({state:'unknown',reason:expect.not.stringContaining('secret-bearing')});
 vi.useFakeTimers();const slow=createMapyStreetProvider('test',vi.fn(()=>new Promise<Response>(()=>{})),100).resolve([14,50]);await vi.advanceTimersByTimeAsync(101);expect(await slow).toMatchObject({state:'unknown',reason:expect.stringContaining('časový limit')});
 const limited=vi.fn(async()=>new Response('',{status:429,headers:{'Retry-After':'60'}})),provider=createMapyStreetProvider('test',limited);await provider.resolve([14,50]);await provider.resolve([14,50]);expect(limited).toHaveBeenCalledTimes(1);await vi.advanceTimersByTimeAsync(60001);await provider.resolve([14,50]);expect(limited).toHaveBeenCalledTimes(2);
});
