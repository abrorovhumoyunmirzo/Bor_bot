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
 const element=useRef<HTMLDivElement>(null);const mapRef=useRef<any>(null);const layers=useRef<any>(null);const renderRef=useRef<()=>void>(()=>{});const viewportKeyRef=useRef('');const onSelectRef=useRef(onSelect);onSelectRef.current=onSelect;const[interactive,setInteractive]=useState(false);
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
  const map=mapRef.current,L=window.L,layer=layers.current;
  if(!map||!L||!layer)return;
  const points=places.filter(p=>valid(p)&&Math.abs(p.latitude!)<=90&&Math.abs(p.longitude!)<=180);
  const bounds=points.map(p=>[p.latitude!,p.longitude!]);
  // Group markers into 62px screen cells at the current zoom. No extra map library needed.
  // The admin point picker never clusters or interferes with choosing exact coordinates.
  const render=()=>{
   if(!mapRef.current)return;
   layer.clearLayers();
   const zoom=map.getZoom(), buckets=new Map<string,Place[]>();
   for(const place of points){
    const projected=map.project([place.latitude!,place.longitude!],zoom);
    const key=onPick?'single-'+place.id:Math.floor(projected.x/62)+':'+Math.floor(projected.y/62);
    const items=buckets.get(key);
    if(items)items.push(place);else buckets.set(key,[place]);
   }
   for(const items of buckets.values()){
    if(items.length===1){
     const place=items[0],pos:[number,number]=[place.latitude!,place.longitude!];
     const selected=selectedId===place.id,color=markerColors[markerStatus(place)];
     const marker=L.circleMarker(pos,{radius:selected?12:10,color:selected?'#16251b':'#ffffff',weight:selected?4:2,fillColor:color,fillOpacity:1}).addTo(layer);
     marker.bindTooltip(place.name,{direction:'top',offset:[0,-7]});
     marker.on('click',()=>onSelectRef.current?.(place.id));
    }else{
     const centerLat=items.reduce((sum,p)=>sum+p.latitude!,0)/items.length;
     const centerLon=items.reduce((sum,p)=>sum+p.longitude!,0)/items.length;
     const size=items.length>15?48:42;
     const marker=L.marker([centerLat,centerLon],{icon:L.divIcon({className:'bor-cluster-icon',html:'<span class="bor-cluster-count">'+items.length+'</span>',iconSize:[size,size],iconAnchor:[size/2,size/2]})}).addTo(layer);
     marker.bindTooltip(items.length+' заведений · Нажми, чтобы приблизить',{direction:'top'});
     marker.on('click',()=>{
      if(map.getZoom()<18){
       const next=Math.min(18,map.getZoom()+2);
       map.setView([centerLat,centerLon],next,{animate:true});
      }else{
       // Identical coordinates cannot be separated by zoom: offer a safe text-only chooser.
       const container=document.createElement('div');
       container.className='bor-cluster-picker';
       items.slice(0,40).forEach(place=>{
        const btn=document.createElement('button');
        btn.type='button';btn.textContent=place.name;
        btn.addEventListener('click',()=>{onSelectRef.current?.(place.id);map.closePopup()});
        container.appendChild(btn);
       });
       L.popup({minWidth:170,maxHeight:220}).setLatLng([centerLat,centerLon]).setContent(container).openOn(map);
      }
     });
    }
   }
   if(picked&&valid(picked)){
    L.circleMarker([picked.latitude,picked.longitude],{radius:11,color:'#18291b',weight:3,fillColor:'#b8ef78',fillOpacity:1}).addTo(layer).bindTooltip('Выбранная точка');
   }
   if(userLocation&&valid(userLocation)){
    L.circleMarker([userLocation.latitude,userLocation.longitude],{radius:7,color:'#fff',weight:3,fillColor:'#438dfb',fillOpacity:1}).addTo(layer).bindTooltip('Вы здесь');
   }
  };
  renderRef.current=render;
  map.on('zoomend',render);render();
  const viewportKey=JSON.stringify({points:bounds,user:userLocation&&valid(userLocation)?userLocation:null,compact});
  const shouldRecenter=viewportKeyRef.current!==viewportKey;
  viewportKeyRef.current=viewportKey;
  if(shouldRecenter){
   if(userLocation&&valid(userLocation)){
    if(!compact)map.setView([userLocation.latitude,userLocation.longitude],13);
    else if(!bounds.length)map.setView([userLocation.latitude,userLocation.longitude],14);
   }else if(bounds.length)map.fitBounds(L.latLngBounds(bounds),{padding:[35,35],maxZoom:compact?16:14});
   else map.setView(center,12);
  }
  return()=>{map.off('zoomend',render);if(renderRef.current===render)renderRef.current=()=>{}};
 },[places,userLocation,picked,selectedId,compact,Boolean(onPick)]);

 return <div className={'venue-map-wrap'+(compact?' venue-map-wrap-compact':'')}>
 <div className={(compact?'venue-map venue-map-compact':'venue-map')+(interactive?' venue-map-active':' venue-map-passive')} ref={element} role="application" aria-label="Карта заведений BOR"/>
 {!compact&&<div className="bor-map-zoom" aria-label="Масштаб карты"><button type="button" aria-label="Приблизить карту" onClick={()=>mapRef.current?.zoomIn()}>+</button><button type="button" aria-label="Отдалить карту" onClick={()=>mapRef.current?.zoomOut()}>−</button></div>}
 <button type="button" className={'map-gesture-toggle'+(interactive?' map-gesture-on':'')} aria-pressed={interactive} onClick={()=>setInteractive(v=>!v)}>{interactive?'✓ Готово · Листать страницу':onPick?'✥ Выбрать точку на карте':'✥ Двигать карту'}</button>
 {!interactive&&<div className="map-scroll-help" aria-hidden="true">Листай страницу как обычно</div>}
 </div>;
}
