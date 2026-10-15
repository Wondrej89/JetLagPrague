import { resolve } from 'node:path';
import { adaptPidSources, pragueDate } from '../packages/geo-core/src/index';
import { readPidInput } from './pid-input';
import { writePublication } from './pid-publication';

const directory = resolve(process.argv[2] ?? 'data/raw/pid');
const output = resolve(process.argv[3] ?? 'apps/editor/public/pid');
const names = { active: 'Zastavky_WGS84.json', groups: 'stops.json', routes: 'Linky_7d_WGS84.json' };
const inputs = await Promise.all(Object.entries(names).map(async ([key, name]) => {
  const input = await readPidInput(directory, name);
  return [key, { text: JSON.stringify(input.json), sha256: input.sha256, version: `sha256:${input.sha256}` }] as const;
}));
const snapshot = await adaptPidSources({ ...Object.fromEntries(inputs), downloadedAt: null } as Parameters<typeof adaptPidSources>[0]);
if (process.argv.includes('--require-current') && (snapshot.serviceDate !== pragueDate() || snapshot.quality?.status !== 'verified')) throw new Error(`Nový denní snapshot nebyl přijat: datum ${snapshot.serviceDate}, konzistence ${snapshot.quality?.status}. ${snapshot.quality?.issues.join(' ')}`);
await writePublication(snapshot, output);
for (const issue of snapshot.quality?.issues ?? []) console.warn(issue);
