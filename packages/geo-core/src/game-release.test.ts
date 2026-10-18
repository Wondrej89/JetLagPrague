import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { booleanPointInPolygon } from '@turf/turf';
import { buildGameDataRelease, compareGameReleases, containsGamePoint, createGameDataRelease, gamePublicationErrors, loadGameDataRelease, readGameReleaseArtifact, readGameReleaseIndex, releaseEntry, releaseHidingZone, verifyGameDataRelease, type GameReleaseIndex } from './game-release';
import { releaseTestInput, releaseTestAirports, releaseTestDate, releaseTestFixture, releaseTestArea } from './game-release-test-fixtures';
import { canonicalJson } from './administrative';
import { buildGameStops } from './game-stops';
import { defaultGameStopConfiguration } from './game-stop-configuration';
import { exportWorld, importWorld } from './index';

describe('Published game releases', () => {
  beforeEach(()=> { vi.useFakeTimers({toFake:['Date']}); vi.setSystemTime(new Date(releaseTestDate)); });
  afterEach(()=>vi.useRealTimers());
  it('publishes only approved POIs, exact ARPs and active game stops; strips private draft fields', async()=> {
    const release = await releaseTestFixture();
    expect(release.kind).toBe('approved'); expect(gamePublicationErrors(release)).toEqual([]);
    expect(release.data.pois.filter(p=>p.category==='park').map(p=>p.id)).toEqual(['manual-park:approved']);
    expect(release.data.pois.filter(p=>p.category==='airport').map(p=>[p.id,p.point])).toEqual([['LKKB',[14.543639,50.121367]],['LKPR',[14.26,50.100833]],['LKTC',[14.425556,49.985278]]]);
    expect(release.data.pidSnapshot.stops.map(p=>p.id)).toEqual(['pid-group:edge','pid-group:inside']);
    expect(canonicalJson(release)).not.toMatch(/NEZVEREJNOVAT|PRIVATE NOTE|privateAudit|importAudit/);
    expect(containsGamePoint([14.3,50.1],releaseTestArea)).toBe(true); expect(containsGamePoint([14.46,50.12],releaseTestArea)).toBe(false);
  });
  it('content identity is independent of order and publication time, but detects changed content',async()=> {
    const one=await releaseTestFixture(); const data=structuredClone(one.data); data.pois.reverse(); data.pidSnapshot.stops.reverse(); data.sourceVersions.reverse();
    const two=await createGameDataRelease(data,{kind:'approved',publishedAt:'2026-10-15T10:00:00.000Z'});
    expect(two.releaseId).toBe(one.releaseId); expect(two.checksums).toEqual(one.checksums); expect((await releaseEntry(two)).checksum).not.toBe((await releaseEntry(one)).checksum);
    data.pois.find(p=>p.category==='park')!.name='Upravený park'; const three=await createGameDataRelease(data,{kind:'approved',publishedAt:releaseTestDate});
    expect(three.releaseId).not.toBe(one.releaseId); expect(compareGameReleases(one,three).pois).toEqual({added:0,changed:1,removed:0});
  });
  it('uses manual points, explicit group merges and permitted modes without changing draft/export',async()=> {
    const {world,snapshot}=await releaseTestInput(); world.gameStops={...defaultGameStopConfiguration(),allowedModes:['tram'],nodes:[{id:'manual:merged',name:'Test uzel',groupIds:['inside','outside'],justification:'Test sloučení'}]};
    const merged=buildGameStops(snapshot,world.gameStops).find(stop=>stop.id==='manual:merged')!; world.gameStops.overrides=[{stopId:merged.id,sourceSignature:merged.sourceSignature,decision:'allowed',point:[14.42,50.08],approvedAt:releaseTestDate,justification:'Test bod'}];
    const before=exportWorld(world); const release=await buildGameDataRelease(world,releaseTestAirports,snapshot,releaseTestDate);
    expect(release.data.pidSnapshot.stops).toHaveLength(1); expect(release.data.pidSnapshot.stops[0]).toMatchObject({point:[14.42,50.08],groupIds:['inside','outside'],modes:['tram']});
    expect(exportWorld(world)).toBe(before); expect(importWorld(before)).toEqual(world);
  });
  it('rejects tampering, invalid ARPs, forbidden modes, incomplete files and paths',async()=> {
    const release=await releaseTestFixture(),entry=await releaseEntry(release);
    await expect(readGameReleaseArtifact(canonicalJson(release)+' ',entry)).rejects.toThrow('poškozený');
    const altered=structuredClone(release); altered.data.gameArea.name='Changed'; await expect(verifyGameDataRelease(altered)).rejects.toThrow('součet');
    altered.data.pois[0].point=[0,0]; await expect(verifyGameDataRelease(altered)).rejects.toThrow('ARP');
    const index={format:'jetlag-prague-game-catalog',schemaVersion:1,current:entry,versions:[entry]}; expect(()=>readGameReleaseIndex({...index,current:{...entry,file:'../private.json'}})).toThrow();
    const badData=structuredClone(release.data); badData.rulesConfig.allowedModes=['train']; await expect(createGameDataRelease(badData,{kind:'approved',publishedAt:releaseTestDate})).rejects.toThrow('dopravním');
  });
  it('pins releases across later publications and verifies every file before use',async()=> {
    const old=await releaseTestFixture(),data=structuredClone(old.data); data.gameArea.name='Nová oblast'; const next=await createGameDataRelease(data,{kind:'approved',publishedAt:releaseTestDate});
    const oldEntry=await releaseEntry(old),nextEntry=await releaseEntry(next);
    const index:GameReleaseIndex={format:'jetlag-prague-game-catalog',schemaVersion:1,current:nextEntry,versions:[oldEntry,nextEntry]};
    const files:Record<string,string>={'current.json':JSON.stringify(index),[oldEntry.file]:canonicalJson(old),[nextEntry.file]:canonicalJson(next)};
    const fetcher=vi.fn(async(input:RequestInfo|URL)=>new Response(files[new URL(String(input)).pathname.split('/').at(-1)!]??'',{status:files[new URL(String(input)).pathname.split('/').at(-1)!]?200:404})) as unknown as typeof fetch;
    expect((await loadGameDataRelease('https://example.test/releases/',fetcher,old.releaseId)).release.releaseId).toBe(old.releaseId);
    expect((await loadGameDataRelease('https://example.test/releases/',fetcher)).release.releaseId).toBe(next.releaseId);
    await expect(loadGameDataRelease('https://example.test/releases/',fetcher,'release:'+'f'.repeat(64))).rejects.toThrow('Uzamčená');
    files[nextEntry.file]='{}'; await expect(loadGameDataRelease('https://example.test/releases/',fetcher)).rejects.toThrow('poškozený');
    delete files[nextEntry.file]; await expect(loadGameDataRelease('https://example.test/releases/',fetcher)).rejects.toThrow('kompletní');
  });
  it('clips hiding zones to the area and refuses stale releases for live evaluation',async()=> {
    const release=await releaseTestFixture(),zone=releaseHidingZone(release,'pid-group:edge')!;
    const polygons=zone.type==='Polygon'?[zone.coordinates]:zone.coordinates;
    for (const rings of polygons) for(const ring of rings) for(const p of ring) expect(p[0]).toBeGreaterThanOrEqual(14.3-1e-9);
    expect(booleanPointInPolygon([14.3,50.1],zone)).toBe(true);
    vi.setSystemTime(new Date('2026-10-16T08:00:00Z')); expect(gamePublicationErrors(release).join(' ')).toContain('aktuální'); expect(()=>releaseHidingZone(release,'pid-group:edge')).toThrow('historické');
    const {world,snapshot}=await releaseTestInput(); const historical=await buildGameDataRelease(world,releaseTestAirports,snapshot); expect(historical.kind).toBe('reference'); expect(historical.data.pidSnapshot.stops.length).toBeGreaterThan(0);
  });
});
