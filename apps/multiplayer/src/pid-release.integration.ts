import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import type { RoomCredentials, RoomSnapshot } from '../../../packages/game-core/src/room-protocol';
import { canonicalJson } from '../../../packages/geo-core/src/administrative';
import {
  compileReleaseStops, createGameDataRelease, gamePublicationErrors, readGameReleaseArtifact, readGameReleaseIndex,
  releaseEntry, releaseGeography, releasePidSources,
} from '../../../packages/geo-core/src/game-release';
import { buildGameStops } from '../../../packages/geo-core/src/game-stops';
import { gtfsFixture, testGtfsSnapshot } from '../../../packages/geo-core/src/gtfs-test-fixtures';
import { createPidSnapshot, pragueDate, snapshotReference } from '../../../packages/geo-core/src/pid-snapshot';
import { assemblePages } from '../../../scripts/assemble-pages';
import { checkGameReleasePid, refreshGameReleasePid } from '../../../scripts/game-release-pid';
import { localWorker } from '../../../scripts/multiplayer-test-server';
import { writePublication } from '../../../scripts/pid-publication';
import { stageGameReleases } from '../../../scripts/stage-game-releases';
import { stagePidPublication } from '../../../scripts/stage-pid-publication';

const origin = 'https://wondrej89.github.io';
const geographyId = 'release:b50f43e3da15d92eed74d2c6eed52f152aa162245da51c176f2393499bf6239d';

async function gtfsFor(day: string, label: string) {
  const data = gtfsFixture(), compact = day.replaceAll('-', '');
  data.tables.feedInfo[0].feed_start_date = compact;
  data.tables.feedInfo[0].feed_end_date = compact;
  data.tables.calendar = data.tables.calendar.slice(0, 1).map(calendar => ({
    ...calendar, start_date: compact, end_date: compact, monday: '1', tuesday: '1', wednesday: '1', thursday: '1',
    friday: '1', saturday: '1', sunday: '1',
  }));
  data.tables.trips = data.tables.trips.filter(trip => trip.trip_id === 'TW');
  data.stopTimes = data.stopTimes.filter(call => call.trip_id === 'TW');
  data.groups.generatedAt = day + 'T03:00:00';
  data.groups.stopGroups[0].name = label;
  return testGtfsSnapshot(day, data);
}

it('publishes checked PID changes through the assembled Pages artifact and keeps existing live rooms pinned', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jetlag-pid-release-'));
  const now = new Date(), today = pragueDate(now);
  const previousDate = new Date(today + 'T12:00:00.000Z');
  previousDate.setUTCDate(previousDate.getUTCDate() - 1);
  const yesterday = pragueDate(previousDate);
  const dirs = { pid: join(root, 'pid'), releases: join(root, 'releases') };
  const dist = join(root, 'dist'), persist = join(root, 'worker');
  let worker: ReturnType<typeof localWorker> | undefined;
  try {
    await mkdir(dirs.releases);
    await mkdir(join(dist, 'simulator'), { recursive: true });
    const sourceIndex = readGameReleaseIndex(JSON.parse(await readFile('data/releases/current.json', 'utf8')));
    const geographyEntry = sourceIndex.versions.find(entry => entry.releaseId === geographyId)!;
    const geography = await readGameReleaseArtifact(await readFile(join('data/releases', geographyEntry.file), 'utf8'), geographyEntry);
    const oldPid = await gtfsFor(yesterday, 'Původní GTFS');
    const firstPid = await gtfsFor(today, 'Dnešní GTFS');
    const old = await createGameDataRelease({
      ...geography.data,
      pidSnapshot: { ...snapshotReference(oldPid), quality: 'verified',
        stops: compileReleaseStops(buildGameStops(oldPid, undefined, yesterday), geography.data.gameArea.geometry, true) },
      sourceVersions: [...geography.data.sourceVersions.filter(source => !source.key.startsWith('pid:')), ...releasePidSources(oldPid)],
    }, { kind: 'reference', publishedAt: previousDate.toISOString(), schemaVersion: geography.schemaVersion });
    const oldEntry = await releaseEntry(old);
    await writeFile(join(dirs.releases, oldEntry.file), canonicalJson(old));
    await writeFile(join(dirs.releases, 'current.json'), JSON.stringify({ ...sourceIndex, current: oldEntry, versions: [oldEntry] }));
    await writePublication(oldPid, dirs.pid);
    await writePublication(firstPid, dirs.pid);
    await expect(checkGameReleasePid(dirs).then(release => release.releaseId)).rejects.toThrow(`pid-data má ${today}`);
    const first = await refreshGameReleasePid(dirs, now);
    const approved = await checkGameReleasePid(dirs);
    expect(first).toMatchObject({ approval: 'approved', releaseId: approved.releaseId, changed: true });
    expect(gamePublicationErrors(approved, today)).toEqual([]);
    expect(releaseGeography(approved.data).landAreas?.areas).toHaveLength(24);
    for (const key of ['gameArea', 'pois', 'administrativeAreas', 'riverArea', 'landAreas', 'rulesConfig'] as const) {
      expect(approved.checksums[key]).toBe(geography.checksums[key]);
    }
    expect(await refreshGameReleasePid(dirs, now)).toMatchObject({ changed: false, releaseId: approved.releaseId });
    const assemble = async () => {
      await stageGameReleases(dirs.releases, join(dist, 'game', 'releases'));
      await stagePidPublication(dirs.pid, join(dist, 'editor', 'pid'));
      await assemblePages(dist);
      const siteRelease = join(dist, 'site', 'releases');
      await checkGameReleasePid({ pid: join(dist, 'site', 'editor', 'pid'), releases: siteRelease });
      return siteRelease;
    };
    let releaseDirectory = await assemble();
    worker = localWorker({ persist, releaseDirectory, origin, reference: false });
    const create = async () => {
      const response = await worker!.dispatchFetch('http://localhost/rooms', {
        method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Connection: 'close' },
        body: JSON.stringify({ size: 'medium', fix: { point: [14.414069175, 50.08076645], at: Date.now(), accuracy: 5 } }),
      });
      expect(response.status).toBe(201);
      return await response.json() as RoomCredentials;
    };
    const view = async (room: RoomCredentials) => {
      const response = await worker!.dispatchFetch(`http://localhost/rooms/${room.code}/${room.roomId}`, {
        headers: { Origin: origin, Authorization: `Bearer ${room.token}`, Connection: 'close' },
      });
      expect(response.status).toBe(200);
      return await response.json() as RoomSnapshot;
    };
    const room = await create();
    expect(await view(room)).toMatchObject({ reference: false, view: { releaseId: approved.releaseId, hideRemainingMs: 45 * 60_000 } });
    await worker.dispose();
    worker = undefined;

    const compiled = buildGameStops(firstPid, undefined, today).filter(stop => stop.eligibility === 'allowed');
    const ambiguous = compiled.find(stop => approved.data.pidSnapshot.stops.some(published => published.id === stop.id))!;
    const keep = approved.data.pidSnapshot.stops.find(stop => stop.id !== ambiguous.id);
    expect(keep).toBeDefined();
    const publishedAt = new Date(Date.parse(firstPid.preparedAt ?? firstPid.downloadedAt!) + 1000).toISOString();
    const replacementPid = await createPidSnapshot({ ...firstPid, preparedAt: publishedAt,
      quality: { ...firstPid.quality!, reviewGroupIds: [...new Set([...(firstPid.quality?.reviewGroupIds ?? []), ...ambiguous.groupIds])] } });
    await writePublication(replacementPid, dirs.pid);
    await expect(checkGameReleasePid(dirs).then(release => release.releaseId)).rejects.toThrow('Nesoulad PID');
    const second = await refreshGameReleasePid(dirs, now);
    expect(second.review).toEqual(expect.arrayContaining([expect.objectContaining({ id: ambiguous.id })]));
    const secondRelease = await checkGameReleasePid(dirs);
    expect(secondRelease.releaseId).not.toBe(approved.releaseId);
    expect(secondRelease.data.pidSnapshot.stops.some(stop => stop.id === ambiguous.id)).toBe(false);
    expect(await readFile(join(dirs.releases, oldEntry.file), 'utf8')).toBe(canonicalJson(old));
    const approvedEntry = await releaseEntry(approved);
    expect(await readFile(join(dirs.releases, approvedEntry.file), 'utf8')).toBe(canonicalJson(approved));

    releaseDirectory = await assemble();
    worker = localWorker({ persist, releaseDirectory, origin, reference: false });
    expect(await view(room)).toMatchObject({ view: { releaseId: approved.releaseId } });
    expect(await view(await create())).toMatchObject({ reference: false, view: { releaseId: secondRelease.releaseId } });

    const pointer = await readFile(join(dirs.releases, 'current.json'), 'utf8');
    const invalid = await createPidSnapshot({ ...replacementPid, preparedAt: new Date(Date.parse(publishedAt) + 1000).toISOString(),
      quality: { ...replacementPid.quality!, status: 'review' } });
    await writePublication(invalid, dirs.pid);
    await expect(refreshGameReleasePid(dirs, now)).rejects.toThrow('ověřený GTFS snapshot');
    expect(await readFile(join(dirs.releases, 'current.json'), 'utf8')).toBe(pointer);
  } finally {
    await worker?.dispose();
    await rm(root, { recursive: true, force: true });
  }
}, 120_000);
