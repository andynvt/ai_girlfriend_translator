import { message } from './preferences.js';

const WINDOW_SECONDS = 600;
const LIMITS = { translate: 20, speak: 30, onboarding: 10 };

// Fixed 10-minute window per IP in Upstash Redis. Fails open so local dev and Redis outages never block users.
export async function rateLimit(req, name) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return true;
  const ip = String(req.headers?.['x-real-ip'] || req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const key = `rl:${name}:${ip}:${Math.floor(Date.now() / (WINDOW_SECONDS * 1000))}`;
  try {
    const r = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCR', key], ['EXPIRE', key, String(WINDOW_SECONDS)]]),
      signal: AbortSignal.timeout(2000),
    });
    if (!r.ok) throw new Error(`Upstash ${r.status}`);
    const [{ result: count }] = await r.json();
    return count <= LIMITS[name];
  } catch (e) {
    console.error(e);
    return true;
  }
}

export const tooMany = language => message(language, 'Bạn hỏi nhanh quá, thử lại sau ít phút nhé.', 'Too many requests. Please try again in a few minutes.');
