import { useEffect, useRef, useState } from 'react';
import type { Place } from './lib/types';

declare global { interface Window { L?: any } }
type Position = { latitude: number; longitude: number };
type Props = { places?: Place[]; userLocation?: Position | null; selectedId?: string | null; onSelect?: (id: string) => void; onPick?: (latitude:number,longitude:number)=>void; picked?: Position | null; compact?: boolean };
const center:[number,number]=[41.3111,69.2797]; // default city view, never user's position
export type MarkerStatus='quiet'|'moderate'|'busy'|'conflict'|'unknown';
export function markerStatus(place:Place,now=Date.now()):MarkerStatus{const time=place.latestAt?new Date(place.latestAt).getTime():NaN;if(!Number.isFinite(time)||time>now+60000||now-time>30*60000)return 'unknown';if(place.conflict)return 'conflict';return place.crowd||'unknown'}
const markerColors:Record<MarkerStatus,string>={quiet:'#59c98c',moderate:'#efbf58',busy:'#f17b72',conflict:'#cfa7f4',unknown:'#84968b'};
const valid=(p: {latitude?:number|null;longitude?:number|null})=>typeof p.latitude==='number'&&typeof p.longitude==='number'&&Number.isFinite(p.latitude)&&Number.isFinite(p.longitude);
export function VenueMap({ places=[],userLocation=null,selectedId=null,onSelect,onPick,picked=null,compact=false }: Props) {
 const element=useRef<HTMLDivElement>(null);const mapRef=useRef<any>(null);const layers=useRef<any>(null);const viewportKeyRef=useRef('');const onSelectRef=useRef(onSelect);onSelectRef.current=onSelect;const[interactive,setInteractive]=useState(false);
 useEffect(()=>{
  if(!element.current||!window.L)return;
  const L=window.L;
  const map=L.map(element.current,{zoomControl:false,scrollWheelZoom:false,dragging:false,touchZoom:false,doubleClickZoom:false,boxZoom:false,tap:false}).setView(center,12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19}).addTo(map);

  const layer=L.layerGroup().addTo(map);mapRef.current=map;layers.current=layer;
  const click=(e:any)=>onPick?.(e.latlng.lat,e.latlng.lng);
  map.on('click',click);
  const t=setTimeout(()=>map.invalidateSize(),100);
  return()=>{clearTimeout(t);map.off('click',click);map.remove();mapRef.current=null;layers.current=null};
 },[Boolean(onPick)]);
 useEffect(()=>{const map=mapRef.current;if(!map)return;if(interactive){map.dragging.enable();map.touchZoom.enable();map.doubleClickZoom.enable();map.boxZoom.enable();setTimeout(()=>map.invalidateSize(),0)}else{map.dragging.disable();map.touchZoom.disable();map.doubleClickZoom.disable();map.boxZoom.disable()}},[interactive]);
 useEffect(()=>{
  const map=mapRef.current, L=window.L,layer=layers.current;
  if(!map||!L||!layer)return;
  layer.clearLayers();const bounds:any[]=[];
  for(const place of places){if(!valid(place))continue;
   const pos:[number,number]=[place.latitude!,place.longitude!];bounds.push(pos);
   const selected=selectedId===place.id;
   const status=markerStatus(place);const color=markerColors[status];
   const marker=L.circleMarker(pos,{radius:selected?12:10,color:selected?'#16251b':'#ffffff',weight:selected?4:2,fillColor:color,fillOpacity:1}).addTo(layer);
   marker.bindTooltip(place.name,{direction:'top',offset:[0,-7]});
   marker.on('click',()=>onSelectRef.current?.(place.id));
  }
  if(picked&&valid(picked)){
   const pos:[number,number]=[picked.latitude,picked.longitude];bounds.push(pos);
   L.circleMarker(pos,{radius:11,color:'#18291b',weight:3,fillColor:'#b8ef78',fillOpacity:1}).addTo(layer).bindTooltip('Выбранная точка',{permanent:false,direction:'top'});
  }
  const viewportKey=JSON.stringify({points:bounds,user:userLocation&&valid(userLocation)?userLocation:null,compact});
  const shouldRecenter=viewportKeyRef.current!==viewportKey;
  viewportKeyRef.current=viewportKey;
  if(userLocation&&valid(userLocation)){
   const pos:[number,number]=[userLocation.latitude,userLocation.longitude];
   L.circleMarker(pos,{radius:7,color:'#ffffff',weight:3,fillColor:'#438dfb',fillOpacity:1}).addTo(layer).bindTooltip('Вы здесь');
   if(shouldRecenter){if(!compact)map.setView(pos,13);else if(bounds.length===0)map.setView(pos,14)}
  } else if(bounds.length>0){
   if(shouldRecenter)map.fitBounds(L.latLngBounds(bounds),{padding:[35,35],maxZoom:compact?16:14});
  } else if(shouldRecenter)map.setView(center,12);
 },[places,userLocation,picked,selectedId,compact]);
 return <div className={'venue-map-wrap'+(compact?' venue-map-wrap-compact':'')}>
 <div className={(compact?'venue-map venue-map-compact':'venue-map')+(interactive?' venue-map-active':' venue-map-passive')} ref={element} role="application" aria-label="Карта заведений BOR"/>
 <button type="button" className={'map-gesture-toggle'+(interactive?' map-gesture-on':'')} aria-pressed={interactive} onClick={()=>setInteractive(v=>!v)}>{interactive?'✓ Готово · Листать страницу':onPick?'✥ Выбрать точку на карте':'✥ Двигать карту'}</button>
 {!interactive&&<div className="map-scroll-help" aria-hidden="true">Листай страницу как обычно</div>}
 </div>;
}
