import type {Fix,GameRules} from './types';
export interface SharedLocation {
 fix:Fix|null;
 status:'current'|'stale'|'inaccurate'|'invalid'|'unavailable';
 issue:string|null;
}
/** Role-safe current observation, including an explicitly labelled last-known fix.
 * This does not change the GPS eligibility rules used by game mechanics. */
export function sharedLocation(fix:Fix|undefined,now:number,rules:GameRules):SharedLocation {
 if(!fix)return {fix:null,status:'unavailable',issue:'GPS hledačů není dostupná.'};
 if(fix.point.length!==2||!fix.point.every(Number.isFinite)||Math.abs(fix.point[0])>180||Math.abs(fix.point[1])>90||!Number.isFinite(fix.at)||fix.at<0||fix.at>now||!Number.isFinite(fix.accuracy)||fix.accuracy<0)return {fix:null,status:'invalid',issue:'Poloha hledačů má neplatné GPS údaje.'};
 const copy:Fix={point:[...fix.point],at:fix.at,accuracy:fix.accuracy};
 if(now-fix.at>rules.gpsMaxAgeMs)return {fix:copy,status:'stale',issue:'Neaktuální GPS hledačů – zobrazena poslední známá poloha.'};
 if(fix.accuracy>rules.gpsMaxAccuracyM)return {fix:copy,status:'inaccurate',issue:'GPS hledačů je nepřesná.'};
 return {fix:copy,status:'current',issue:null};
}
