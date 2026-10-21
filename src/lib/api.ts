import type { Response, Crowd, Wifi } from './types';
import { telegram } from './telegram';

export async function loadPlaces(signal?: AbortSignal): Promise<Response> {
  let response: globalThis.Response;
  try {
    response = await fetch('/api/places', { signal, cache: 'no-store' });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('Не удалось связаться с сервером BOR. Проверь подключение к интернету.');
  }
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || 'Сервис временно недоступен. Повтори попытку.');
  }
  if (!result || result.mode !== 'live' || !Array.isArray(result.places)) {
    throw new Error('Реальная база данных пока не подключена.');
  }
  return result as Response;
}

export async function sendReport(placeId: string, crowd: Crowd, wifi: Wifi) {
  const initData = telegram()?.initData;
  if (!initData) throw new Error('Открой BOR через Telegram, чтобы публиковать наблюдения.');
  const response = await fetch('/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initData },
    body: JSON.stringify({ placeId, crowd, wifi }),
  });
  const result = await response.json().catch(() => ({ error: 'Ошибка ответа сервера' }));
  if (!response.ok) throw new Error(result.error || 'Не удалось отправить наблюдение.');
  return result;
}
