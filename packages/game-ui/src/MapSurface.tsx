import {useEffect,useRef} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {makeMetricCircle,type AreaGeometry} from '../../geo-core/src/index';
import type {Point,Role} from '../../game-core/src/index';
export interface StaticBasemap {zoom:number;bounds:L.LatLngBoundsExpression;tiles:ReadonlyMap<string,string>}
class AtlasLayer extends L.GridLayer {
 constructor(private atlas:StaticBasemap){super({bounds:atlas.bounds,minNativeZoom:atlas.zoom,maxNativeZoom:atlas.zoom,maxZoom:20,noWrap:true,attribution:'<a href="https://api.mapy.com/copyright">© Seznam.cz a.s. a další</a>'});}
 createTile(coords:L.Coords){const image=document.createElement('img');image.alt='';const url=this.atlas.tiles.get(`${coords.z}/${coords.x}/${coords.y}`);if(url)image.src=url;return image;}
}
export interface MapMarker {id:string;label:string;point:Point;role:Role|'station';draggable?:boolean;onMove?(point:Point):void;onSelect?():void}
export function MapSurface({markers,apiKey='',basemap,area,circle,center,onClick,label='Herní mapa'}:{markers:MapMarker[];apiKey?:string;basemap?:StaticBasemap;area?:AreaGeometry;circle?:Point|null;center?:Point;onClick?(point:Point):void;label?:string}){
 const container=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),items=useRef(new Map<string,L.Marker>()),dragging=useRef(new Set<string>()),latest=useRef({markers,onClick});latest.current={markers,onClick};
 useEffect(()=>{if(!container.current)return;const instance=L.map(container.current,{zoomControl:true}).setView([50.08,14.43],12);map.current=instance;L.control.scale({imperial:false}).addTo(instance);instance.on('click',(e:L.LeafletMouseEvent)=>latest.current.onClick?.([e.latlng.lng,e.latlng.lat]));
  const fit=new L.Control({position:'topright'});fit.onAdd=()=>{const button=L.DomUtil.create('button','play-fit-control');button.type='button';button.textContent='Zobrazit polohy';L.DomEvent.disableClickPropagation(button);button.onclick=()=>{const points=latest.current.markers.map(p=>L.latLng(p.point[1],p.point[0]));if(points.length)instance.fitBounds(L.latLngBounds(points),{padding:[28,28],maxZoom:15,animate:false});};return button;};fit.addTo(instance);
  const markerItems=items.current;const resize=new ResizeObserver(()=>instance.invalidateSize());resize.observe(container.current);return()=>{resize.disconnect();markerItems.clear();instance.remove();map.current=null;};
 },[]);
 useEffect(()=>{
  if(!map.current||(!basemap&&!apiKey.trim()))return;
  const attribution='<a href="https://api.mapy.com/copyright">© Seznam.cz a.s. a další</a>';
  // Sandbox maps render only local blob tiles from a fixed public atlas. Their
  // camera, fit controls, marker drags and zoom never initiate remote requests.
  let tile:L.GridLayer;
  if(basemap)tile=new AtlasLayer(basemap);
  else tile=L.tileLayer(`https://api.mapy.com/v1/maptiles/basic/256/{z}/{x}/{y}?apikey=${encodeURIComponent(apiKey.trim())}`,{maxZoom:20,attribution});
  tile.addTo(map.current);
  const logo=new L.Control({position:'bottomleft'});logo.onAdd=()=>{const el=L.DomUtil.create('a','play-map-logo');el.href='https://mapy.com/';el.target='_blank';el.rel='noreferrer';el.innerHTML='<img src="https://api.mapy.com/img/api/logo.svg" width="72" height="23" alt="Mapy.com"/>';L.DomEvent.disableClickPropagation(el);return el;};logo.addTo(map.current);
  return()=>{tile.remove();logo.remove();};
 },[apiKey,basemap]);
 useEffect(()=>{const m=map.current;if(!m)return;for(const [id,marker]of items.current)if(!markers.some(p=>p.id===id)){marker.remove();items.current.delete(id);}for(const value of markers){const existing=items.current.get(value.id);if(existing){if(!dragging.current.has(value.id))existing.setLatLng([value.point[1],value.point[0]]);continue;}
  const marker=L.marker([value.point[1],value.point[0]],{draggable:value.draggable,title:value.label,icon:L.divIcon({className:`play-pin ${value.role}`,html:value.role==='station'?'◉':value.role==='hunter'?'H':'S',iconSize:[32,38],iconAnchor:[16,38]})}).addTo(m);marker.bindTooltip(value.label);marker.on('click',()=>latest.current.markers.find(v=>v.id===value.id)?.onSelect?.());marker.on('dragstart',()=>dragging.current.add(value.id));marker.on('dragend',()=>{dragging.current.delete(value.id);const p=marker.getLatLng();latest.current.markers.find(v=>v.id===value.id)?.onMove?.([p.lng,p.lat]);});items.current.set(value.id,marker);}
 },[markers]);
 const circleKey=circle?.join(',')??'';useEffect(()=>{if(!map.current||!circleKey)return;const p=circleKey.split(',').map(Number) as Point;const layer=L.geoJSON(makeMetricCircle(p,400),{style:{color:'#7554aa',weight:2,fillOpacity:.08},interactive:false}).addTo(map.current);return()=>{layer.remove();};},[circleKey]);
 useEffect(()=>{if(!map.current||!area)return;const layer=L.geoJSON(area,{style:{color:'#ac7d33',weight:1,fillOpacity:0},interactive:false}).addTo(map.current);return()=>{layer.remove();};},[area]);
 const centerKey=center?.join(',')??'';useEffect(()=>{if(centerKey&&map.current){const [lng,lat]=centerKey.split(',').map(Number);map.current.setView([lat,lng],14,{animate:false});}},[centerKey]);
 return <div className="play-map-wrap"><div ref={container} className="play-map" aria-label={label}/>{!apiKey&&!basemap&&<span className="play-map-note">Podklad vyžaduje klientský klíč Mapy.com. Geometrie a špendlíky zůstávají použitelné.</span>}</div>;
}
