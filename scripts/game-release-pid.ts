import { link, mkdir, mkdtemp, readFile, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { canonicalJson } from '../packages/geo-core/src/administrative';
import {
  compileReleaseStops, containsGamePoint, createGameDataRelease, gamePublicationErrors, readGameReleaseArtifact,
  readGameReleaseIndex, releaseEntry, releasePidSources, type GameDataRelease,
} from '../packages/geo-core/src/game-release';
import { buildGameStops, type GameStop } from '../packages/geo-core/src/game-stops';
import { pragueDate, snapshotReference, type PidSnapshot } from '../packages/geo-core/src/pid-snapshot';
import { readPublication, readPublicationByChecksum } from './pid-publication';

interface Directories {
  pid: string;
  releases: string;
}
interface RefreshReport {
  serviceDate: string;
  pid?: { serviceDate: string; checksum: string; quality: string; reviewGroups: number };
  previousReleaseId?: string;
  releaseId?: string;
  approval?: GameDataRelease['kind'];
  changed?: boolean;
  publishedStops?: number;
  review?: { id: string; groupIds: string[]; name: string; insideGameArea: boolean | null; reasons: string[] }[];
  blocking: string[];
}

async function readCurrent(directory: string) {
  const index = readGameReleaseIndex(JSON.parse(await readFile(join(directory, 'current.json'), 'utf8')));
  const release = await readGameReleaseArtifact(await readFile(join(directory, index.current.file), 'utf8'), index.current);
  return { index, release };
}

function checkAlignment(pid: PidSnapshot, release: GameDataRelease) {
  const game = release.data.pidSnapshot;
  if (pid.serviceDate !== game.serviceDate || pid.checksum !== game.checksum ||
      pid.id !== game.id || pid.adapterVersion !== game.adapterVersion) {
    throw new Error(`Nesoulad PID: větev pid-data má ${pid.serviceDate} (${pid.checksum.slice(0, 12)}), herní katalog má ${game.serviceDate} (${game.checksum.slice(0, 12)}). Spusťte „Update PID and game catalog“.`);
  }
  if (pid.quality?.status !== 'verified' || pid.quality.unmappedActiveIds.length) {
    throw new Error('Centrální PID nemá ověřenou kvalitu nebo obsahuje nepřiřazená aktivní stanoviště.');
  }
  const issues = gamePublicationErrors(release, pid.serviceDate);
  if (issues.length) throw new Error(issues.join(' '));
}

export async function checkGameReleasePid(directories: Directories) {
  const { release } = await readCurrent(directories.releases);
  checkAlignment(await readPublication(directories.pid), release);
  return release;
}

function compile(snapshot: PidSnapshot, previous: GameDataRelease) {
  return buildGameStops(snapshot, {
    schemaVersion: 1, allowedModes: previous.data.rulesConfig.allowedModes,
    radiusMeters: previous.data.rulesConfig.radiusMeters, nodes: [], overrides: [],
  }, snapshot.serviceDate);
}

function reviewStops(stops: GameStop[], snapshot: PidSnapshot, release: GameDataRelease): NonNullable<RefreshReport['review']> {
  const flaggedGroups = new Set(snapshot.quality?.reviewGroupIds);
  return stops.filter(stop => stop.eligibility === 'review' &&
    (stop.activity !== 'inactive' || stop.groupIds.some(id => flaggedGroups.has(id)))).map(stop => ({
    id: stop.id, groupIds: stop.groupIds, name: stop.name,
    insideGameArea: stop.point ? containsGamePoint(stop.point, release.data.gameArea.geometry) : null,
    reasons: stop.reasons,
  }));
}

export async function refreshGameReleasePid(directories: Directories, now = new Date(), reportFile?: string) {
  const serviceDate = pragueDate(now);
  const report: RefreshReport = { serviceDate, blocking: [] };
  const { pid, releases } = directories;
  const lock = join(releases, '.pid-refresh.lock');
  let ownsLock = false;
  try {
    await mkdir(lock);
    ownsLock = true;
    const { index, release: previous } = await readCurrent(releases);
    report.previousReleaseId = previous.releaseId;
    const snapshot = await readPublication(pid);
    report.pid = { serviceDate: snapshot.serviceDate, checksum: snapshot.checksum,
      quality: snapshot.quality?.status ?? 'unknown', reviewGroups: snapshot.quality?.reviewGroupIds?.length ?? 0 };
    if (snapshot.serviceDate !== serviceDate) throw new Error(`Aktualizace vyžaduje ověřený PID pro dnešní pražský den ${serviceDate}. Datová větev má ${snapshot.serviceDate}.`);
    if (snapshot.schemaVersion !== 2 || snapshot.quality?.status !== 'verified' || snapshot.quality.unmappedActiveIds.length) {
      throw new Error('Aktualizace vyžaduje ověřený GTFS snapshot bez nepřiřazených aktivních stanovišť.');
    }
    const compiled = compile(snapshot, previous);
    report.review = reviewStops(compiled, snapshot, previous);
    if (previous.kind === 'approved' && previous.data.pidSnapshot.checksum === snapshot.checksum) {
      checkAlignment(snapshot, previous);
      report.releaseId = previous.releaseId;
      report.approval = previous.kind;
      report.publishedStops = previous.data.pidSnapshot.stops.length;
      report.changed = false;
      return report;
    }

    // The release stores effective stops but does not serialize manual overrides.
    // Prove that the standard compiler reproduces the published selection before reusing its policy.
    const oldPid = await readPublicationByChecksum(pid, previous.data.pidSnapshot.checksum);
    if (!oldPid) throw new Error('Původní snapshot podle checksumu chybí v historii pid-data. Nelze ověřit pravidla stanovišť.');
    const geometry = previous.data.gameArea.geometry;
    const baseline = compileReleaseStops(compile(oldPid, previous), geometry, true);
    if (canonicalJson(baseline) !== canonicalJson(previous.data.pidSnapshot.stops)) {
      throw new Error('Výchozí pravidla nereprodukují zveřejněná stanoviště. Je nutné doložit původní ruční pravidla a výjimky.');
    }
    const stops = compileReleaseStops(compiled, geometry, true);
    report.publishedStops = stops.length;
    const previousSources = previous.data.sourceVersions.filter(source => !source.key.startsWith('pid:'));
    const release = await createGameDataRelease({ ...previous.data,
      pidSnapshot: { ...snapshotReference(snapshot), quality: 'verified', stops },
      sourceVersions: [...previousSources, ...releasePidSources(snapshot)],
    }, { publishedAt: now.toISOString(), kind: 'approved', schemaVersion: previous.schemaVersion });
    checkAlignment(snapshot, release);
    for (const key of ['gameArea', 'administrativeAreas', 'pois', 'rulesConfig', 'river', 'land', 'riverArea', 'landAreas'] as const) {
      if (release.checksums[key] !== previous.checksums[key]) throw new Error(`Aktualizace změnila geografii nebo pravidla: ${key}.`);
    }
    if (canonicalJson(release.data.sourceVersions.filter(source => !source.key.startsWith('pid:'))) !== canonicalJson(previousSources)) {
      throw new Error('Aktualizace změnila metadata geografických zdrojů.');
    }

    const existing = index.versions.find(entry => entry.releaseId === release.releaseId);
    const entry = existing ?? await releaseEntry(release);
    const next = readGameReleaseIndex({ ...index, current: entry, versions: existing ? index.versions : [...index.versions, entry] });
    for (const historical of index.versions) {
      if (historical.releaseId !== previous.releaseId) {
        await readGameReleaseArtifact(await readFile(join(releases, historical.file), 'utf8'), historical);
      }
    }
    const staging = await mkdtemp(join(releases, '.pid-release-'));
    try {
      if (!existing) {
        const temporary = join(staging, entry.file);
        const body = canonicalJson(release);
        await writeFile(temporary, body);
        try {
          // Install only a complete immutable artifact and never overwrite an existing body.
          await link(temporary, join(releases, entry.file));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
          // An interrupted run may have installed the body before publishing its pointer.
          const orphan = await readFile(join(releases, entry.file), 'utf8');
          const orphanEntry = await releaseEntry(JSON.parse(orphan));
          await readGameReleaseArtifact(orphan, orphanEntry);
          if (orphanEntry.releaseId !== entry.releaseId) throw new Error('Kolize neměnného herního vydání.');
          next.current = orphanEntry;
          next.versions[next.versions.length - 1] = orphanEntry;
        }
      }
      const pointer = join(staging, 'current.json');
      await writeFile(pointer, `${JSON.stringify(readGameReleaseIndex(next), null, 2)}\n`);
      await rename(pointer, join(releases, 'current.json'));
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
    report.releaseId = release.releaseId;
    report.approval = release.kind;
    report.changed = true;
    return report;
  } catch (error) {
    report.blocking.push(error instanceof Error && (error as NodeJS.ErrnoException).code === 'EEXIST' && !ownsLock
      ? 'Jiná aktualizace herního katalogu již běží.' : (error as Error).message);
    throw new Error(report.blocking[0], { cause: error });
  } finally {
    if (ownsLock) await rmdir(lock);
    if (reportFile) {
      await mkdir(dirname(reportFile), { recursive: true });
      await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const [mode, pid, releases = 'data/releases', report = 'data/reports/game-release-pid.json'] = process.argv.slice(2);
  if (!pid || !['check', 'refresh'].includes(mode)) throw new Error('Použití: game-release-pid.ts check|refresh adresář-pid [adresář-vydání] [audit.json].');
  if (mode === 'check') {
    const release = await checkGameReleasePid({ pid, releases });
    console.log(`PID ${release.data.pidSnapshot.serviceDate} odpovídá schválenému vydání ${release.releaseId}.`);
  } else {
    const { review, ...result } = await refreshGameReleasePid({ pid, releases }, new Date(), report);
    console.log(JSON.stringify({ ...result, review: review?.length }));
  }
}
