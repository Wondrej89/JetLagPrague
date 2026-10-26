import type {Fix,RoleView} from '../../game-core/src/index';
import {distanceMeters} from '../../geo-core/src/index';

function usable(fix:Fix|null|undefined,now:number):fix is Fix {return !!fix&&fix.point.length===2&&fix.point.every(Number.isFinite)&&Math.abs(fix.point[0])<=180&&Math.abs(fix.point[1])<=90&&Number.isFinite(fix.at)&&fix.at>=0&&fix.at<=now&&Number.isFinite(fix.accuracy)&&fix.accuracy>=0;}
export function showHunterLocation(view:RoleView|undefined){return view?.role==='hider'&&view.phase==='seeking'&&view.connected!==false;}
/** Use only the role-filtered observations. A station is never a substitute for own GPS. */
export function hunterDistance(view:RoleView){
 if(!showHunterLocation(view))return null;
 const location=view.hunterLocation,fix=location?.fix,own=view.ownFix;
 if(!usable(fix,view.now)||location?.status==='invalid'||location?.status==='unavailable')return {status:location?.status??'unavailable',meters:null,issue:location?.issue??'GPS hledačů není dostupná.',hunterAt:null,ownAt:null};
 if(!usable(own,view.now)||view.gpsIssue)return {status:'own_unavailable' as const,meters:null,issue:view.gpsIssue??'Moje GPS není dostupná.',hunterAt:location!.status!=='current'?fix.at:null,ownAt:usable(own,view.now)?own.at:null};
 return {status:location!.status,meters:distanceMeters(own.point,fix.point),issue:location!.issue,hunterAt:location!.status!=='current'?fix.at:null,ownAt:null};
}
function ObservedAt({at,label}:{at:number;label:string}){return <span>{label} <time dateTime={new Date(at).toISOString()}>{new Date(at).toLocaleString('cs-CZ')}</time></span>;}
export function HunterDistance({view}:{view:RoleView}){
 const info=hunterDistance(view);if(!info)return null;
 return <section className="hunter-distance" aria-label="Vzdálenost hledačů" data-location-status={info.status}>
  <span className="hunter-distance-label">{info.meters===null?'Vzdálenost hledačů není dostupná':info.status==='stale'?`Hledači naposledy ${Math.round(info.meters).toLocaleString('cs-CZ')} m daleko`:info.status==='inaccurate'?`Hledači přibližně ${Math.round(info.meters).toLocaleString('cs-CZ')} m daleko`:`Hledači jsou ${Math.round(info.meters).toLocaleString('cs-CZ')} m daleko`}</span>
  {info.meters===null&&info.issue&&<small>{info.issue}</small>}
  {info.hunterAt!==null&&<small>{info.status==='inaccurate'?'Nepřesná GPS · ':''}<ObservedAt at={info.hunterAt} label="Poslední poloha hledačů:"/></small>}
  {info.ownAt!==null&&<small><ObservedAt at={info.ownAt} label="Moje poslední GPS:"/></small>}
 </section>;
}
