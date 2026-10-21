import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, telegramUser, json, configured } from './places';

export default async function handler(req:VercelRequest,res:VercelResponse){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return json(res,405,{error:'Метод не поддерживается'});}
 if(!configured())return json(res,503,{error:'Аналитика временно недоступна'});
 const raw=req.headers['x-telegram-init-data'];
 const id=telegramUser(typeof raw==='string'?raw:'');
 if(!id)return json(res,401,{error:'Требуется подтверждённый вход через Telegram'});
 const allowed=(process.env.ADMIN_TELEGRAM_IDS||'').split(',').map(x=>x.trim());
 if(allowed.includes(id))return json(res,200,{ok:true,excluded:'admin'});
 const origin=req.headers.origin;
 if(origin){try{if(new URL(origin).host!==req.headers.host)return json(res,403,{error:'Недопустимый источник'})}catch{return json(res,403,{error:'Недопустимый источник'})}}
 const key=process.env.TELEGRAM_BOT_TOKEN||'';
 const visitor_hash=crypto.createHmac('sha256',key).update('bor-analytics-v1:'+id).digest('hex');
 try{
   await db('analytics_visits',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({visitor_hash})});
   return json(res,201,{ok:true});
 }catch(e){
   console.error('BOR analytics event failed',e instanceof Error?e.name:'unknown');
   return json(res,503,{error:'Аналитика временно недоступна'});
 }
}
