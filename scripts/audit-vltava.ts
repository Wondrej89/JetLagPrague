import {readFile,writeFile} from 'node:fs/promises';
import {readGameReleaseArtifact,readGameReleaseIndex} from '../packages/geo-core/src/game-release';
import {auditVltavaSource} from './vltava-source-audit';
const index=readGameReleaseIndex(JSON.parse(await readFile('data/releases/current.json','utf8'))),release=await readGameReleaseArtifact(await readFile('data/releases/'+index.current.file,'utf8'),index.current);
const audit=await auditVltavaSource(new Uint8Array(await readFile('data/raw/AGD_CUR_AGD_OCH_VODNIPLOCHYTOKY_P.zip')),release);
await writeFile('data/source-metadata/vltava-audit.json',JSON.stringify(audit,null,2)+'\n');
console.log(JSON.stringify({streams:audit.inventory.streams,connectedWithTributaries:audit.connectivity.riverAndTributariesComponent.length,candidates:audit.candidate.records.length,candidateGeometry:audit.candidate.geometry,locationChecks:audit.locationChecks,publication:audit.publication},null,2));
