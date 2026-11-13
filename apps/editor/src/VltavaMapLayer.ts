import L from 'leaflet';
import type {AreaGeometry} from '@jetlag/geo-core';
import type {VltavaAssembly,VltavaSource,VltavaPreview} from '../../../packages/geo-core/src/vltava-assembly';
import type {VltavaMode} from './use-vltava';
export interface VltavaMapState {
 source:VltavaSource;draft?:VltavaAssembly;mode:VltavaMode;opacity:number;focusId:string|null;neighbors:string[];
 preview:VltavaPreview|null;showSites:boolean;problems:string[];interactive:boolean;onSelect(id:string):void;
}
export function visibleVltavaRecords(state:VltavaMapState){
 if(state.mode==='result')return [];
 const selected=new Set(state.draft?.selectedIds),extra=new Set(state.neighbors);
 return state.source.records.filter(r=>extra.has(r.globalId)||(state.mode==='all'||state.mode==='candidates'&&r.candidate||state.mode==='related'&&r.related||state.mode==='selected'&&selected.has(r.globalId)));
}
/** Source paths survive selection changes; no operation can edit their vertices. */
export class VltavaMapLayer {
 private sourceGroup=L.layerGroup();private annotations=L.layerGroup();private paths=new Map<string,L.GeoJSON>();private source:VltavaSource|null=null;private state:VltavaMapState|null=null;
 constructor(private map:L.Map){const pane=map.createPane('vltava-assembly');pane.style.zIndex='475';this.sourceGroup.addTo(map);this.annotations.addTo(map);}
 update(state:VltavaMapState|null){
  this.state=state;this.annotations.clearLayers();
  if(!state){this.sourceGroup.clearLayers();this.paths.clear();return;}
  this.map.getPane('vltava-assembly')!.style.pointerEvents=state.interactive?'auto':'none';
  if(this.source!==state.source){this.sourceGroup.clearLayers();this.paths.clear();this.source=state.source;}
  const records=visibleVltavaRecords(state),visible=new Set(records.map(r=>r.globalId)),selected=new Set(state.draft?.selectedIds),excluded=new Set(state.draft?.excludedCandidateIds),neighbors=new Set(state.neighbors),problems=new Set(state.problems);
  for(const [id,layer] of this.paths)if(!visible.has(id)){this.sourceGroup.removeLayer(layer);this.paths.delete(id);}
  for(const record of records){
   const id=record.globalId,included=selected.has(id),candidate=record.candidate&&!excluded.has(id),problem=problems.has(id);
   const color=included?'#1976c9':candidate?'#df8c22':'#78838b';
   const className=`vltava-stream ${included?'included':candidate?'candidate':'other'}${problem?' vltava-problem':''}${neighbors.has(id)?' neighbor':''}`;
   const style:L.PathOptions={color:problem?'#c62c35':neighbors.has(id)?'#7c3db3':color,fillColor:color,weight:problem||state.focusId===id?4:neighbors.has(id)?3:1.5,fillOpacity:state.opacity,opacity:1,className};
   let layer=this.paths.get(id);
   if(!layer){
    layer=L.geoJSON(record.geometry,{pane:'vltava-assembly',pmIgnore:true,snapIgnore:true,style});
    layer.on('click',event=>{L.DomEvent.stopPropagation(event);if(this.state?.interactive)this.state.onSelect(id);});
    const label=document.createElement('span');label.textContent=`T · #${record.row} · ${id}`;layer.bindTooltip(label);
    layer.addTo(this.sourceGroup);this.paths.set(id,layer);
   }else layer.setStyle(style);
   layer.eachLayer(item=>{const element=(item as L.Path).getElement?.();element?.setAttribute('data-vltava-id',id);element?.setAttribute('data-source-row',String(record.row));element?.setAttribute('class',className+' leaflet-interactive');});
  }
  if(state.focusId)this.paths.get(state.focusId)?.bringToFront();
  const draw=(geometry:AreaGeometry,color:string,className:string,fillOpacity=0,weight=2)=>L.geoJSON(geometry,{pane:'vltava-assembly',pmIgnore:true,snapIgnore:true,interactive:false,style:{color,fillColor:color,fillOpacity,weight,className}}).addTo(this.annotations);
  if(state.mode==='result'&&state.preview){
   draw(state.preview.geometry,'#1976c9','vltava-result',state.opacity);
   state.preview.holes.forEach(hole=>draw(hole,'#7c3db3','vltava-hole',0,1));
   if(state.preview.parts.length>1)state.preview.parts.forEach(part=>draw(part,'#c62c35','vltava-component-outline',0,2));
  }
  if(state.showSites)for(const site of state.source.sites){
   const marker=L.circleMarker([site.point[1],site.point[0]],{pane:'vltava-assembly',radius:5,color:'#5f328f',fillColor:'#fff',fillOpacity:1,pmIgnore:true,snapIgnore:true,interactive:false,className:'vltava-site-marker'});
   const label=document.createElement('span');label.textContent=site.name+' · orientační bod parku, nikoli důkaz břehové hranice';marker.bindTooltip(label);marker.addTo(this.annotations);
  }
 }
 remove(){this.sourceGroup.remove();this.annotations.remove();this.paths.clear();}
}
