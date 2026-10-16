import { describe, expect, it } from 'vitest';
import { defaultPidFilters, PID_PREFERENCES_KEY, readPidPreferences, writePidPreferences, type PidPreferences } from './pid-preferences';

describe('PID display preferences, independent of source data and drafts', () => {
  it('round trips hidden visibility, every filter and independent layer switches', () => {
    const values = new Map<string, string>([['unrelated-world', 'unchanged']]);
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const preferences: PidPreferences = { schemaVersion: 1, filters: { ...defaultPidFilters(), visible: false, modes: ['tram', 'metro'], dominant: 'metro', period: 'night', search: 'Anděl', routesVisible: true, routeSearch: 'B', selectedRoute: 'L992', onlySelectedRoute: true, territoryOnly: false }, showCoverage: true, showPlatforms: true, showZone: true };
    writePidPreferences(storage, preferences);
    expect(readPidPreferences(storage)).toEqual({ value: preferences, saved: true, warning: '' });
    expect(values.get('unrelated-world')).toBe('unchanged'); expect(values.size).toBe(2);
  });
  it('handles missing, corrupt and unavailable storage without treating it as a source failure', () => {
    expect(readPidPreferences({ getItem: () => null })).toMatchObject({ saved: false, warning: '', value: { filters: { visible: true } } });
    for (const getItem of [() => '{broken', () => JSON.stringify({ schemaVersion: 99 }), () => { throw new Error('blocked storage'); }]) {
      const restored = readPidPreferences({ getItem }); expect(restored.saved).toBe(false); expect(restored.warning).toContain('Nastavení zobrazení'); expect(restored.value.filters.modes.length).toBeGreaterThan(0);
    }
    expect(() => writePidPreferences({ setItem: () => { throw new Error('quota'); } }, readPidPreferences({ getItem: () => null }).value)).toThrow('quota');
    expect(PID_PREFERENCES_KEY).not.toContain('world');
  });
});
