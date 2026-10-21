import type { VercelRequest, VercelResponse } from '@vercel/node';
import { configured, db, guard, json } from './_shared';

// Public diagnostics expose no credentials and never modify data.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guard(req, res, 'GET')) return;
  if (!configured()) {
    return json(res, 503, {
      status: 'not_configured',
      message: 'Server configuration is incomplete. Check Supabase URL, secret key and Telegram bot token in Vercel.',
    });
  }
  try {
    const places = await db('places?select=id&active=eq.true&limit=1') as unknown[];
    await db('reports?select=id&limit=1');
    return json(res, 200, {
      status: 'ready',
      database: 'connected',
      hasActivePlaces: places.length > 0,
      message: places.length > 0 ? 'BOR API is ready.' : 'Database is connected but no active places exist yet.',
    });
  } catch {
    return json(res, 503, {
      status: 'database_error',
      message: 'Unable to query Supabase. Confirm project URL, API key, schema and project availability.',
    });
  }
}
