/** One addition of approved water polygons; earlier artifacts and PID content
 * are immutable. An older PID remains a historical reference, never re-dated. */
import {readFile,writeFile} from 'node:fs/promises';
import {canonicalJson,createGameDataRelease,pragueDate,readGameReleaseArtifact,readGameReleaseIndex,releaseEntry,releasePoiSchema,poiSchema} from '../packages/geo-core/src/index';
const directory='data/releases';
const index=readGameReleaseIndex(JSON.parse(await readFile(`${directory}/current.json`,'utf8')));
const previous=await readGameReleaseArtifact(await readFile(`${directory}/${index.current.file}`,'utf8'),index.current);
if(previous.data.pois.some(p=>p.category==='waterbody'))throw new Error('Vodní plochy již publikované jsou. Další rozhodnutí publikujte z editoru.');
const dataset=JSON.parse(await readFile('apps/editor/src/data/waterbody-catalog.json','utf8'));
const approved=(dataset.records as unknown[]).map(p=>poiSchema.parse(p)).filter(p=>p.status==='approved');
const data=structuredClone(previous.data);
for(const p of approved)data.pois.push(releasePoiSchema.parse({id:p.id,category:p.category,name:p.name,point:p.point,geometry:p.geometry,waterbody:p.waterbody,sourceId:p.sourceId,source:{...p.source,note:''},status:'approved',reviewedAt:p.reviewedAt}));
data.sourceVersions.push({key:`poi:${dataset.source.id}`,version:dataset.checksum,checksum:dataset.source.rawChecksum,provider:dataset.source.provider,url:dataset.source.url,dataDate:dataset.source.dataDate,license:dataset.source.license});
const at=new Date().toISOString();
const kind=previous.kind==='approved'&&data.pidSnapshot.serviceDate===pragueDate(new Date(at))?'approved':'reference';
const release=await createGameDataRelease(data,{publishedAt:at,kind});
const entry=await releaseEntry(release);
await writeFile(`${directory}/${entry.file}`,canonicalJson(release),{flag:'wx'});
await writeFile(`${directory}/current.json`,JSON.stringify({...index,current:entry,versions:[...index.versions,entry]},null,2)+'\n');
console.log(JSON.stringify({release:release.releaseId,kind,waterbodies:approved.length,unchangedPid:data.pidSnapshot.checksum}));
