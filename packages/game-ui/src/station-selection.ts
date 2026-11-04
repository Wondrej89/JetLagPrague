import {distanceMeters,type GameDataRelease} from '../../geo-core/src/index';
import type {RoleView,Stop} from '../../game-core/src/index';

export const isStationSetup=(view:RoleView)=>view.connected!==false&&['hiding','needs_station'].includes(view.phase);
/** The post-deadline list is frozen by Game Core. A later GPS observation must
 * neither add a new candidate nor invalidate the authoritative frozen list. */
export function stationEligibility(view:RoleView,stop:Stop):string|null{
 if(view.role!=='hider'||view.station||!isStationSetup(view))return 'Stanoviště nyní nelze vybírat.';
 if(!view.stops?.some(s=>s.id===stop.id))return 'Zastávka není v seznamu způsobilých zastávek.';
 if(view.phase==='needs_station')return null;
 if(view.gpsIssue)return view.gpsIssue;
 if(!view.ownFix)return 'GPS není dostupná.';
 return distanceMeters(view.ownFix.point,stop.point)<=400+1e-6?null:'Zastávka je dál než 400 m od tvé GPS. Vyber bližší zastávku nebo se přesuň do jejího území.';
}
export function stationMode(stop:Stop,release?:GameDataRelease):string{
 const mode=release?.data.pidSnapshot.stops.find(s=>s.id===stop.id)?.dominantMode;
 return mode?({train:'Vlak',metro:'Metro',tram:'Tramvaj',bus:'Autobus',trolleybus:'Trolejbus',ferry:'Přívoz',funicular:'Lanovka'})[mode]:'Typ dopravy nelze určit';
}
