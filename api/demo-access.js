import { createHash, timingSafeEqual } from 'node:crypto';
import { demoCommand, demoKey } from '../lib/demo-access.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'GET/POST only' });
  const secret = process.env.DEMO_ADMIN_TOKEN;
  const supplied = req.headers?.authorization || '';
  const hash = value => createHash('sha256').update(value).digest();
  if (!secret || !timingSafeEqual(hash(supplied), hash(`Bearer ${secret}`))) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method === 'POST' && typeof req.body?.public !== 'boolean') return res.status(400).json({ error: 'public must be boolean' });
  try {
    if (req.method === 'POST') {
      const result = await demoCommand(req.body.public ? ['SET', demoKey(), 'open', 'EX', '3600'] : ['DEL', demoKey()]);
      if (req.body.public ? result !== 'OK' : !Number.isInteger(result)) throw new Error('Write failed');
    }
    const isPublic = await demoCommand(['GET', demoKey()]) === 'open';
    return res.status(200).json({ public: isPublic, expiresIn: isPublic ? await demoCommand(['TTL', demoKey()]) : 0 });
  } catch {
    return res.status(503).json({ error: 'Không đọc/ghi được trạng thái demo. Kiểm tra Redis.' });
  }
}
