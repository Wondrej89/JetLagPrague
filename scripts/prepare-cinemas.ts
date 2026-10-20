/** Bundled defaults only. Draft decisions and immutable releases are separate. */
import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { poiSchema, sha256 } from '../packages/geo-core/src/index';

const path = 'data/raw/cinemas-curated.json', raw = await readFile(path, 'utf8');
const rows = z.array(z.object({ id: z.string().min(1), name: z.string().min(1), address: z.string().min(1), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).strict()).length(26).parse(JSON.parse(raw));
if (new Set(rows.map(row => row.id)).size !== 26) throw new Error('Duplicitní ID kina.');
const at = new Date().toISOString(), rawChecksum = await sha256(raw);
const source = { id: 'cinemas-curated-2026-10-20', provider: 'Ruční výběr na Mapy.com', url: 'https://mapy.com/', license: { name: 'Licence převzatých souřadnic není doložena', url: null }, dataDate: null, retrievedAt: at, rawChecksum, verification: 'user_supplied', note: '26 konkrétních kin vybraných správcem pro lokální hru. Body byly ručně převzaty z Mapy.com; nejde o oficiální dataset, nezávislé geodetické ověření ani hranice budov. Multiplex je jeden objekt bez ohledu na počet sálů.' };
const cinemas = rows.map(row => {
  const point = [row.longitude, row.latitude], review = row.id === 'priemere-citenas-hostivar';
  return poiSchema.parse({ id: row.id, category: 'cinema', name: row.name, address: row.address, point, geometry: { type: 'Point', coordinates: point }, sourceId: row.id, source,
    status: review ? 'review' : 'approved', reviewedAt: review ? null : at,
    note: review ? 'Nutno potvrdit skutečný název a existenci kina. Dodaný název „Priemere Citenas Praha Hostivař“, adresa i souřadnice jsou zachované bez odhadu.' : '',
    attributes: { originalId: row.id, originalName: row.name, originalAddress: row.address, originalPoint: point },
  });
});
if (cinemas.filter(poi => poi.status === 'approved').length !== 25) throw new Error('Výchozí výběr musí mít 25 schválených kin a jednu revizi.');
const catalogPath = 'apps/editor/src/data/poi-catalog.json';
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
await writeFile(catalogPath, JSON.stringify({ ...catalog, cinemas }, null, 2) + '\n');
console.log(JSON.stringify({ cinemas: cinemas.length, approved: 25, review: 'priemere-citenas-hostivar', rawChecksum }));
