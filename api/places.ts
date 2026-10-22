import type{VercelRequest,VercelResponse}from '@vercel/node';import crypto from 'node:crypto';export const configured=()=>Boolean(process.env.SUPABASE_URL&&(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)&&process.env.TELEGRAM_BOT_TOKEN);export function json(r:VercelResponse,status:number,data:unknown){r.setHeader('Cache-Control','no-store');return r.status(status).json(data)}export async function db(path:string,options:RequestInit={}){const url=process.env.SUPABASE_URL,key=(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);if(!url||!key)throw Error('Database not configured');const r=await fetch(url.replace(/\/$/,'')+'/rest/v1/'+path,{...options,headers:{apikey:key,...(!key.startsWith('sb_secret_')?{Authorization:'Bearer '+key}:{}),'Content-Type':'application/json',...options.headers}});if(!r.ok)throw Error('Database error '+r.status);return r.status===204?null:r.json()}export function telegramUser(raw:string){const token=process.env.TELEGRAM_BOT_TOKEN;if(!token||!raw||raw.length>8192)return null;try{const p=new URLSearchParams(raw);const hash=p.get('hash');if(!hash||!/^[a-f0-9]{64}$/i.test(hash))return null;p.delete('hash');p.delete('signature');const when=Number(p.get('auth_date'));const now=Math.floor(Date.now()/1000);if(!Number.isInteger(when)||when>now+60||now-when>86400)return null;const check=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');const secret=crypto.createHmac('sha256','WebAppData').update(token).digest();const digest=crypto.createHmac('sha256',secret).update(check).digest('hex');if(!crypto.timingSafeEqual(Buffer.from(digest,'hex'),Buffer.from(hash,'hex')))return null;const id=String(JSON.parse(p.get('user')||'null')?.id||'');return /^\d{1,20}$/.test(id)?id:null}catch{return null}}export function guard(req:VercelRequest,res:VercelResponse,method:string){if(req.method!==method){res.setHeader('Allow',method);json(res,405,{error:'Метод не поддерживается'});return false}return true}

import type { Place, Crowd, Wifi } from '../src/lib/types';

type RawPlace = { id: string; name: string; district: string; address: string; category: 'coffee' | 'workspace' | 'cafe' | 'restaurant'; latitude: number | null; longitude: number | null; source_id?:string|null };
type Report = { place_id: string; user_id: string; crowd: Crowd; wifi: Wifi; created_at: string };type Confirmation={place_id:string;user_id:string;topic:'wifi'|'crowd';vote:'yes'|'no';created_at:string};
const FRESH_MS = 30 * 60 * 1000;
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guard(req, res, 'GET')) return;
  if (!configured()) return json(res, 503, { error: 'BOR не подключён к Supabase. Проверь настройки Vercel.' });
  try {
    const since = new Date(Date.now() - FRESH_MS).toISOString();
    const [placesFirst,placesSecond, reports, confirmations] = await Promise.all([
      db('places?select=id,name,district,address,category,latitude,longitude,source_id&active=eq.true&order=id.asc&limit=1000&offset=0'),
      db('places?select=id,name,district,address,category,latitude,longitude,source_id&active=eq.true&order=id.asc&limit=1000&offset=1000'),
      db('reports?select=place_id,user_id,crowd,wifi,created_at&created_at=gte.' + encodeURIComponent(since) + '&order=created_at.desc&limit=5000'),
      db('place_confirmations?select=place_id,user_id,topic,vote,created_at&created_at=gte.'+encodeURIComponent(since)+'&order=created_at.desc&limit=2000'),
    ]) as [RawPlace[],RawPlace[], Report[],Confirmation[]];
    const places=placesFirst.concat(placesSecond);
    const byPlace = new Map<string, Map<string, Report>>();
    for (const report of reports) {
      let users = byPlace.get(report.place_id);
      if (!users) { users = new Map<string, Report>(); byPlace.set(report.place_id, users); }
      // Reports arrive newest-first. One vote per unique user in the 30-min window.
      if (!users.has(report.user_id)) users.set(report.user_id, report);
    }
    const latestConfirmations=new Map<string,Confirmation>();
    for(const item of confirmations) {
      const key=item.place_id+'|'+item.topic+'|'+item.user_id;
      if(!latestConfirmations.has(key))latestConfirmations.set(key,item);
    }
    const confirmationsByPlace=new Map<string,{wifiYes:number;wifiNo:number;crowdYes:number;crowdNo:number}>();
    for(const item of latestConfirmations.values()){
      const count=confirmationsByPlace.get(item.place_id)||{wifiYes:0,wifiNo:0,crowdYes:0,crowdNo:0};
      if(item.topic==='wifi'){if(item.vote==='yes')count.wifiYes++;else count.wifiNo++;}
      else {if(item.vote==='yes')count.crowdYes++;else count.crowdNo++;}
      confirmationsByPlace.set(item.place_id,count);
    }
    const result: Place[] = places.map(place => {
      const current = [...(byPlace.get(place.id)?.values() || [])];
      const crowdVotes: Record<Crowd, number> = { quiet: 0, moderate: 0, busy: 0 };
      const wifiVotes: Record<Wifi, number> = { good: 0, slow: 0, bad: 0, unknown: 0 };
      for (const report of current) { crowdVotes[report.crowd]++; wifiVotes[report.wifi]++; }
      const orderedCrowds = (Object.keys(crowdVotes) as Crowd[]).sort((a,b) => crowdVotes[b] - crowdVotes[a]);
      const wifiOptions = (['good','slow','bad'] as Wifi[]).sort((a,b) => wifiVotes[b] - wifiVotes[a]);
      // Trust is about independent people, not repeated reports from the same user.
      // Confirm only unanimous crowd reports from at least two different users.
      const crowdConflict = current.length >= 2 && crowdVotes[orderedCrowds[0]] !== current.length;
      const verified = current.length >= 2 && !crowdConflict;
      const knownWifi = wifiVotes.good + wifiVotes.slow + wifiVotes.bad;
      const wifiConflict = knownWifi > 1 && wifiVotes[wifiOptions[0]] !== knownWifi;
      const wifiVerified = knownWifi >= 2 && !wifiConflict;
      return {
        ...place,
        crowd: current.length && !crowdConflict ? orderedCrowds[0] : null,
        wifi: knownWifi > 0 && !wifiConflict ? wifiOptions[0] : null,
        latestAt: current[0]?.created_at || null,
        reportCount: current.length,
        verified,
        crowdAgreement: current.length && !crowdConflict ? current.length : crowdVotes[orderedCrowds[0]],
        wifiVerified,
        confirmations:confirmationsByPlace.get(place.id)||{wifiYes:0,wifiNo:0,crowdYes:0,crowdNo:0},
        conflict: crowdConflict,
        wifiConflict,
      };
    });
    return json(res, 200, { mode: 'live', places: result });
  } catch (error) {
    console.error('BOR places fetch failed', error instanceof Error ? error.name : 'unknown');
    return json(res, 503, { error: 'Не удалось загрузить заведения. Повтори попытку.' });
  }
}
