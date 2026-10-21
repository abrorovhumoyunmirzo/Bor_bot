import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

function answer(res: VercelResponse, code: number, body: unknown) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(code).json(body);
}
type AuthResult = { id: string | null; reason: 'ok'|'no_init_data'|'token_missing'|'invalid_hash'|'expired'|'signature_mismatch'|'invalid_user'|'malformed' };
function authenticatedId(raw: string, token: string): AuthResult {
  if (!token) return { id: null, reason: 'token_missing' };
  if (!raw || raw.length > 8192) return { id: null, reason: 'no_init_data' };
  try {
    const data = new URLSearchParams(raw);
    const hash = data.get('hash');
    if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return { id: null, reason: 'invalid_hash' };
    data.delete('hash');
    const now = Math.floor(Date.now() / 1000);
    const authDate = Number(data.get('auth_date'));
    if (!Number.isSafeInteger(authDate) || authDate > now + 60 || now - authDate > 3600)
      return { id: null, reason: 'expired' };
    const check = [...data].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, value]) => key + '=' + value).join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
    const expected = crypto.createHmac('sha256', secret).update(check).digest();
    if (!crypto.timingSafeEqual(expected, Buffer.from(hash, 'hex')))
      return { id: null, reason: 'signature_mismatch' };
    const id = String(JSON.parse(data.get('user') || 'null')?.id || '');
    if (!/^\d{1,20}$/.test(id)) return { id: null, reason: 'invalid_user' };
    return { id, reason: 'ok' };
  } catch { return { id: null, reason: 'malformed' }; }
}

async function database(path: string, init: RequestInit = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Database not configured');
  const response = await fetch(url.replace(/\/$/, '') + '/rest/v1/' + path, {
    ...init,
    headers: {
      apikey: key,
      ...(key.startsWith('sb_secret_') ? {} : { Authorization: 'Bearer ' + key }),
      'Content-Type': 'application/json',
      ...init.headers,
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    const raw=await response.text().catch(()=>'');
    let code='unknown';try{const info=JSON.parse(raw);if(typeof info?.code==='string')code=info.code.slice(0,30)}catch{}
    throw new Error('Database status '+response.status+' code '+code);
  }
  const text=await response.text();return text?JSON.parse(text):null;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function parsePlace(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const district = typeof input.district === 'string' ? input.district.trim() : '';
  const address = typeof input.address === 'string' ? input.address.trim() : '';
  const category = input.category;
  const active = input.active;
  const latitude = input.latitude === null || input.latitude === undefined || input.latitude === '' ? null : input.latitude;
  const longitude = input.longitude === null || input.longitude === undefined || input.longitude === '' ? null : input.longitude;
  const coordinatesValid = (latitude === null && longitude === null) ||
    (typeof latitude === 'number' && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
     typeof longitude === 'number' && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180);

  if (name.length < 2 || name.length > 120 || district.length < 2 || district.length > 80 ||
      address.length < 5 || address.length > 240 || !['coffee', 'workspace', 'cafe', 'restaurant'].includes(String(category)) ||
      typeof active !== 'boolean' || !coordinatesValid) return null;
  return { name, district, address, category, active, latitude, longitude };
}

type OsmVenue={sourceId:string;name:string;district:string;address:string;category:'cafe'|'restaurant';latitude:number;longitude:number};
async function fetchOsmVenues():Promise<OsmVenue[]>{
 // Smaller city-centre query is resilient on serverless plans and public Overpass nodes.
 const query='[out:json][timeout:9];(node["amenity"~"^(restaurant|cafe)$"]["name"](41.275,69.225,41.345,69.325);way["amenity"~"^(restaurant|cafe)$"]["name"](41.275,69.225,41.345,69.325););out center 140;';
 const endpoints=[
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter'
 ];
 // Contact mirrors in parallel: never spend 3 x 8.5 seconds inside a short-lived function.
 // Abort the other requests as soon as one has returned usable data.
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),6800);
 const lookup=async(endpoint:string):Promise<OsmVenue[]>=>{
   const response=await fetch(endpoint,{
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({data:query}).toString(),
      signal:controller.signal
   });
   if(!response.ok)throw Error('OSM_HTTP_'+response.status);
   const data=await response.json() as {elements?:Array<{type:string;id:number;lat?:number;lon?:number;center?:{lat:number;lon:number};tags?:Record<string,string>}>};
   if(!Array.isArray(data.elements))throw Error('OSM_INVALID_RESPONSE');
   const result:OsmVenue[]=[];
   for(const el of data.elements){
      const tags=el.tags||{},latitude=el.lat??el.center?.lat,longitude=el.lon??el.center?.lon;
      const name=(tags['name:ru']||tags.name||'').trim();
      if(name.length<2||name.length>120||typeof latitude!=='number'||typeof longitude!=='number'||!Number.isFinite(latitude)||!Number.isFinite(longitude))continue;
      if(tags.amenity!=='cafe'&&tags.amenity!=='restaurant')continue;
      const street=(tags['addr:street']||'').trim(),house=(tags['addr:housenumber']||'').trim();
      const fullAddress=[street,house].filter(Boolean).join(', ');
      const address=(fullAddress||'Адрес не указан в OpenStreetMap').slice(0,240);
      const district=(tags['addr:suburb']||tags['addr:district']||'Ташкент').trim().slice(0,80);
      result.push({sourceId:el.type+'/'+el.id,name,district:district.length>=2?district:'Ташкент',address,category:tags.amenity,latitude,longitude});
   }
   return result.slice(0,100);
 };
 try{
   const venues=await Promise.any(endpoints.map(lookup));
   return venues;
 }catch{
   throw new Error('OSM_PROVIDER_UNAVAILABLE');
 }finally{
   clearTimeout(timeout);
   controller.abort();
 }
}
function validatedOsmInput(raw:unknown):{accepted:OsmVenue[];rejected:number}|null{
 if(!Array.isArray(raw)||raw.length<1||raw.length>80)return null;
 const accepted:OsmVenue[]=[];
 const seen=new Set<string>();
 let rejected=0;
 for(const item of raw){
  if(!item||typeof item!=='object'){rejected++;continue}
  const p=item as Record<string,unknown>;
  const sourceId=p.sourceId,name=typeof p.name==='string'?p.name.trim():'';
  const district=typeof p.district==='string'?p.district.trim():'';
  const address=typeof p.address==='string'?p.address.trim():'';
  const latitude=p.latitude,longitude=p.longitude;
  // Catalog OSM uses Tashkent bounds 41.18..41.45 / 69.08..69.49.
  // A house number alone is a valid OSM address; do not reject the whole batch.
  if(typeof sourceId!=='string'||!/^(node|way|relation)\/[0-9]{1,15}$/.test(sourceId)||
   seen.has(sourceId)||name.length<2||name.length>120||district.length<2||district.length>80||
   address.length<1||address.length>240||(p.category!=='cafe'&&p.category!=='restaurant')||
   typeof latitude!=='number'||typeof longitude!=='number'||!Number.isFinite(latitude)||!Number.isFinite(longitude)||
   latitude<41.18||latitude>41.45||longitude<69.08||longitude>69.49){rejected++;continue}
  seen.add(sourceId);
  accepted.push({sourceId,name,district,address,category:p.category,latitude,longitude});
 }
 return {accepted,rejected};
}

function geoDistanceMeters(a:{latitude:number;longitude:number},b:{latitude:number;longitude:number}){
 const rad=Math.PI/180,dlat=(a.latitude-b.latitude)*rad,dlon=(a.longitude-b.longitude)*rad;
 const v=Math.sin(dlat/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dlon/2)**2;
 return 12742000*Math.asin(Math.min(1,Math.sqrt(v)));
}
function dedupeOsm(candidates:OsmVenue[],existing:Array<{name:string;latitude:number|null;longitude:number|null;source_id?:string|null;source_type?:string|null}>){
 const accepted:OsmVenue[]=[];
 for(const p of candidates){
  const duplicate=[...existing,...accepted.map(a=>({...a,source_type:'osm',source_id:a.sourceId}))].some(item=>
    (item.source_type==='osm'&&item.source_id===p.sourceId)||
    (item.name.trim().toLocaleLowerCase()===p.name.toLocaleLowerCase()&&item.latitude!==null&&item.longitude!==null&&geoDistanceMeters({latitude:item.latitude,longitude:item.longitude},p)<125)
  );
  if(!duplicate)accepted.push(p);
 }
 return accepted;
}

export const config={maxDuration:60};
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Allow', 'GET, POST, PATCH');
  if (!['GET', 'POST', 'PATCH'].includes(req.method || '')) return answer(res, 405, { error: 'Метод не поддерживается' });
  const raw = req.headers['x-telegram-init-data'];
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  const allowed = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(s => s.trim()).filter(s => /^\d{1,20}$/.test(s));
  const auth = authenticatedId(typeof raw === 'string' ? raw : '', token);
  if (!auth.id) return answer(res, 401, {
    code: auth.reason,
    error: auth.reason === 'signature_mismatch'
      ? 'Telegram передал данные, но сервер не подтвердил подпись. Проверь TELEGRAM_BOT_TOKEN для @bor_city_bot в Vercel.'
      : auth.reason === 'expired'
      ? 'Срок Telegram-авторизации истёк. Полностью закрой Mini App и открой заново.'
      : auth.reason === 'token_missing'
      ? 'Токен Telegram-бота не настроен на сервере.'
      : auth.reason === 'no_init_data'
      ? 'Telegram не передал данные пользователя. Открой BOR через кнопку Mini App в Telegram.'
      : 'Не удалось проверить Telegram-авторизацию (' + auth.reason + ').',
  });
  if (!allowed.includes(auth.id)) return answer(res, 403, { code: 'not_admin', error: 'Твой Telegram ID не включён в ADMIN_TELEGRAM_IDS на Vercel.' });
  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) return answer(res, 403, { error: 'Недопустимый источник.' });
    } catch { return answer(res, 403, { error: 'Недопустимый источник.' }); }
  }
  try {
    if(req.method==='GET'&&req.query.osmPreview==='1'){
      const [osm,existing]=await Promise.all([fetchOsmVenues(),database('places?select=name,latitude,longitude,source_id,source_type&limit=2500')]);
      const options=dedupeOsm(osm,existing||[]);
      return answer(res,200,{options,totalFound:osm.length,duplicates:osm.length-options.length,attribution:'© OpenStreetMap contributors · ODbL',area:'Центральный Ташкент'});
    }
    if (req.method === 'GET') {
      const [page1,page2,suggestions] = await Promise.all([
        database('places?select=id,name,district,address,category,latitude,longitude,active,source_id,created_at&order=id.asc&limit=1000&offset=0'),
        database('places?select=id,name,district,address,category,latitude,longitude,active,source_id,created_at&order=id.asc&limit=1000&offset=1000'),
        database('place_suggestions?select=id,name,district,address,category,status,created_at&status=eq.pending&order=created_at.asc&limit=100'),
      ]);
      return answer(res, 200, { places:[...page1,...page2],suggestions });
    }
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if(req.method==='POST'&&payload?.importAction==='osm'){
      const checked=validatedOsmInput(payload.venues);
      if(!checked)return answer(res,400,{error:'Выбери от 1 до 80 мест из результатов поиска OpenStreetMap.'});
      const selected=checked.accepted;
      if(!selected.length)return answer(res,400,{error:'Выбранные точки не прошли проверку. Выбери другие заведения.'});
      const existing=await database('places?select=name,latitude,longitude,source_id,source_type&limit=2500');
      const verified=dedupeOsm(selected,existing||[]);
      if(!verified.length)return answer(res,200,{ok:true,added:0,skipped:checked.rejected+selected.length});
      // Imported OSM venues have real names and coordinates but *no* fabricated crowd/Wi-Fi status.
      // Keep address uncertainty explicit until the owner or a visitor verifies it.
      const rows=verified.map(p=>({name:p.name,district:p.district,address:p.address,category:p.category,active:true,latitude:p.latitude,longitude:p.longitude,source_type:'osm',source_id:p.sourceId}));
      await database('places',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(rows)});
      return answer(res,201,{ok:true,added:rows.length,skipped:checked.rejected+selected.length-rows.length});
    }
    if(req.method==='PATCH'&&payload?.placeAction){
      const action=payload.placeAction,id=payload.id;
      if((action!=='archive'&&action!=='restore')||typeof id!=='string'||!uuid.test(id))
        return answer(res,400,{error:'Некорректное действие с заведением.'});
      const result=await database('places?id=eq.'+id,{
        method:'PATCH',headers:{Prefer:'return=representation'},
        body:JSON.stringify({active:action==='restore'})
      });
      if(!Array.isArray(result)||!result.length)return answer(res,404,{error:'Заведение не найдено.'});
      // Archive, rather than hard delete: retain reports and allow undo from admin.
      return answer(res,200,{ok:true,active:action==='restore'});
    }
    if(req.method==='PATCH'&&payload?.suggestionAction){
      const action=payload.suggestionAction;
      const suggestionId=payload.suggestionId;
      if(!['approve','reject'].includes(action)||typeof suggestionId!=='string'||!uuid.test(suggestionId))
        return answer(res,400,{error:'Неверное действие.'});
      const rows=await database('place_suggestions?select=id,name,district,address,category,status&id=eq.'+suggestionId+'&limit=1');
      const suggestion=rows?.[0];
      if(!suggestion||suggestion.status!=='pending')return answer(res,409,{error:'Предложение уже рассмотрено.'});
      if(action==='approve'){
        const name=encodeURIComponent(suggestion.name);
        const existing=await database('places?select=id&name=eq.'+name+'&limit=10');
        if(existing?.some((p:any)=>Boolean(p.id))){
          // Require manual review when the name already exists, to avoid duplicates.
          return answer(res,409,{error:'Заведение с таким названием уже есть. Проверь каталог перед добавлением.'});
        }
        await database('places',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({name:suggestion.name,district:suggestion.district,address:suggestion.address,category:suggestion.category,active:true,latitude:null,longitude:null})});
      }
      await database('place_suggestions?id=eq.'+suggestionId+'&status=eq.pending',{
        method:'PATCH',headers:{Prefer:'return=minimal'},
        body:JSON.stringify({status:action==='approve'?'approved':'rejected',reviewed_at:new Date().toISOString()}),
      });
      return answer(res,200,{ok:true});
    }
    const place = parsePlace(payload);
    if (!place) return answer(res, 400, { error: 'Проверь название, район, адрес, категорию, статус и координаты (нужны обе либо ни одной).' });
    if (req.method === 'POST') {
      await database('places', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(place) });
      return answer(res, 201, { ok: true });
    }
    const placeId = payload?.id;
    if (typeof placeId !== 'string' || !uuid.test(placeId)) return answer(res, 400, { error: 'Неверный ID заведения.' });
    await database('places?id=eq.' + placeId, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(place),
    });
    return answer(res, 200, { ok: true });
  } catch (error) {
    const message=error instanceof Error?error.message:'';
    console.error('BOR admin request failed:', error instanceof Error ? error.name : 'unknown');
    if(message==='OSM_PROVIDER_UNAVAILABLE')return answer(res,503,{code:'osm_unavailable',error:'OpenStreetMap сейчас не отвечает. Попробуй через минуту — уже добавленные заведения не затронуты.'});
    const diagnostic=message.match(/Database status (\d{3}) code ([A-Za-z0-9_]+)/);
    if(diagnostic)return answer(res,503,{code:'db_'+diagnostic[1]+'_'+diagnostic[2],error:'Сохранение не прошло проверку базы ('+diagnostic[1]+' / '+diagnostic[2]+').'});
    return answer(res, 503, { code:'admin_database_error',error: 'Не удалось обработать данные. Попробуй позже.' });
  }
}
