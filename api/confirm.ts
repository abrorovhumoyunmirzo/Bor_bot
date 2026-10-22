import type { VercelRequest,VercelResponse } from '@vercel/node';
import { configured,db,json,telegramUser } from './reports';

type Vote={placeId?:unknown;topic?:unknown;vote?:unknown};
export default async function handler(req:VercelRequest,res:VercelResponse){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return json(res,405,{error:'Метод не поддерживается'});}
 if(!configured())return json(res,503,{error:'Сервис пока недоступен'});
 const init=req.headers['x-telegram-init-data'];
 const user=telegramUser(typeof init==='string'?init:'');
 if(!user)return json(res,401,{error:'Открой BOR через Telegram, чтобы подтвердить данные.'});
 const origin=req.headers.origin;
 if(origin){try{if(new URL(origin).host!==req.headers.host)return json(res,403,{error:'Недопустимый источник'})}catch{return json(res,403,{error:'Недопустимый источник'})}}
 let input:Vote={};try{input=(typeof req.body==='string'?JSON.parse(req.body):req.body)||{}}catch{return json(res,400,{error:'Неверный запрос'})}
 const {placeId,topic,vote}=input;
 if(typeof placeId!=='string'||!/^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(placeId)||(topic!=='wifi'&&topic!=='crowd')||(vote!=='yes'&&vote!=='no'))
 return json(res,400,{error:'Неверное подтверждение'});
 try{
  const places=await db('places?select=id&id=eq.'+placeId+'&active=eq.true&limit=1');
  if(!Array.isArray(places)||!places.length)return json(res,404,{error:'Заведение не найдено'});
  const since=new Date(Date.now()-30*60000).toISOString();
  const recent=await db('reports?select=crowd,wifi,created_at&place_id=eq.'+placeId+'&created_at=gte.'+encodeURIComponent(since)+'&order=created_at.desc&limit=1');
  if(!recent?.length||(topic==='wifi'&&recent[0].wifi==='unknown'))return json(res,409,{error:'Нет свежих данных для подтверждения'});
  const latest=await db('place_confirmations?select=created_at&place_id=eq.'+placeId+'&user_id=eq.'+user+'&topic=eq.'+topic+'&order=created_at.desc&limit=1');
  if(latest?.length&&Date.now()-new Date(latest[0].created_at).getTime()<15*60000)
   return json(res,429,{error:'Ты уже отвечал недавно. Повтори через 15 минут.'});
  await db('place_confirmations',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({place_id:placeId,user_id:user,topic,vote})});
  return json(res,201,{ok:true});
 }catch(e){console.error('BOR confirmation failed',e instanceof Error?e.name:'unknown');return json(res,503,{error:'Не удалось сохранить подтверждение'})}
}
