import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

function answer(res: VercelResponse, code: number, body: unknown) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(code).json(body);
}
function authenticatedId(raw: string, token: string): string | null {
  if (!raw || raw.length > 8192 || !token) return null;
  try {
    const data = new URLSearchParams(raw);
    const hash = data.get('hash');
    if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return null;
    data.delete('hash');
    data.delete('signature');
    const now = Math.floor(Date.now() / 1000);
    const authDate = Number(data.get('auth_date'));
    if (!Number.isSafeInteger(authDate) || authDate > now + 60 || now - authDate > 3600) return null;
    const check = [...data].sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => key + '=' + value).join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
    const expected = crypto.createHmac('sha256', secret).update(check).digest();
    if (!crypto.timingSafeEqual(expected, Buffer.from(hash, 'hex'))) return null;
    const id = String(JSON.parse(data.get('user') || 'null')?.id || '');
    return /^\d{1,20}$/.test(id) ? id : null;
  } catch { return null; }
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
  if (!response.ok) throw new Error('Database status ' + response.status);
  return response.status === 204 ? null : response.json();
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
  if (name.length < 2 || name.length > 120 || district.length < 2 || district.length > 80 ||
      address.length < 5 || address.length > 240 || !['coffee', 'workspace'].includes(String(category)) ||
      typeof active !== 'boolean') return null;
  return { name, district, address, category, active };
}
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Allow', 'GET, POST, PATCH');
  if (!['GET', 'POST', 'PATCH'].includes(req.method || '')) return answer(res, 405, { error: 'Метод не поддерживается' });
  const raw = req.headers['x-telegram-init-data'];
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  const allowed = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(s => s.trim()).filter(s => /^\d{1,20}$/.test(s));
  const id = authenticatedId(typeof raw === 'string' ? raw : '', token);
  if (!id) return answer(res, 401, { error: 'Открой админ-панель из Telegram.' });
  if (!allowed.includes(id)) return answer(res, 403, { error: 'У этого аккаунта нет прав администратора.' });
  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) return answer(res, 403, { error: 'Недопустимый источник.' });
    } catch { return answer(res, 403, { error: 'Недопустимый источник.' }); }
  }
  try {
    if (req.method === 'GET') {
      const places = await database('places?select=id,name,district,address,category,active,created_at&order=created_at.desc&limit=300');
      return answer(res, 200, { places });
    }
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const place = parsePlace(payload);
    if (!place) return answer(res, 400, { error: 'Проверь название, район, адрес, категорию и статус.' });
    if (req.method === 'POST') {
      const created = await database('places', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(place) });
      return answer(res, 201, { place: created?.[0] });
    }
    const placeId = payload?.id;
    if (typeof placeId !== 'string' || !uuid.test(placeId)) return answer(res, 400, { error: 'Неверный ID заведения.' });
    const changed = await database('places?id=eq.' + placeId, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(place),
    });
    if (!changed?.length) return answer(res, 404, { error: 'Заведение не найдено.' });
    return answer(res, 200, { place: changed[0] });
  } catch (error) {
    console.error('BOR admin request failed:', error instanceof Error ? error.name : 'unknown');
    return answer(res, 503, { error: 'Ошибка базы данных. Попробуй позже.' });
  }
}
