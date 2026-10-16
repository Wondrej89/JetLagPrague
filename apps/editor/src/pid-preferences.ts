import { z } from 'zod';
import { transportModes } from '@jetlag/geo-core';
import type { PidFilters } from './pid-types';

export const PID_PREFERENCES_KEY = 'jetlag-praha:pid-preferences:v1';
export const defaultPidFilters = (): PidFilters => ({ visible: true, modes: [...transportModes], dominant: '', period: 'all', search: '', routesVisible: false, routeSearch: '', selectedRoute: '', onlySelectedRoute: false, territoryOnly: false });
const schema = z.object({ schemaVersion: z.literal(1), filters: z.object({
  visible: z.boolean(), modes: z.array(z.enum(transportModes)).transform(values => [...new Set(values)]), dominant: z.union([z.literal(''), z.enum(transportModes)]),
  period: z.enum(['all', 'day', 'night']), search: z.string().max(10000), routesVisible: z.boolean(), routeSearch: z.string().max(10000), selectedRoute: z.string().max(200), onlySelectedRoute: z.boolean(), territoryOnly: z.boolean(),
}), showCoverage: z.boolean(), showPlatforms: z.boolean(), showZone: z.boolean() });
export type PidPreferences = z.infer<typeof schema>;
export function readPidPreferences(storage?: Pick<Storage, 'getItem'>): { value: PidPreferences; saved: boolean; warning: string } {
  const fallback: PidPreferences = { schemaVersion: 1, filters: defaultPidFilters(), showCoverage: false, showPlatforms: false, showZone: false };
  try { const raw = (storage ?? localStorage).getItem(PID_PREFERENCES_KEY); return { value: raw ? schema.parse(JSON.parse(raw)) : fallback, saved: !!raw, warning: '' }; }
  catch { return { value: fallback, saved: false, warning: 'Nastavení zobrazení PID nelze obnovit. Zdrojová data a herní draft zůstávají zachované.' }; }
}
export function writePidPreferences(storage: Pick<Storage, 'setItem'>, preferences: PidPreferences): void {
  storage.setItem(PID_PREFERENCES_KEY, JSON.stringify(schema.parse(preferences)));
}
