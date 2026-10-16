import { resolve } from 'node:path';
import { pragueDate } from '../packages/geo-core/src/index';
import { refreshGtfsPublication } from './gtfs-publication';

const args = process.argv.slice(2);
const option = (name: string) => { const i = args.indexOf(name); if (i < 0) return undefined; if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Chybí hodnota ${name}.`); return args[i + 1]; };
await refreshGtfsPublication({ date: option('--date') ?? (process.env.PID_SERVICE_DATE?.trim() || pragueDate()), output: resolve(option('--output') ?? 'apps/editor/public/pid'), archiveFile: option('--archive'), groupsFile: option('--groups'), force: args.includes('--force') || process.env.PID_FORCE_REFRESH === 'true', reportFile: option('--report') });
