import L from 'leaflet';
import type {AreaGeometry} from '@jetlag/geo-core';
import type {VltavaAssembly,VltavaSource,VltavaPreview} from '../../../packages/geo-core/src/vltava-assembly';
import type {LineString} from 'geojson';
import type {LandPreview} from '../../../packages/geo-core/src/river-land';
import type {VltavaMode} from './use-vltava';
export interface VltavaMapState {
 source:VltavaSource;draft?:VltavaAssembly;mode:VltavaMode;opacity:number;focusId:string|null;neighbors:string[];
 highlight:string[];
 land:LandPreview|null;areaId:string|null;lineId:string|null;editingLine:string|null;
 onArea(id:string):void;onLine(id:string):void;
 preview:VltavaPreview|null;showSites:boolean;problems:string[];interactive:boolean;onSelect(id:string):void;
}
export function visibleVltavaRecords(state:VltavaMapState){
 if(state.mode==='result'||state.mode==='land')return [];
 const selected=new Set(state.draft?.selectedIds),extra=new Set([...state.neighbors,...state.highlight]);
 return state.source.records.filter(r=>extra.has(r.globalId)||(state.mode==='all'||state.mode==='candidates'&&r.candidate||state.mode==='related'&&r.related||state.mode==='selected'&&selected.has(r.globalId)));
}
/** Source paths survive selection changes; no operation can edit their vertices. */
export class VltavaMapLayer {
 private sourceGroup=L.layerGroup();private annotations=L.layerGroup();private paths=new Map<string,L.GeoJSON>();private source:VltavaSource|null=null;private state:VltavaMapState|null=null;
 private editable:{id:string;geometry:LineString;layer:L.Polyline}|null=null;
 constructor(private map:L.Map){const pane=map.createPane('vltava-assembly');pane.style.zIndex='475';this.sourceGroup.addTo(map);this.annotations.addTo(map);}
 update(state:VltavaMapState|null){
  this.state=state;this.annotations.clearLayers();
  this.updateEditable(state);
  if(!state){this.sourceGroup.clearLayers();this.paths.clear();return;}
  this.map.getPane('vltava-assembly')!.style.pointerEvents=state.interactive?'auto':'none';
  if(this.source!==state.source){this.sourceGroup.clearLayers();this.paths.clear();this.source=state.source;}
  const records=visibleVltavaRecords(state),visible=new Set(records.map(r=>r.globalId)),selected=new Set(state.draft?.selectedIds),highlight=new Set(state.highlight),neighbors=new Set(state.neighbors),problems=new Set(state.problems);
  for(const [id,layer] of this.paths)if(!visible.has(id)){this.sourceGroup.removeLayer(layer);this.paths.delete(id);}
  for(const record of records){
   const id=record.globalId,included=selected.has(id),fresh=highlight.has(id),problem=problems.has(id);
   const color=included?'#1976c9':'#78838b';
   const className=`vltava-stream ${included?'included':'other'}${problem?' vltava-problem':''}${neighbors.has(id)?' neighbor':''}`;
   const style:L.PathOptions={color:problem?'#c62c35':fresh?'#118763':neighbors.has(id)?'#7c3db3':color,fillColor:color,weight:problem||fresh||state.focusId===id?4:neighbors.has(id)?3:1.5,fillOpacity:state.opacity,opacity:1,className};
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
  if(state.mode==='land'&&state.land){
   state.land.areas.forEach((area,i)=>{
    const color=`hsl(${Math.round(i*137.508)%360} 59% 40%)`;
    const layer=L.geoJSON(area.geometry,{pane:'vltava-assembly',pmIgnore:true,snapIgnore:true,
     interactive:state.interactive&&!state.editingLine,style:{color,fillColor:color,fillOpacity:.42,weight:state.areaId===area.id?4:1.5,className:'river-land-area'}});
    const label=document.createElement('span');label.textContent=state.draft?.landNames?.[area.id]||area.id.slice(0,12);
    layer.bindTooltip(label).on('click',event=>{L.DomEvent.stopPropagation(event);this.state?.onArea(area.id);}).addTo(this.annotations);
    layer.eachLayer(item=>(item as L.Path).getElement()?.setAttribute('data-land-id',area.id));
   });
  }
  for(const line of state.draft?.separations??[]){
   if(line.id===this.editable?.id)continue;
   const invalid=state.land?.problems.some(problem=>problem.id===line.id);
   const layer=L.polyline(line.geometry.coordinates.map(p=>[p[1],p[0]]),{pane:'vltava-assembly',pmIgnore:true,snapIgnore:true,
    interactive:state.interactive&&!state.editingLine,color:invalid?'#c62c35':'#a42174',dashArray:'8 5',weight:state.lineId===line.id?5:3,className:'river-separation'});
   const label=document.createElement('span');label.textContent=line.name||'Oddělovací linie';
   layer.bindTooltip(label).on('click',event=>{L.DomEvent.stopPropagation(event);this.state?.onLine(line.id);}).addTo(this.annotations);
   layer.getElement()?.setAttribute('data-separation-id',line.id);
  }
  this.editable?.layer.bringToFront();
  if(state.showSites)for(const site of state.source.sites){
   const marker=L.circleMarker([site.point[1],site.point[0]],{pane:'vltava-assembly',radius:5,color:'#5f328f',fillColor:'#fff',fillOpacity:1,pmIgnore:true,snapIgnore:true,interactive:false,className:'vltava-site-marker'});
   const label=document.createElement('span');label.textContent=site.name+' · orientační bod parku, nikoli důkaz břehové hranice';marker.bindTooltip(label);marker.addTo(this.annotations);marker.getElement()?.setAttribute('data-river-site',site.id);
  }
 }
 private updateEditable(state:VltavaMapState|null){
  const line=state?.draft?.separations?.find(value=>value.id===state.editingLine);
  if(this.editable&&line?.id===this.editable.id&&line.geometry===this.editable.geometry)return;
  this.editable?.layer.remove();
  this.editable=null;
  if(!line)return;
  const layer=L.polyline(line.geometry.coordinates.map(p=>[p[1],p[0]]),{
   pane:'vltava-assembly',color:'#a42174',dashArray:'8 5',weight:5,className:'river-separation-edit',
  }).addTo(this.map);
  layer.pm.enable({allowSelfIntersection:false,snappable:false});
  this.editable={id:line.id,geometry:line.geometry,layer};
 }
 editedSeparation():LineString|null{
  return this.editable?.layer.toGeoJSON(false).geometry as LineString|undefined ?? null;
 }
 remove(){this.updateEditable(null);this.sourceGroup.remove();this.annotations.remove();this.paths.clear();}
}
