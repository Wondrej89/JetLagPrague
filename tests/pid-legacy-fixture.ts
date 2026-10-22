import type {BrowserContext} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {readPidSnapshot} from '../packages/geo-core/src/index';

// These regression scenarios assert exact Anděl platforms, route IDs, counts
// and union area from this immutable historical dataset. The deployed editor
// can independently receive a newer GTFS publication from the pid-data branch.
export async function useHistoricalPidFixture(context:BrowserContext){
 const file='snapshot-ed2c5e6bde2f69d2.json.gz';
 const bytes=await readFile(new URL('../apps/editor/public/pid/'+file,import.meta.url));
 const snapshot=await readPidSnapshot(JSON.parse(gunzipSync(bytes).toString('utf8')));
 await context.route('**/pid/index.json',route=>route.fulfill({json:{format:'jetlag-praha-pid-catalog',schemaVersion:1,file,checksum:snapshot.checksum}}));
 await context.route(`**/pid/${file}`,route=>route.fulfill({contentType:'application/gzip',body:bytes}));
}
