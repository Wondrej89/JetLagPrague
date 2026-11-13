import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {readParkFile} from '../packages/geo-core/src/park-import';
import {readGameReleaseArtifact,readGameReleaseIndex} from '../packages/geo-core/src/game-release';
import {canonicalJson} from '../packages/geo-core/src/administrative';
import {sha256} from '../packages/geo-core/src/pid-snapshot';
import {verifyVltavaSource,type VltavaSource} from '../packages/geo-core/src/vltava-assembly';
import {auditVltavaSource} from './vltava-source-audit';

const bytes=new Uint8Array(await readFile('data/raw/AGD_CUR_AGD_OCH_VODNIPLOCHYTOKY_P.zip'));
const index=readGameReleaseIndex(JSON.parse(await readFile('data/releases/current.json','utf8')));
const release=await readGameReleaseArtifact(await readFile('data/releases/'+index.current.file,'utf8'),index.current);
const [file,audit]=await Promise.all([readParkFile(bytes,'AGD_CUR_AGD_OCH_VODNIPLOCHYTOKY_P.zip'),auditVltavaSource(bytes,release)]);
const previous=JSON.parse(await readFile('data/source-metadata/vltava-audit.json','utf8'));
if(previous.source.checksum!==file.originalChecksum||canonicalJson(previous.candidate.records)!==canonicalJson(audit.candidate.records))throw new Error('Zdroj se změnil. Nejprve proveďte a zkontrolujte nový audit; staré kandidáty nelze potichu přenést.');
const water=JSON.parse(await readFile('data/source-metadata/waterbodies-audit.json','utf8'));
const candidates=new Set(audit.candidate.records.map(r=>r.globalId)),related=new Set(audit.connectivity.riverAndTributariesComponent.map(r=>r.globalId));
const body:Omit<VltavaSource,'checksum'>={format:'jetlag-prague-vltava-streams',schemaVersion:1,id:'praha-water-streams',rawChecksum:file.originalChecksum,
 source:{provider:water.source.provider,url:water.source.url,version:'raw-'+file.originalChecksum,dataDate:null,retrievedAt:water.source.retrievedAt,license:{name:'Konkrétní licence není v dodaném ZIPu doložena',url:null},transformation:file.transformation},
 records:file.features.flatMap((f,i)=>f.properties.TYP==='T'&&f.geometry&&(f.geometry.type==='Polygon'||f.geometry.type==='MultiPolygon')?[{globalId:String(f.properties.GLOBALID),row:i+1,type:'T' as const,geometry:f.geometry,attributes:f.properties,candidate:candidates.has(String(f.properties.GLOBALID)),related:related.has(String(f.properties.GLOBALID)),neighbors:audit.sourceAdjacency[String(f.properties.GLOBALID)]}]:[]),
 sites:audit.locationChecks.map(s=>({id:s.id,name:s.name,point:s.point,referenceRelease:s.referenceRelease}))};
const checksum=await sha256(canonicalJson(body)),source=await verifyVltavaSource({...body,checksum},checksum);
await mkdir('apps/editor/public/vltava',{recursive:true});
await writeFile('apps/editor/public/vltava/streams.json',JSON.stringify(source)+'\n');
await writeFile('apps/editor/src/data/vltava-manifest.json',JSON.stringify({file:'vltava/streams.json',checksum,rawChecksum:source.rawChecksum,records:source.records.length,candidates:candidates.size,related:related.size},null,2)+'\n');
console.log(JSON.stringify({records:source.records.length,candidates:candidates.size,related:related.size,checksum}));
