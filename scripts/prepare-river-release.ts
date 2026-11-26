import { mkdtemp, readFile, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { canonicalJson } from '../packages/geo-core/src/administrative';
import { createGameDataRelease, readGameReleaseArtifact, readGameReleaseIndex, releaseEntry } from '../packages/geo-core/src/game-release';
import { sha256 } from '../packages/geo-core/src/pid-snapshot';
import { verifyVltavaSource } from '../packages/geo-core/src/vltava-assembly';
import { vltavaAssemblySchema } from '../packages/geo-core/src/vltava-assembly-schema';
import { previewVltavaAssembly } from '../packages/geo-core/src/vltava-topology';
import manifest from '../apps/editor/src/data/vltava-manifest.json';
import { prepareRiverLayers, reviewRiverLayers } from './river-release-preparation';

const {values} = parseArgs({options:{
  river:{type:'string',default:'data/raw/vltava-berounka-approved.geojson'},
  assembly:{type:'string',default:'data/raw/reky-draft.json'},
  'metadata-review':{type:'string'},
  output:{type:'string'},
  'write-reference-release':{type:'boolean'},
}});
const readJson = async (path:string):Promise<unknown> => JSON.parse(await readFile(path,'utf8'));
const index = readGameReleaseIndex(await readJson('data/releases/current.json'));
const release = await readGameReleaseArtifact(await readFile(`data/releases/${index.current.file}`,'utf8'),index.current);
const assembly = await readJson(values.assembly).catch(error=>{
  if (error.code === 'ENOENT') return null;
  throw error;
});
const candidate = await reviewRiverLayers(release.data,await readJson(values.river),assembly);
const archiveChecksum = await sha256(new Uint8Array(await readFile('data/raw/AGD_CUR_AGD_OCH_VODNIPLOCHYTOKY_P.zip')));
if (archiveChecksum !== candidate.feature.properties.source.rawChecksum) throw new Error('Původní GIS archiv neodpovídá schválenému polygonu.');
if (assembly) {
  const streamSource = await verifyVltavaSource(await readJson(`apps/editor/public/${manifest.file}`),manifest.checksum);
  const assembled = await previewVltavaAssembly(streamSource,vltavaAssemblySchema.parse(assembly));
  if (assembled.geometryChecksum !== candidate.geometryChecksum) throw new Error('Schválený výběr nevytváří stejný polygon řek.');
  console.log(`Ověřeno ${assembled.sourceCount} zdrojových polygonů a ${assembled.holes.length} otvorů.`);
}

const proof = values['metadata-review'] ? await readJson(values['metadata-review']) : null;
const layers = proof ? await prepareRiverLayers(candidate,proof) : null;
const source = layers?.river.feature.properties.source;
const {river:riverAudit,...report} = candidate.report;
console.log(JSON.stringify({...report,river:{...riverAudit,sourceProblems:source?[]:riverAudit.sourceProblems},publication:{
  status:layers?'ready-for-review':'blocked',
  source:source&&{url:source.url,dataDate:source.dataDate,license:source.license},
  reasons:layers?[]:[...candidate.report.river.sourceProblems,...candidate.report.land.problems,'Chybí doložená revize licence a data zdroje.'],
}},null,2));

if ((values.output || values['write-reference-release']) && !layers) {
  throw new Error('Publikační podklady vyžadují --metadata-review s doloženými metadaty.');
}
if (values.output && layers) await writeFile(values.output,canonicalJson(layers)+'\n',{flag:'wx'});

if (values['write-reference-release'] && layers) {
  const data = {...release.data,river:undefined,land:undefined,riverArea:layers.river,landAreas:layers.land};
  const reference = await createGameDataRelease(data,{
    kind:'reference',publishedAt:new Date().toISOString(),
  });
  if (reference.releaseId === index.current.releaseId) {
    console.log(`Referenční vydání ${reference.releaseId} je již aktuální.`);
  } else {
    const entry = await releaseEntry(reference);
    const next = readGameReleaseIndex({...index,current:entry,versions:[...index.versions,entry]});
    const indexBytes = JSON.stringify(next,null,2)+'\n';
    const staged = await mkdtemp('data/releases/.river-index-');
    try {
      await writeFile(`${staged}/current.json`,indexBytes,{flag:'wx'});
      await writeFile(`data/releases/${entry.file}`,canonicalJson(reference),{flag:'wx'});
      await rename(`${staged}/current.json`,'data/releases/current.json');
    } finally {
      await unlink(`${staged}/current.json`).catch(error=>{if(error.code!=='ENOENT')throw error;});
      await rmdir(staged);
    }
    console.log(`Referenční vydání ${reference.releaseId}, PID ${reference.data.pidSnapshot.serviceDate}.`);
  }
}
