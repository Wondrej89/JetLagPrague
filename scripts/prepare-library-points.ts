/** Checked evidence is a separate input. Re-running this script never touches
 * worlds, decisions, unrelated POIs or published history. Default: dry run. */
import { readFile, writeFile } from 'node:fs/promises';
import { booleanPointInPolygon } from '@turf/turf';
import { z } from 'zod';
import { agreedLibraryMapPoint, libraryId, poiSchema, unlocatedLibrarySchema, validatePoiConfiguration, withPublishedLibraries, defaultPoiConfiguration, type Poi, type UnlocatedLibrary } from '../packages/geo-core/src/index';
import { canonicalJson, readDefaultGameArea } from '../packages/geo-core/src/index';
import { sha256 } from '../packages/geo-core/src/pid-snapshot';

const catalogPath = 'apps/editor/src/data/poi-catalog.json';
const auditPath = 'data/source-metadata/mkp-libraries-audit.json';
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const previousAudit = JSON.parse(await readFile(auditPath, 'utf8'));
const evidenceText = await readFile('data/source-metadata/mkp-library-points.json', 'utf8');
const checksum = await sha256(evidenceText);
const evidence = z.object({ catalogUrl: z.literal('https://www.mlp.cz/cz/pobocky'), catalogChecksum: z.string().regex(/^[a-f0-9]{64}$/), branches: z.array(z.object({
  id: z.string(), officialUrl: z.url().optional(), officialAddress: z.string().optional(),
  mapLinks: z.array(z.object({ url: z.url(), label: z.enum(['Zobrazit na Mapy.com', 'Zobrazit na Google Maps']) })).optional(),
  detailChecksum: z.string().regex(/^[a-f0-9]{64}$/).optional(), checkedAt: z.iso.datetime().optional(), notices: z.array(z.string()).optional(), error: z.string().optional(),
})) }).parse(JSON.parse(evidenceText));
const candidates: UnlocatedLibrary[] = [...catalog.unlocatedLibraries, ...catalog.libraries.map((poi: Poi) => poi.attributes.originalCandidate)].map(value => unlocatedLibrarySchema.parse(value));
if (candidates.length !== 45 || new Set(candidates.map(row => row.id)).size !== 45 || new Set(evidence.branches.map(row => row.id)).size !== evidence.branches.length) throw new Error('Požadován původní výběr 45 jedinečných poboček a neduplicitní doklady.');
if (evidence.branches.some(row => !candidates.some(candidate => candidate.id === row.id))) throw new Error('Doklad obsahuje pobočku mimo původní výběr.');
// Exactly the original table: no renaming, address substitution or new selection.
if (await sha256(JSON.stringify(candidates.map(row => [row.name, row.address]))) !== previousAudit.selectionChecksum) throw new Error('Změnila se původní tabulka poboček.');
const boundary = await readDefaultGameArea(await readFile('apps/editor/public/defaults/prague-game-area.geojson', 'utf8'));
const libraries: Poi[] = [], unlocated: UnlocatedLibrary[] = [], results = [];
for (const candidate of candidates) {
  const proof = evidence.branches.find(row => row.id === candidate.id);
  const mapUrls = proof?.mapLinks?.map(link => link.url) ?? [];
  const point = agreedLibraryMapPoint(mapUrls);
  let reason: string | null = null;
  try { if (!proof?.officialUrl) throw new Error(); libraryId(proof.officialUrl); } catch { reason = 'Chybí skutečný oficiální detail pobočky.'; }
  if (proof?.error) reason = `Detail nebyl načten: ${proof.error}`;
  else if (!point) reason = 'Chybí jednoznačný mapový bod nebo souřadnice odkazů nesouhlasí.';
  else if (!proof?.checkedAt || !proof.detailChecksum) reason = 'Chybí čas kontroly nebo kontrolní součet detailu.';
  else if (proof.officialAddress !== candidate.address) reason = `Adresa detailu (${proof.officialAddress ?? 'chybí'}) nesouhlasí s původním výběrem.`;
  else if (!booleanPointInPolygon(point, boundary.geometry, { ignoreBoundary: true })) reason = 'Bod neleží uvnitř ověřené administrativní hranice Prahy.';
  else if (proof.notices?.some(notice => /technicky\s+uzavřen|dlouhodob[ěé]\s+uzavřen|uzavřen[^.]*rekonstruk/iu.test(notice))) reason = 'Detail zmiňuje dlouhodobé technické uzavření; nutná revize.';
  if (reason || !proof?.officialUrl || !point || !proof.checkedAt || !proof.detailChecksum) {
    unlocated.push({ ...candidate, officialUrl: proof?.officialUrl ?? null, note: reason ?? 'Neúplný doklad.' });
    results.push({ id: candidate.id, name: candidate.name, status: 'review', reason });
    continue;
  }
  libraries.push(poiSchema.parse({ id: candidate.id, category: 'library', name: candidate.name, address: candidate.address, point, geometry: { type: 'Point', coordinates: point },
    sourceId: candidate.id,
    source: { id: 'mkp-official-branch-points-2026-10-20', provider: 'Městská knihovna v Praze – oficiální detaily poboček', url: evidence.catalogUrl,
      license: candidate.source.license, dataDate: proof.checkedAt.slice(0, 10), retrievedAt: proof.checkedAt, rawChecksum: checksum, verification: 'provider_verified',
      note: 'Referenční bod z výslovných mapových odkazů oficiálního detailu; shoda Mapy.com a Google Maps, přesná shoda adresy a kontrola uvnitř Prahy. Nejde o geodetické měření ani hromadné získávání dat z Mapy.com. Licence katalogu nebyla doložena.' },
    library: { officialUrl: proof.officialUrl, selectionKey: candidate.selectionKey, verification: { point, method: 'official_map_link', checkedAt: proof.checkedAt, url: proof.officialUrl, mapUrls, detailChecksum: proof.detailChecksum, officialAddress: proof.officialAddress } },
    status: 'approved', reviewedAt: proof.checkedAt, note: '', attributes: { originalCandidate: candidate, officialNotices: proof.notices ?? [] },
  }));
  results.push({ id: candidate.id, name: candidate.name, address: candidate.address, officialUrl: proof.officialUrl, point, status: 'approved', reason: null });
}
validatePoiConfiguration(withPublishedLibraries(defaultPoiConfiguration(), libraries, unlocated));
const next = { ...catalog, libraries, unlocatedLibraries: unlocated };
const audit = { ...previousAudit, checkedDate: new Date().toISOString().slice(0, 10), outcome: unlocated.length ? 'partially_verified' : 'verified_official_map_links', failure: null,
  evidenceFile: 'mkp-library-points.json', evidenceChecksum: checksum, boundaryGeometryChecksum: boundary.properties.geometryChecksum,
  officialDetailsVerified: evidence.branches.filter(row => !row.error).length, verifiedLocations: libraries.length, approvedDefaultLibraries: libraries.length,
  verified: results.filter(row => row.status === 'approved'), unresolved: results.filter(row => row.status !== 'approved'),
};
if (process.argv.includes('--write')) {
  await writeFile(catalogPath, JSON.stringify(next, null, 2) + '\n');
  await writeFile(auditPath, JSON.stringify(audit, null, 2) + '\n');
}
console.log(canonicalJson({ mode: process.argv.includes('--write') ? 'write' : 'dry-run', verified: libraries.length, unresolved: audit.unresolved }));
