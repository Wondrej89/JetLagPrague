import { classifyArea, containsGamePoint, distanceMeters, distanceToPoiMeters, matchingPois, measuringPois, nearestApprovedPoi, type GameDataRelease } from '../../geo-core/src/index';
import { GEOGRAPHIC_EPSILON_METERS, THERMOMETER_TOLERANCE_METERS, type GameEnvironment, type Point, type QuestionDefinition, type QuestionInstance, type Resolution } from '../../game-core/src/index';
/** Only a checksum-verified published release is supplied by the release loader.
 * No editor draft/catalog fallback or duplicated distance/POI algorithms. */
export function createGeoResolver(release:GameDataRelease):GameEnvironment {
  // Actual boundary vertices witness a possible displacement. No boxes replace
  // the area or containment tests. This conservative sample may omit a feasible
  // extreme variant, but never enables one longer than a witnessed span.
  const geometry=release.data.gameArea.geometry;
  const vertices=(geometry.type==='Polygon'?geometry.coordinates:geometry.coordinates.flat()).flat() as Point[];
  const extremes=Array.from({length:16},(_,i)=>{const angle=i*Math.PI/8;return vertices.reduce((best,p)=>p[0]*Math.cos(angle)+p[1]*Math.sin(angle)>best[0]*Math.cos(angle)+best[1]*Math.sin(angle)?p:best,vertices[0]);});
  const maxMovementMeters=Math.max(...extremes.flatMap(a=>extremes.map(b=>distanceMeters(a,b))));
  function availability(d:QuestionDefinition):{state:QuestionDefinition['availability'];reason:string}{
    if(d.configured===false)return {state:'unsupported',reason:'Work in progress – chybí schválená varianta pravidla a odměna.'};
    if(d.resolver==='manual'||d.resolver==='photo')return {state:'manual',reason:d.testOnly?'Testovací ruční zadání; bez automatického výsledku.':'Ruční vyhodnocení schovaným.'};
    if(d.resolver==='unsupported')return {state:'missing_data',reason:'Chybí publikovaná vrstva nebo ověřený resolver. Nelze automaticky vyhodnotit.'};
    if(d.resolver==='radar')return Number.isFinite(d.radiusMeters)&&d.radiusMeters!>0?{state:'ready',reason:'Geografická vzdálenost v metrech; hranice je zahrnutá.'}:{state:'unsupported',reason:'Chybí poloměr.'};
    if(d.resolver==='thermometer')return Number.isFinite(d.minMoveMeters)&&d.minMoveMeters!>0&&d.configured===true&&d.minMoveMeters!<=maxMovementMeters?{state:'ready',reason:`Dva GPS snapshoty, pevné stanoviště; nerozhodnost ±${d.toleranceMeters??THERMOMETER_TOLERANCE_METERS} m.`}:{state:'unsupported',reason:'Minimální přesun není nastaven nebo přesahuje ověřený rozměr herní oblasti.'};
    if(d.resolver==='same_area')return release.data.administrativeAreas.some(a=>a.kind===d.category)?{state:'ready',reason:'Přesné publikované administrativní hranice.'}:{state:'missing_data',reason:'Chybí publikované administrativní hranice.'};
    if(d.resolver==='tentacles'&&(!d.radiusMeters||!d.configured))return {state:'unsupported',reason:'Work in progress – není schválen dosah a varianta.'};
    if(d.resolver==='tentacles'&&d.category==='metro_line')return {state:'missing_data',reason:'Chybí publikovaná liniová geometrie metra; zastávky ji nenahrazují.'};
    return release.data.pois.some(p=>p.category===d.category&&p.status==='approved')?{state:'ready',reason:d.resolver==='tentacles'?'Schválené publikované POI; u polygonů vzdálenost ke skutečné ploše.':d.category==='waterbody'||d.distanceMode==='geometry'?'Vzdálenost k publikované geometrii (Point nebo plocha polygonu).':'Vzdálenost k publikovanému referenčnímu bodu.'}:{state:'missing_data',reason:'Katalog neobsahuje schválené objekty této kategorie.'};
  }
  function resolve(q:QuestionInstance):Resolution{
    const d=q.definition,a=q.hunterFix.point,b=q.targetPoint,check=availability(d);
    if(check.state!=='ready')return {state:'unknown',reason:check.reason};
    const base={releaseId:release.releaseId,hunterPoint:a,targetPoint:b};
    if(!containsGamePoint(a,release.data.gameArea.geometry)||!containsGamePoint(b,release.data.gameArea.geometry))return {state:'unknown',reason:'Rozhodná poloha leží mimo herní oblast.'};
    if(d.resolver==='radar'){const distance=distanceMeters(a,b);return {state:'known',answer:distance<=d.radiusMeters!+1e-6?'ANO':'NE',details:{...base,distanceMeters:distance,radiusMeters:d.radiusMeters!}};}
    if(d.resolver==='poi_matching'){
      const result=matchingPois(a,b,d.category,release.data.pois,d.distanceMode);if(result.state==='unknown')return result;
      return {state:'known',answer:result.matches?'ANO':'NE',details:{...base,hunterPoi:result.first.poi.id,targetPoi:result.second.poi.id,hunterDistance:result.first.distanceMeters,targetDistance:result.second.distanceMeters}};
    }
    if(d.resolver==='poi_measuring'){
      const result=measuringPois(a,b,d.category,release.data.pois,d.distanceMode);if(result.state==='unknown')return result;
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
      if(!containsGamePoint(q.secondFix.point,release.data.gameArea.geometry))return {state:'unknown',reason:'Druhé měření leží mimo herní oblast.'};
      const move=distanceMeters(a,q.secondFix.point);if(move+GEOGRAPHIC_EPSILON_METERS<d.minMoveMeters!)return {state:'unknown',reason:'Nebyla splněna minimální vzdálenost přesunu.'};
      const before=distanceMeters(a,b),after=distanceMeters(q.secondFix.point,b),details={...base,before,after,move,secondPoint:q.secondFix.point};
      if(d.spatialVersion===2&&Math.abs(before-after)<=(d.toleranceMeters??THERMOMETER_TOLERANCE_METERS))return {state:'unknown',code:'thermometer_tie',reason:'Nerozhodné měření v toleranci. Hráči se musí výslovně dohodnout na ruční odpovědi nebo otázku zrušit kartou Veto.',details};
      return {state:'known',answer:d.spatialVersion!==2&&Math.abs(before-after)<=1e-6?'STEJNĚ':after<before?'TEPLEJI':'CHLADNĚJI',details};
    }
    if(d.resolver==='tentacles'){
      if(d.spatialVersion!==2){ // Pinned historical test variants retain their meaning.
        const nearest=nearestApprovedPoi(b,d.category,release.data.pois);if(nearest.state==='unknown')return nearest;
        const reach=distanceMeters(a,nearest.poi.point);return {state:'known',answer:reach<=d.radiusMeters!+1e-6?nearest.poi.name:'ŽÁDNÁ V DOSAHU',details:{...base,targetPoi:nearest.poi.id,distanceMeters:reach,radiusMeters:d.radiusMeters!}};
      }
      const approved=release.data.pois.filter(p=>p.category===d.category&&p.status==='approved');
      const measured=approved.map(poi=>({poi,distance:distanceToPoiMeters(a,poi,'geometry')}));
      if(measured.some(p=>!Number.isFinite(p.distance)))return {state:'unknown',reason:'Chybí spolehlivá geometrie kandidáta.'};
      const candidates=measured.filter(p=>p.distance<=d.radiusMeters!+GEOGRAPHIC_EPSILON_METERS).map(p=>p.poi);
      const details={...base,radiusMeters:d.radiusMeters!,candidateCount:candidates.length,candidateIds:candidates.map(p=>p.id).sort().join(',')};
      if(!candidates.length)return {state:'known',answer:'NEJSEM V DOSAHU',details};
      const nearest=nearestApprovedPoi(b,d.category,candidates,'geometry');if(nearest.state==='unknown')return nearest;
      const hunterDistance=measured.find(p=>p.poi.id===nearest.poi.id)!.distance;
      const resultDetails={...details,targetPoi:nearest.poi.id,targetDistance:nearest.distanceMeters,hunterDistance};
      return nearest.distanceMeters>d.radiusMeters!+GEOGRAPHIC_EPSILON_METERS?{state:'known',answer:'NEJSEM V DOSAHU',details:resultDetails}:{state:'known',answer:nearest.poi.name,publicPoi:{id:nearest.poi.id,name:nearest.poi.name,point:[...nearest.poi.point]},details:resultDetails};
    }
    return {state:'unknown',reason:'Resolver této varianty není implementovaný.'};
  }
  return {namedWaterDistance:(point:Point)=>{const nearest=nearestApprovedPoi(point,'waterbody',release.data.pois.filter(p=>p.name.trim().length>0));return nearest.state==='known'?{state:'known' as const,meters:nearest.distanceMeters}:{state:'unknown' as const,reason:nearest.reason};},maxMovementMeters,releaseId:release.releaseId,stops:release.data.pidSnapshot.stops.filter(p=>p.eligibility==='allowed').map(p=>({id:p.id,name:p.name,point:p.point})),insideArea:(p:Point)=>containsGamePoint(p,release.data.gameArea.geometry),distance:distanceMeters,availability,resolve};
}
