import type { VercelRequest,VercelResponse } from '@vercel/node';
import {db,telegramUser,json,guard} from './reports';
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
