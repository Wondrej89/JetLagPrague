import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { newWorld, readDefaultGameArea, defaultGameAreaFeature, setGameArea, readAdministrativeSnapshot } from '../packages/geo-core/src/index';
import { buildGameDataRelease, releaseEntry, type GameReleaseIndex } from '../packages/geo-core/src/game-release';
import { canonicalJson } from '../packages/geo-core/src/administrative';
import { readPublication } from './pid-publication';
import { withPublishedZoos, poiSchema, poiConfigurationSchema } from '../packages/geo-core/src/poi';
const directory = process.argv.includes('--pid-directory') ? process.argv[process.argv.indexOf('--pid-directory') + 1] : 'apps/editor/public/pid';
const catalog = JSON.parse(await readFile('apps/editor/src/data/poi-catalog.json', 'utf8'));
const area = await readDefaultGameArea(JSON.parse(await readFile('apps/editor/public/defaults/prague-game-area.geojson', 'utf8')));
const world = setGameArea(newWorld(), defaultGameAreaFeature(area));
world.poi = withPublishedZoos(poiConfigurationSchema.parse(catalog.parks), (catalog.zoos ?? []).map((poi: unknown) => poiSchema.parse(poi)));
const admin = JSON.parse(await readFile('apps/editor/public/administrative/index.json', 'utf8')) as { datasets: { file: string }[] };
for (const entry of admin.datasets) world.layers.push(await readAdministrativeSnapshot(await readFile(`apps/editor/public/administrative/${entry.file}`, 'utf8')));
const snapshot = await readPublication(directory);
const publishedAt = process.env.RELEASE_PUBLISHED_AT ?? new Date().toISOString();
const release = await buildGameDataRelease(world, catalog.airports.map((p: unknown) => poiSchema.parse(p)), snapshot, publishedAt);
const entry = await releaseEntry(release);
await mkdir('data/releases', { recursive: true });
try { await writeFile(`data/releases/${entry.file}`, canonicalJson(release), { flag: 'wx' }); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; throw new Error('Tato neměnná verze již existuje. Nebyla přepsána.'); }
let previous: GameReleaseIndex | null = null;
try { previous = JSON.parse(await readFile('data/releases/current.json', 'utf8')); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
const index: GameReleaseIndex = { format: 'jetlag-prague-game-catalog', schemaVersion: 1, current: entry, versions: [...(previous?.versions ?? []), entry] };
await writeFile('data/releases/current.json', `${JSON.stringify(index, null, 2)}\n`);
console.log(JSON.stringify({ release: release.releaseId, kind: release.kind, parks: release.data.pois.filter(p=>p.category==='park').length, airports: 3, stops: release.data.pidSnapshot.stops.length, pidDate: snapshot.serviceDate }));
