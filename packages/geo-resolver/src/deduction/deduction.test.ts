import {beforeAll,expect,it} from 'vitest';
import {booleanPointInPolygon} from '@turf/turf';
import {gameFixture} from '../../../game-core/src/test-fixtures';
import type {Deduction,Point} from '../../../game-core/src/index';
import type {AreaGeometry,GameDataRelease} from '../../../geo-core/src/index';
import {distanceMeters,distanceToPoiMeters} from '../../../geo-core/src/index';
import {DeductionComputer} from './geometry';
import {project,unproject} from './spatial-index';
let fixture:Awaited<ReturnType<typeof gameFixture>>;
beforeAll(async()=>{fixture=await gameFixture();});
const origin:Point=[14.43,50.08];
const xy=(x:number,y:number):Point=>{const p=project(origin);return unproject([p[0]+x,p[1]+y]);};
function box(x:number,y:number,size:number):AreaGeometry{return {type:'Polygon',coordinates:[[xy(x,y),xy(x+size,y),xy(x+size,y+size),xy(x,y+size),xy(x,y)]]};}
function world(area=box(-2500,-2500,5000)):GameDataRelease{return {...fixture.release,data:{...fixture.release.data,gameArea:{...fixture.release.data.gameArea,geometry:area}}};}
function deduction(resolver:Deduction['parameters']['resolver'],result:string,extra:Partial<Deduction['parameters']>={},id='q1'):Deduction {
 return {id:id+':deduction',questionId:id,epochId:'epoch:1',releaseId:fixture.release.releaseId,geometryTarget:'station',operation:['NE','DÁL','CHLADNĚJI'].includes(result)?'exclude':'include',sourceType:resolver==='radar'?'radar':resolver==='thermometer'?'thermometer':resolver==='poi_measuring'?'measuring':'matching',result,createdAt:1000,status:'active',parameters:{definitionId:resolver,category:'hospital',resolver,hunterPoint:origin,toleranceMeters:1e-6,distanceMode:'geometry',...extra}};
}
const inside=(p:Point,g:AreaGeometry|null)=>!!g&&booleanPointInPolygon(p,g);
it('Radar ANO / NE clips true metre distances to the game area and leaves an uncertainty band',()=>{
 const computer=new DeductionComputer(world()),yes=computer.compute([deduction('radar','ANO',{radiusMeters:1200})],'station'),no=computer.compute([deduction('radar','NE',{radiusMeters:1200})],'station');
 expect(inside(origin,yes.possible)).toBe(true);expect(inside(origin,no.excluded)).toBe(true);
 expect(inside(xy(2000,0),yes.excluded)).toBe(true);expect(inside(xy(2000,0),no.possible)).toBe(true);
 expect(inside(xy(6000,0),no.possible)).toBe(false);
 for(let x=-2200;x<=2200;x+=137)for(let y=-2200;y<=2200;y+=149){const p=xy(x,y),d=distanceMeters(origin,p);if(inside(p,yes.excluded))expect(d).toBeGreaterThan(1200);if(inside(p,yes.possible))expect(d).toBeLessThan(1200);if(Math.abs(d-1200)<10)expect(inside(p,yes.neutral)).toBe(true);}
 expect(computer.compute([deduction('radar','ANO',{radiusMeters:1200})],'station')).toBe(yes);
});
it('combines intersecting radars and has no green cells for contradictory conditions',()=>{
 const computer=new DeductionComputer(world()),first=deduction('radar','ANO',{radiusMeters:1500}),second=deduction('radar','NE',{radiusMeters:700,hunterPoint:xy(800,0)},'q2');
 const result=computer.compute([first,second],'station');expect(inside(xy(-800,0),result.possible)).toBe(true);expect(inside(xy(800,0),result.excluded)).toBe(true);
 const contradiction=computer.compute([first,{...first,id:'contradiction',questionId:'other',operation:'exclude',result:'NE'}],'station');expect(contradiction.possible).toBeNull();expect(contradiction.excluded).not.toBeNull();
});
it('preserves holes and separate MultiPolygon components during all clipping operations',()=>{
 const left=box(-2500,-1500,2500);if(left.type!=='Polygon')throw new Error();const hole=box(-2000,-1000,600);if(hole.type!=='Polygon')throw new Error();left.coordinates.push(hole.coordinates[0].slice().reverse());
 const right=box(1000,500,1000);if(right.type!=='Polygon')throw new Error();const area:AreaGeometry={type:'MultiPolygon',coordinates:[left.coordinates,right.coordinates]};
 const result=new DeductionComputer(world(area)).compute([deduction('radar','ANO',{radiusMeters:5000})],'station');
 expect(result.possible?.type).toBe('MultiPolygon');expect(inside(xy(-2200,-1200),result.possible)).toBe(true);expect(inside(xy(-1800,-800),result.possible)).toBe(false);expect(inside(xy(1400,900),result.possible)).toBe(true);expect(inside(xy(500,0),result.possible)).toBe(false);
});
it('Measuring uses the distance field of ALL objects, including different nearest objects',()=>{
 const release=world(),template=release.data.pois.find(p=>p.category==='hospital')!;
 release.data.pois=[-1600,1600].map((x,i)=>({...template,id:'hospital-'+i,point:xy(x,0),geometry:{type:'Point' as const,coordinates:xy(x,0)}}));
 const d=deduction('poi_measuring','BLÍŽ',{hunterPoint:xy(-1600,1200)}),result=new DeductionComputer(release).compute([d],'station');
 expect(inside(xy(1600,100),result.possible)).toBe(true);expect(inside(xy(0,2000),result.excluded)).toBe(true);
 for(let x=-2300;x<=2300;x+=163)for(let y=-2300;y<=2300;y+=181){const p=xy(x,y),nearest=Math.min(...release.data.pois.map(poi=>distanceMeters(p,poi.point)));if(inside(p,result.possible))expect(nearest).toBeLessThan(distanceMeters(d.parameters.hunterPoint,release.data.pois[0].point));}
});
it('Measuring measures irregular polygons, holes and MultiPolygons as actual surfaces',()=>{
 const release=world(),template=release.data.pois.find(p=>p.category==='waterbody')!,a=box(-1800,-1800,1400),hole=box(-1500,-1500,800),b=box(1300,1300,500);if(a.type!=='Polygon'||hole.type!=='Polygon'||b.type!=='Polygon')throw new Error();
 a.coordinates.push(hole.coordinates[0].slice().reverse());const geometry:AreaGeometry={type:'MultiPolygon',coordinates:[a.coordinates,b.coordinates]};
 release.data.pois=[{...template,id:'water:test',point:xy(-1700,-1700),geometry}];
 const d=deduction('poi_measuring','BLÍŽ',{category:'waterbody',hunterPoint:xy(0,-1100)}),result=new DeductionComputer(release).compute([d],'station');
 expect(inside(xy(1500,1500),result.possible)).toBe(true);expect(inside(xy(2000,-1800),result.excluded)).toBe(true);
 const threshold=distanceToPoiMeters(d.parameters.hunterPoint,release.data.pois[0],'geometry');
 for(let x=-2200;x<=2200;x+=211)for(let y=-2200;y<=2200;y+=199){const p=xy(x,y),distance=distanceToPoiMeters(p,release.data.pois[0],'geometry');if(inside(p,result.possible))expect(distance).toBeLessThan(threshold);if(inside(p,result.excluded))expect(distance).toBeGreaterThan(threshold);}
},15000);
it('Thermometer colours geodesic half-regions from immutable A/B, and draws the measurement and equality guide',()=>{
 const d=deduction('thermometer','TEPLEJI',{hunterPoint:xy(-800,0),secondPoint:xy(800,0),toleranceMeters:1}),computer=new DeductionComputer(world()),warmer=computer.compute([d],'station'),colder=computer.compute([{...d,result:'CHLADNĚJI',operation:'exclude'}],'station');
 expect(inside(xy(1800,0),warmer.possible)).toBe(true);expect(inside(xy(-1800,0),warmer.excluded)).toBe(true);expect(inside(xy(-1800,0),colder.possible)).toBe(true);expect(inside(origin,warmer.neutral)).toBe(true);
 expect(warmer.lines.features).toHaveLength(2);for(const p of warmer.lines.features[1].geometry.coordinates.filter(p=>p[0]>14.35&&p[0]<14.5&&p[1]>50&&p[1]<50.2))expect(Math.abs(distanceMeters(d.parameters.hunterPoint,p as Point)-distanceMeters(d.parameters.secondPoint!,p as Point))).toBeLessThan(.01);
});
it('Matching uses a deterministic nearest-object partition, not a midpoint of an arbitrary POI pair',()=>{
 const release=world(),template=release.data.pois.find(p=>p.category==='hospital')!;
 release.data.pois=[[-1600,0],[1600,0],[0,1600]].map(([x,y],i)=>({...template,id:'hospital-'+i,point:xy(x,y),geometry:{type:'Point' as const,coordinates:xy(x,y)}}));
 const d=deduction('poi_matching','ANO',{hunterPoint:xy(-1600,0)}),same=new DeductionComputer(release).compute([d],'station');
 expect(inside(xy(-1800,-1200),same.possible)).toBe(true);expect(inside(xy(1700,0),same.excluded)).toBe(true);expect(inside(xy(0,1800),same.excluded)).toBe(true);
});
it('never combines different epochs, releases, station targets or GPS from distinct measurement times',()=>{
 const computer=new DeductionComputer(world()),a=deduction('radar','ANO',{radiusMeters:1200});
 expect(()=>computer.compute([a,{...a,id:'x',epochId:'other'}],'station')).toThrow('etapy');
 expect(()=>computer.compute([{...a,releaseId:'other'}],'station')).toThrow('katalogy');
 const gps={...a,geometryTarget:'gps' as const};expect(()=>computer.compute([gps,{...gps,id:'other',questionId:'other'}],'gps')).toThrow('GPS');
 expect(computer.compute([a,gps],'station').deductionIds).toEqual([a.id]);expect(computer.compute([{...a,status:'archived'}],'station').possible).toBeNull();
});
