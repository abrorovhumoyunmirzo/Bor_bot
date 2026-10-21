import type { VercelRequest, VercelResponse } from '@vercel/node';
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ status: 'method_not_allowed' });
  }
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return res.status(503).json({ status: 'missing_bot_token' });
  try {
    const response = await fetch('https://api.telegram.org/bot' + token + '/getMe', {
      signal: AbortSignal.timeout(7000),
    });
    const body = await response.json();
    if (!response.ok || body?.ok !== true) {
      return res.status(503).json({
        status: response.status === 401 || response.status === 404 ? 'invalid_bot_token' : 'telegram_api_error',
        telegramStatus: response.status,
      });
    }
    const actualUsername = String(body.result?.username || '').toLowerCase();
    return res.status(200).json({
      status: actualUsername === 'bor_city_bot' ? 'correct_bot' : 'wrong_bot',
      expectedBot: 'bor_city_bot',
      configuredBot: actualUsername,
      note: 'Only the public bot username is returned. The token is never included.',
    });
  } catch {
    return res.status(503).json({ status: 'telegram_unreachable' });
  }
}
