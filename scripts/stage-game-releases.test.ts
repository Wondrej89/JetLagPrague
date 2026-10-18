import { it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile, rm, readdir, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { releaseTestFixture } from '../packages/geo-core/src/game-release-test-fixtures';
import { canonicalJson } from '../packages/geo-core/src/administrative';
import { releaseEntry } from '../packages/geo-core/src/game-release';
import { stageGameReleases } from './stage-game-releases';
it('stages a complete allowlisted release and preserves the previous staged artifact when a later release fails validation',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'game-release-stage-')); const from=join(temp,'source'),to=join(temp,'stage');await mkdir(from);
 try {const release=await releaseTestFixture(),entry=await releaseEntry(release); const pointer=JSON.stringify({format:'jetlag-prague-game-catalog',schemaVersion:1,current:entry,versions:[entry]});await writeFile(join(from,entry.file),canonicalJson(release));await writeFile(join(from,'current.json'),pointer);await writeFile(join(from,'private-draft.json'),'NEZVEREJNOVAT');await stageGameReleases(from,to);expect((await readdir(to)).sort()).toEqual(['current.json',entry.file].sort());await writeFile(join(from,entry.file),'{}');await expect(stageGameReleases(from,to)).rejects.toThrow();expect(await readFile(join(to,'current.json'),'utf8')).toBe(pointer);expect(await readFile(join(to,entry.file),'utf8')).toBe(canonicalJson(release));}
 finally {await rm(temp,{force:true,recursive:true});}
});
