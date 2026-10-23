import {beforeAll,expect,it} from 'vitest';
import {gameFixture} from '../../game-core/src/test-fixtures';
import {publishedGameLayers} from './catalog';
let f:Awaited<ReturnType<typeof gameFixture>>;beforeAll(async()=>{f=await gameFixture();});
it('only displays approved published objects with their exact reference coordinates and geometry',()=>{
 const before=JSON.stringify(f.release),layers=publishedGameLayers(f.release);
 for(const poi of f.release.data.pois){const feature=layers.find(l=>l.id===poi.category)!.features.find(feature=>feature.id===poi.id)!;expect(feature.geometry).toEqual(poi.geometry);expect(feature.properties?.point).toEqual(poi.point);expect(feature.properties?.address).toBe(poi.address??'');}
 expect(layers.find(l=>l.id==='hospital')!.features).toHaveLength(10);expect(layers.find(l=>l.id==='municipal')!.features).toHaveLength(57);expect(layers.find(l=>l.id==='cadastral')!.features).toHaveLength(112);expect(JSON.stringify(f.release)).toBe(before);
});
it('keeps unknown categories missing and labels reference PID without inventing objects',()=>{
 const layers=publishedGameLayers(f.release);for(const id of ['golf','aquapark','vltava'])expect(layers.find(l=>l.id===id)).toMatchObject({state:'missing',features:[]});
 expect(layers.find(l=>l.id==='pid')!.features.map(f=>f.id)).toEqual(f.release.data.pidSnapshot.stops.filter(p=>p.eligibility==='allowed').map(s=>s.id));expect(layers.find(l=>l.id==='rail')!.features.map(f=>f.id)).toEqual(f.release.data.pidSnapshot.stops.filter(p=>p.eligibility==='allowed'&&p.referenceModes.includes('train')).map(s=>s.id));
});
