import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { prepareDefaultGameArea, readAdministrativeSnapshot } from '../packages/geo-core/src/index';

const layer = await readAdministrativeSnapshot(await readFile('apps/editor/public/administrative/municipal.json', 'utf8'));
const boundary = await prepareDefaultGameArea(layer);
await mkdir('apps/editor/public/defaults', { recursive: true });
await writeFile('apps/editor/public/defaults/prague-game-area.geojson', `${JSON.stringify(boundary)}\n`);
console.log(`Předpočítána výchozí Praha ze všech 57 částí: ${boundary.geometry.type}, SHA-256 ${boundary.properties.checksum}.`);
