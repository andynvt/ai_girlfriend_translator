import { message } from './preferences.js';

export async function demoCommand(command) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Demo access requires Redis');
  const response = await fetch(url, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command), signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error('Demo access unavailable');
  const data = await response.json();
  if (data.error || !Object.hasOwn(data, 'result')) throw new Error('Invalid demo access response');
  return data.result;
}

export const demoKey = () => process.env.DEMO_ACCESS_KEY || 'thong-dich-tinh-yeu:demo:public';

export async function checkDemoAccess(req, res) {
  // Existing installations remain open until the presenter explicitly configures access control.
  if (!process.env.DEMO_ADMIN_TOKEN) return true;
  const language = req.body?.language === 'en' ? 'en' : 'vi';
  try {
    if (await demoCommand(['GET', demoKey()]) === 'open') return true;
    res.status(403).json({ error: message(language, 'Demo đang đóng. Đợi người trình bày mở lại nhé.', 'The demo is closed. Please wait for the presenter to reopen it.') });
  } catch {
    res.status(503).json({ error: message(language, 'Chưa kiểm tra được quyền truy cập demo. Thử lại sau nhé.', 'Demo access is unavailable. Please try again later.') });
  }
  return false;
}
