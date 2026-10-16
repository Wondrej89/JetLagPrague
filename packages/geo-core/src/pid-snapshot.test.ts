import { describe, it, expect, vi } from 'vitest';
import { comparePidSnapshots, pragueDate, readPidSnapshot, refreshPidSnapshot, snapshotReference, validatePidSnapshot, type PidSnapshot } from './pid-snapshot';
import { testPlatform, testSnapshot } from './pid-test-fixtures';

describe('PID snapshot contract (synthetic fixtures and legacy compatibility)', () => {
  it('uses Prague calendar dates across midnight and both DST transitions', () => {
    expect(pragueDate(new Date('2026-10-14T22:30:00Z'))).toBe('2026-10-15');
    expect(pragueDate(new Date('2026-12-14T23:30:00Z'))).toBe('2026-12-15');
    expect(pragueDate(new Date('2026-03-29T00:59:00Z'))).toBe('2026-03-29');
    expect(pragueDate(new Date('2026-03-29T01:01:00Z'))).toBe('2026-03-29');
    expect(pragueDate(new Date('2026-10-25T01:01:00Z'))).toBe('2026-10-25');
  });
  it('checks immutable version identity and detects modified coordinates', async () => {
    const snapshot = await testSnapshot();
    expect(await readPidSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);
    expect(Object.isFrozen(snapshot.platforms[0].point)).toBe(true);
    expect(snapshotReference(snapshot)).toEqual({ id: snapshot.id, checksum: snapshot.checksum, serviceDate: '2026-10-15', adapterVersion: 'synthetic-test-only' });
    const corrupted = structuredClone(snapshot); corrupted.platforms[0].point[0] += 0.001;
    await expect(readPidSnapshot(corrupted)).rejects.toThrow('Kontrolní součet');
  });
  it('rejects absent parts, invalid coordinates, duplicate ids and dangling group joins', async () => {
    const snapshot = await testSnapshot();
    expect(() => validatePidSnapshot({ ...snapshot, sources: snapshot.sources.slice(1) })).toThrow();
    expect(() => validatePidSnapshot({ ...snapshot, sources: [snapshot.sources[0], snapshot.sources[0], snapshot.sources[2]] })).toThrow('tři různé');
    expect(() => validatePidSnapshot({ ...snapshot, platforms: [snapshot.platforms[0], snapshot.platforms[0]] })).toThrow('Duplicitní');
    expect(() => validatePidSnapshot({ ...snapshot, platforms: [testPlatform('p', 'missing', 'metro')] })).toThrow('neexistující');
    expect(() => validatePidSnapshot({ ...snapshot, platforms: [{ ...snapshot.platforms[0], point: [200, 50] }] })).toThrow();
    expect(() => validatePidSnapshot({ ...snapshot, platforms: [{ ...snapshot.platforms[0], services: [] }] })).toThrow();
  });
  it('uses a verified same-day cache and refreshes explicitly on demand', async () => {
    const snapshot = await testSnapshot();
    const storage = { read: vi.fn(async () => snapshot), write: vi.fn(async () => undefined) };
    const load = vi.fn(async () => snapshot);
    expect((await refreshPidSnapshot(storage, load, { now: new Date('2026-10-15T08:00:00Z') })).refreshed).toBe(false);
    expect(load).not.toHaveBeenCalled();
    expect((await refreshPidSnapshot(storage, load, { now: new Date('2026-10-15T08:00:00Z'), force: true })).refreshed).toBe(true);
    expect(storage.write).toHaveBeenCalledOnce();
  });
  it('keeps the last good snapshot if any mandatory part, download or persistence fails', async () => {
    const previous = await testSnapshot(undefined, { date: '2026-10-14' });
    const storage = { read: async () => previous, write: vi.fn(async () => undefined) };
    for (const load of [async () => { throw new Error('HTTP 503'); }, async () => ({ sources: [] }), async () => previous]) {
      const result = await refreshPidSnapshot(storage, load, { now: new Date('2026-10-15T08:00:00Z') });
      expect(result.snapshot).toEqual(previous); expect(result.stale).toBe(true); expect(result.error).toBeTruthy();
    }
    expect(storage.write).not.toHaveBeenCalled();
    const next = await testSnapshot();
    const result = await refreshPidSnapshot({ ...storage, write: async () => { throw new Error('QuotaExceeded'); } }, async () => next, { now: new Date('2026-10-15T08:00:00Z') });
    expect(result.snapshot).toEqual(previous); expect(result.refreshed).toBe(false);
  });
  it('does not return an unverified corrupt cache as usable data', async () => {
    const snapshot = await testSnapshot();
    const corrupt = { ...snapshot, checksum: 'f'.repeat(64) };
    const result = await refreshPidSnapshot({ read: async () => corrupt, write: async () => undefined }, async () => { throw new Error('offline'); }, { now: new Date('2026-10-15T08:00:00Z') });
    expect(result.snapshot).toBeNull(); expect(result.error).toContain('nelze ověřit');
  });
  it('switches only to a fully verified current-day snapshot', async () => {
    let stored: PidSnapshot = await testSnapshot(undefined, { date: '2026-10-14' });
    const next = await testSnapshot([testPlatform('new-platform', 'new-group', 'bus')]);
    const storage = { read: async () => stored, write: async (snapshot: PidSnapshot) => { stored = snapshot; } };
    const result = await refreshPidSnapshot(storage, async () => next, { now: new Date('2026-10-15T08:00:00Z') });
    expect(result.snapshot).toEqual(next); expect(result.refreshed).toBe(true); expect(stored).toEqual(next);
  });
  it('hashes the normalized model and can read back trimmed source labels', async () => {
    const snapshot = await testSnapshot(undefined, { groups: [{ id: 'g1', name: '  Test station  ' }] });
    expect(snapshot.groups[0].name).toBe('Test station');
    expect(await readPidSnapshot(snapshot)).toEqual(snapshot);
  });
  it('detects a changed lower-priority platform even when the metro center is unchanged', async () => {
    const before = await testSnapshot([testPlatform('m', 'g', 'metro'), testPlatform('b', 'g', 'bus'), testPlatform('gone', 'removed', 'tram')]);
    const next = await testSnapshot([testPlatform('m', 'g', 'metro'), testPlatform('b', 'g', 'bus', [14.45, 50.09]), testPlatform('new', 'added', 'tram')]);
    expect(comparePidSnapshots(before, next)).toEqual({ added: ['added'], changed: ['g'], removed: ['removed'], unchanged: [] });
  });
});
