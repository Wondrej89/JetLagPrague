import { classifyArea, containsGamePoint, distanceMeters, matchingPois, measuringPois, nearestApprovedPoi, type GameDataRelease } from '../../geo-core/src/index';
import type { GameEnvironment, Point, QuestionDefinition, QuestionInstance, Resolution } from '../../game-core/src/index';
/** Only a checksum-verified published release is supplied by the release loader.
 * No editor draft/catalog fallback or duplicated distance/POI algorithms. */
export function createGeoResolver(release:GameDataRelease):GameEnvironment {
  function availability(d:QuestionDefinition):{state:QuestionDefinition['availability'];reason:string}{
    if(d.configured===false)return {state:'unsupported',reason:'Work in progress – chybí schválená varianta pravidla a odměna.'};
    if(d.resolver==='manual'||d.resolver==='photo')return {state:'manual',reason:d.testOnly?'Testovací ruční zadání; bez automatického výsledku.':'Ruční vyhodnocení schovaným.'};
    if(d.resolver==='unsupported')return {state:'missing_data',reason:'Chybí publikovaná vrstva nebo ověřený resolver. Nelze automaticky vyhodnotit.'};
    if(d.resolver==='radar')return Number.isFinite(d.radiusMeters)&&d.radiusMeters!>0?{state:'ready',reason:'Geografická vzdálenost v metrech; hranice je zahrnutá.'}:{state:'unsupported',reason:'Chybí poloměr.'};
    if(d.resolver==='thermometer')return d.minMoveMeters!==undefined&&d.configured===true?{state:'ready',reason:'Dvě explicitně uložené polohy; pevný cíl.'}:{state:'unsupported',reason:'Work in progress – chybí původní pravidlo.'};
    if(d.resolver==='same_area')return release.data.administrativeAreas.some(a=>a.kind===d.category)?{state:'ready',reason:'Přesné publikované administrativní hranice.'}:{state:'missing_data',reason:'Chybí publikované administrativní hranice.'};
    if(d.resolver==='tentacles'&&(!d.radiusMeters||!d.configured))return {state:'unsupported',reason:'Work in progress – není schválen dosah a varianta.'};
    return release.data.pois.some(p=>p.category===d.category&&p.status==='approved')?{state:'ready',reason:d.category==='waterbody'?'Vzdálenost k polygonu vodní plochy.':'Vzdálenost k publikovanému referenčnímu bodu.'}:{state:'missing_data',reason:'Katalog neobsahuje schválené objekty této kategorie.'};
  }
  function resolve(q:QuestionInstance):Resolution{
    const d=q.definition,a=q.hunterFix.point,b=q.targetPoint,check=availability(d);
    if(check.state!=='ready')return {state:'unknown',reason:check.reason};
    const base={releaseId:release.releaseId,hunterPoint:a,targetPoint:b};
    if(!containsGamePoint(a,release.data.gameArea.geometry)||!containsGamePoint(b,release.data.gameArea.geometry))return {state:'unknown',reason:'Rozhodná poloha leží mimo herní oblast.'};
    if(d.resolver==='radar'){const distance=distanceMeters(a,b);return {state:'known',answer:distance<=d.radiusMeters!+1e-6?'ANO':'NE',details:{...base,distanceMeters:distance,radiusMeters:d.radiusMeters!}};}
    if(d.resolver==='poi_matching'){
      const result=matchingPois(a,b,d.category,release.data.pois);if(result.state==='unknown')return result;
      return {state:'known',answer:result.matches?'ANO':'NE',details:{...base,hunterPoi:result.first.poi.id,targetPoi:result.second.poi.id,hunterDistance:result.first.distanceMeters,targetDistance:result.second.distanceMeters}};
    }
    if(d.resolver==='poi_measuring'){
      const result=measuringPois(a,b,d.category,release.data.pois);if(result.state==='unknown')return result;
      return {state:'known',answer:result.comparison==='equal'?'STEJNĚ':result.comparison==='second-closer'?'BLÍŽ':'DÁL',details:{...base,hunterPoi:result.first.poi.id,targetPoi:result.second.poi.id,hunterDistance:result.first.distanceMeters,targetDistance:result.second.distanceMeters}};
    }
    if(d.resolver==='same_area'){
      const features=release.data.administrativeAreas.filter(p=>p.kind===d.category).map(p=>({id:p.id,name:p.name,geometry:p.geometry,attributes:{code:p.code},note:'',source:p.sourceKey,importedAt:release.publishedAt,status:'draft' as const}));
      // classifyArea operates on the standard GeoLayer contract; no replacement
      // point-in-polygon or alternative boundary rule.
      const layer:Parameters<typeof classifyArea>[1]={id:d.category,title:d.category,kind:d.category==='municipal'?'municipal':'cadastral',color:'#667788',visible:false,source:release.releaseId,features};
      const first=classifyArea(a,layer),second=classifyArea(b,layer);
      if(!['inside','boundary'].includes(first.status)||!['inside','boundary'].includes(second.status))return {state:'unknown',reason:'Polohu v administrativním území nelze jednoznačně určit (hranice, překryv nebo chybějící data).'};
      return {state:'known',answer:first.matches[0].id===second.matches[0].id?'ANO':'NE',details:{...base,hunterArea:first.matches[0].id,targetArea:second.matches[0].id}};
    }
    if(d.resolver==='thermometer'){
      if(!q.secondFix)return {state:'unknown',reason:'Chybí explicitní druhé měření.'};
      const move=distanceMeters(a,q.secondFix.point);if(move<d.minMoveMeters!)return {state:'unknown',reason:'Nebyla splněna minimální vzdálenost přesunu.'};
      const before=distanceMeters(a,b),after=distanceMeters(q.secondFix.point,b);
      return {state:'known',answer:Math.abs(before-after)<=1e-6?'STEJNĚ':after<before?'TEPLEJI':'CHLADNĚJI',details:{...base,before,after,move,secondPoint:q.secondFix.point}};
    }
    if(d.resolver==='tentacles'){
      // Configurable test variant: target's nearest relevant POI must be in the
      // hunter-defined reach. Not enabled by the default unverified registry.
      const nearest=nearestApprovedPoi(b,d.category,release.data.pois);if(nearest.state==='unknown')return nearest;
      const reach=distanceMeters(a,nearest.poi.point);return {state:'known',answer:reach<=d.radiusMeters!+1e-6?nearest.poi.name:'ŽÁDNÁ V DOSAHU',details:{...base,targetPoi:nearest.poi.id,distanceMeters:reach,radiusMeters:d.radiusMeters!}};
    }
    return {state:'unknown',reason:'Resolver této varianty není implementovaný.'};
  }
  return {namedWaterDistance:(point:Point)=>{const nearest=nearestApprovedPoi(point,'waterbody',release.data.pois.filter(p=>p.name.trim().length>0));return nearest.state==='known'?{state:'known' as const,meters:nearest.distanceMeters}:{state:'unknown' as const,reason:nearest.reason};},releaseId:release.releaseId,stops:release.data.pidSnapshot.stops.filter(p=>p.eligibility==='allowed').map(p=>({id:p.id,name:p.name,point:p.point})),insideArea:(p:Point)=>containsGamePoint(p,release.data.gameArea.geometry),distance:distanceMeters,availability,resolve};
}
