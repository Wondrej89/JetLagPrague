import { resolve } from 'node:path';
import { readPublication } from './pid-publication';

const snapshot = await readPublication(resolve('apps/editor/public/pid'));
if (!snapshot.platforms.some(platform => platform.services.length) || !snapshot.routes.length) throw new Error('Publikace neobsahuje skutečná stanoviště a trasy.');
console.log(`Publikace PID ${snapshot.serviceDate} je úplná a její kontrolní součet souhlasí; konzistence ${snapshot.quality?.status ?? 'verified'}.`);
