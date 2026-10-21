import { readFile, writeFile } from 'node:fs/promises';
import '../packages/geo-core/src/index';
import { importWaterZip } from '../packages/geo-core/src/water-import';
import { WATER_RULES, waterNameKey } from '../packages/geo-core/src/waterbodies';

const filename='AGD_CUR_AGD_OCH_VODNIPLOCHYTOKY_P.zip';
const dataset=await importWaterZip(new Uint8Array(await readFile(`data/raw/${filename}`)),filename);
await writeFile('apps/editor/src/data/waterbody-catalog.json',JSON.stringify(dataset)+'\n');
const audit={sourceChecksum:dataset.source.rawChecksum,datasetChecksum:dataset.checksum,source:dataset.source,counts:Object.fromEntries(['approved','review','excluded'].map(status=>[status,dataset.records.filter(p=>p.status===status).length])),named:dataset.records.length,rules:WATER_RULES,
  excludedNames:WATER_RULES.excluded.map(name=>({name,sourceNames:[...new Set(dataset.records.filter(p=>waterNameKey(p.name)===waterNameKey(name)).map(p=>p.name))],polygons:dataset.records.filter(p=>waterNameKey(p.name)===waterNameKey(name)).length})),
  reviewNames:Object.keys(WATER_RULES.review).map(name=>({name,polygons:dataset.records.filter(p=>waterNameKey(p.name)===waterNameKey(name)).length})),
  info:(dataset.importRecord as { [key:string]:unknown }).info,
};
await writeFile('data/source-metadata/waterbodies-audit.json',JSON.stringify(audit,null,2)+'\n');
console.log(JSON.stringify({named:audit.named,counts:audit.counts,excludedByNamedList:audit.excludedNames.reduce((sum,r)=>sum+r.polygons,0),reviewByNamedList:audit.reviewNames.reduce((sum,r)=>sum+r.polygons,0)}));
