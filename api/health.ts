import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';export const configured=()=>Boolean(process.env.SUPABASE_URL&&(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)&&process.env.TELEGRAM_BOT_TOKEN);export function json(r:VercelResponse,status:number,data:unknown){r.setHeader('Cache-Control','no-store');return r.status(status).json(data)}export async function db(path:string,options:RequestInit={}){const url=process.env.SUPABASE_URL,key=(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);if(!url||!key)throw Error('Database not configured');const r=await fetch(url.replace(/\/$/,'')+'/rest/v1/'+path,{...options,headers:{apikey:key,...(!key.startsWith('sb_secret_')?{Authorization:'Bearer '+key}:{}),'Content-Type':'application/json',...options.headers}});if(!r.ok)throw Error('Database error '+r.status);return r.status===204?null:r.json()}export function guard(req:VercelRequest,res:VercelResponse,method:string){if(req.method!==method){res.setHeader('Allow',method);json(res,405,{error:'Метод не поддерживается'});return false}return true}


// Public diagnostics expose no credentials and never modify data.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guard(req, res, 'GET')) return;
  if (!configured()) {
    return json(res, 503, {
      status: 'not_configured',
      message: 'Server configuration is incomplete. Check Supabase URL, secret key and Telegram bot token in Vercel.',
    });
  }
  let stage = 'places';
  try {
    const places = await db('places?select=id&active=eq.true&limit=1') as unknown[];
    stage = 'reports';
    await db('reports?select=id&limit=1');
    return json(res, 200, {
      status: 'ready',
      database: 'connected',
      hasActivePlaces: places.length > 0,
      message: places.length > 0 ? 'BOR API is ready.' : 'Database is connected but no active places exist yet.',
    });
  } catch (error) {
    const info = error instanceof Error ? error.message : '';
    const matched = /^Database error (\\d{3})$/.exec(info);
    const upstreamStatus = matched ? Number(matched[1]) : null;
    // Do not expose remote response bodies or any environment variable values.
    console.error('BOR health database failure', { stage, upstreamStatus, kind: upstreamStatus ? 'HTTP' : 'network_or_runtime' });
    return json(res, 503, {
      status: 'database_error',
      stage,
      upstreamStatus,
      hint: upstreamStatus === 401 || upstreamStatus === 403 ? 'Check Supabase secret key and its project.' : upstreamStatus === 404 ? 'Check that SQL schema was run in the correct Supabase project.' : upstreamStatus ? 'Check Supabase API response and database schema.' : 'Check SUPABASE_URL, Supabase availability and Vercel network logs.',
    });
  }
}
