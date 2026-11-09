import type {Point as PointGeometry} from 'geojson';
import type {GameDataRelease} from '../../geo-core/src/game-release';
import {wgs84PointSchema} from '../../geo-core/src/pid-model';

export interface RailStation {
 id:string; name:string; category:'rail'; status:'approved';
 point:[number,number]; geometry:PointGeometry;
}

/** Derived view of a verified, pinned release, never a second stored catalog.
 * Published stops already aggregate platforms/routes and preserve group IDs.
 * Hiding eligibility is deliberately irrelevant here. A train reference mode
 * is required so that a bus/metro-only reference cannot stand in for a railway.
 * A historical verified snapshot remains usable in the simulator; the existing
 * publication gate continues to prohibit using it as current live-game data. */
export function publishedRailCatalog(release:GameDataRelease):{stations:RailStation[];reason:string} {
 const snapshot=release.data.pidSnapshot;
 if(snapshot.quality!=='verified')return {stations:[],reason:'PID snapshot nemá ověřenou konzistenci; železniční stanice nelze spolehlivě určit.'};
 const stations:RailStation[]=snapshot.stops.filter(s=>s.activity==='active'&&s.modes.includes('train')&&s.referenceModes.includes('train')&&wgs84PointSchema.safeParse(s.point).success)
  .map(s=>({id:s.id,name:s.name,category:'rail',status:'approved',point:[...s.point],geometry:{type:'Point',coordinates:[...s.point]}}));
 return {stations,reason:!stations.length?'Publikovaný PID snapshot neobsahuje aktivní železniční stanice s platným železničním referenčním bodem.':`${stations.length} železničních stanic · PID ${snapshot.serviceDate}. Vzdušná vzdálenost k referenčním bodům.${release.kind==='reference'?' Historická referenční data – neověřeno. Pouze pro místní simulaci.':''}`};
}
