import type{VercelRequest,VercelResponse}from '@vercel/node';import crypto from 'node:crypto';export const configured=()=>Boolean(process.env.SUPABASE_URL&&(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)&&process.env.TELEGRAM_BOT_TOKEN);export function json(r:VercelResponse,status:number,data:unknown){r.setHeader('Cache-Control','no-store');return r.status(status).json(data)}export async function db(path:string,options:RequestInit={}){const url=process.env.SUPABASE_URL,key=(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);if(!url||!key)throw Error('Database not configured');const r=await fetch(url.replace(/\/$/,'')+'/rest/v1/'+path,{...options,headers:{apikey:key,...(!key.startsWith('sb_secret_')?{Authorization:'Bearer '+key}:{}),'Content-Type':'application/json',...options.headers}});if(!r.ok)throw Error('Database error '+r.status);if(r.status===204||r.status===205||r.headers.get('content-length')==='0')return null;const raw=await r.text();return raw?JSON.parse(raw):null}export function telegramUser(raw:string){const token=process.env.TELEGRAM_BOT_TOKEN;if(!token||!raw||raw.length>8192)return null;try{const p=new URLSearchParams(raw);const hash=p.get('hash');if(!hash||!/^[a-f0-9]{64}$/i.test(hash))return null;p.delete('hash');const when=Number(p.get('auth_date'));const now=Math.floor(Date.now()/1000);if(!Number.isInteger(when)||when>now+60||now-when>86400)return null;const check=[...p].sort(([a],[b])=>a < b ? -1 : a > b ? 1 : 0).map(([k,v])=>k+'='+v).join('\n');const secret=crypto.createHmac('sha256','WebAppData').update(token).digest();const digest=crypto.createHmac('sha256',secret).update(check).digest('hex');if(!crypto.timingSafeEqual(Buffer.from(digest,'hex'),Buffer.from(hash,'hex')))return null;const id=String(JSON.parse(p.get('user')||'null')?.id||'');return /^\d{1,20}$/.test(id)?id:null}catch{return null}}export function guard(req:VercelRequest,res:VercelResponse,method:string){if(req.method!==method){res.setHeader('Allow',method);json(res,405,{error:'Метод не поддерживается'});return false}return true}

const categories=['coffee','workspace','cafe','restaurant'];
export default async function handler(req:VercelRequest,res:VercelResponse){
 if(!guard(req,res,'POST'))return;
 const raw=req.headers['x-telegram-init-data'];
 const user=telegramUser(typeof raw==='string'?raw:'');
 if(!user)return json(res,401,{error:'Открой BOR в Telegram, чтобы предложить заведение.'});
 const origin=req.headers.origin;
 if(origin){try{if(new URL(origin).host!==req.headers.host)return json(res,403,{error:'Недопустимый источник.'})}catch{return json(res,403,{error:'Недопустимый источник.'})}}
 let payload:any;try{payload=typeof req.body==='string'?JSON.parse(req.body):req.body}catch{return json(res,400,{error:'Неверные данные.'})}
 const name=typeof payload?.name==='string'?payload.name.trim():'';
 const district=typeof payload?.district==='string'?payload.district.trim():'';
 const address=typeof payload?.address==='string'?payload.address.trim():'';
 const category=payload?.category;
 if(name.length<2||name.length>120||district.length<2||district.length>80||address.length<5||address.length>240||!categories.includes(category))
  return json(res,400,{error:'Укажи название, район, адрес и категорию.'});
 try{
  const existing=await db('place_suggestions?select=id&user_id=eq.'+user+'&created_at=gte.'+encodeURIComponent(new Date(Date.now()-86400000).toISOString())+'&limit=5');
  if(!Array.isArray(existing))throw new Error('Suggestions lookup returned invalid response');
  if(existing.length>=3)return json(res,429,{error:'Не более трёх предложений за сутки. Попробуй позже.'});
  // Supabase may return an empty body for a successful insert; do not parse it as JSON.
  await db('place_suggestions',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({user_id:user,name,district,address,category})});
  return json(res,201,{ok:true});
 }catch(e){
  const message=e instanceof Error?e.message:'';
  console.error('BOR suggestions failed:',message.replace(/[^a-zA-Z0-9 _-]/g,'').slice(0,120));
  if(message.includes('409'))return json(res,409,{error:'Ты уже предложил это заведение.'});
  if(message.includes('404'))return json(res,503,{error:'Сервис предложений ещё не готов к приёму данных. Повтори позже.',code:'suggestions_not_found'});
  if(message.includes('401')||message.includes('403'))return json(res,503,{error:'Сервер не получил доступ к базе предложений. Сообщи администратору.',code:'db_access'});
  return json(res,503,{error:'Не удалось сохранить предложение. Попробуй ещё раз.',code:'suggestions_save_failed'});
 }
}
