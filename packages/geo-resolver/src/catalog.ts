import type {Feature, Geometry} from 'geojson';
import type {GameDataRelease} from '../../geo-core/src/index';
export interface GameLayer {id:string;label:string;icon:string;color:string;state:'approved'|'reference'|'missing';note:string;features:Feature<Geometry>[]}
export const CATEGORY_METADATA:Record<string,{label:string;icon:string;color:string}>= {
 pid:{label:'Zastávky PID',icon:'▣',color:'#287c88'},rail:{label:'Železniční stanice',icon:'🚆',color:'#475669'},
 airport:{label:'Letiště',icon:'✈',color:'#386ab2'},zoo:{label:'Zoo',icon:'🐾',color:'#9a6a28'},hospital:{label:'Nemocnice',icon:'✚',color:'#c34453'},
 cinema:{label:'Kina',icon:'▸',color:'#8e4b90'},library:{label:'Knihovny',icon:'▤',color:'#8d663c'},golf:{label:'Golfová hřiště',icon:'⚑',color:'#66883a'},
 aquapark:{label:'Aquaparky',icon:'≋',color:'#278d9b'},park:{label:'Parky',icon:'♣',color:'#3f894c'},waterbody:{label:'Vodní plochy',icon:'≈',color:'#3284b0'},
 vltava:{label:'Vltava',icon:'〰',color:'#315fc3'},municipal:{label:'Městské části',icon:'⬡',color:'#ad713b'},cadastral:{label:'Katastrální území',icon:'▧',color:'#8061a5'},
};
/** Call only with the checksum-verified, pinned public release. The category list
 * includes explicit missing metadata, plus any newly published category. */
export function publishedGameLayers(release:GameDataRelease):GameLayer[] {
 const ids=[...new Set([...Object.keys(CATEGORY_METADATA),...release.data.pois.map(p=>p.category)])];
 return ids.map(id=>{
  const metadata=CATEGORY_METADATA[id]??{label:id,icon:'◆',color:'#596b80'};
  let features:Feature<Geometry>[]=[];
  if(id==='pid'||id==='rail')features=release.data.pidSnapshot.stops.filter(s=>s.eligibility==='allowed'&&(id!=='rail'||s.referenceModes.includes('train'))).map(s=>({type:'Feature',id:s.id,geometry:{type:'Point',coordinates:s.point},properties:{id:s.id,name:s.name,point:s.point,category:metadata.label,source:`PID ${release.data.pidSnapshot.serviceDate}`}}));
  else if(id==='municipal'||id==='cadastral')features=release.data.administrativeAreas.filter(a=>a.kind===id).map(a=>({type:'Feature',id:a.id,geometry:a.geometry,properties:{id:a.id,name:a.name,category:metadata.label,source:release.data.sourceVersions.find(s=>s.key===a.sourceKey)?.provider??a.sourceKey}}));
  else features=release.data.pois.filter(p=>p.category===id&&p.status==='approved').map(p=>({type:'Feature',id:p.id,geometry:p.geometry,properties:{id:p.id,name:p.name,point:p.point,address:p.address??'',category:metadata.label,source:p.source.provider}}));
  const reference=(id==='pid'||id==='rail')&&(release.kind==='reference'||release.data.pidSnapshot.quality!=='verified');
  return {id,...metadata,features,state:!features.length?'missing':reference?'reference':'approved',note:!features.length?'Chybí schválená publikovaná data.':reference?'Historická referenční data – neověřeno.':`Schválený výběr publikace ${release.releaseId.slice(8,20)}; nejde o záruku úplnosti všech míst v Praze.`};
 });
}
