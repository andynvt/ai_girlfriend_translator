import { message, parseLanguage } from '../lib/preferences.js';
import { rateLimit, tooMany } from '../lib/rate-limit.js';

export default async function handler(req, res) {
  let language;
  try { language = parseLanguage(req.body?.language); } catch (e) { return res.status(400).json({ error: e.message }); }
  if (req.method !== 'POST') return res.status(405).json({ error: message(language, 'Chỉ nhận POST', 'POST only') });
  if (!(await rateLimit(req, 'speak'))) return res.status(429).json({ error: tooMany(language) });
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text || text.length > 500) return res.status(400).json({ error: message(language, 'Không có gì để đọc.', 'Enter up to 500 characters to read.') });
  const direction = req.body?.direction ?? 'gf';
  if (direction !== 'gf' && direction !== 'bf') return res.status(400).json({ error: message(language, 'Chọn bạn gái hoặc bạn trai để đọc.', 'Choose girlfriend or boyfriend.') });

  try {
    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
        voice: direction === 'bf' ? 'onyx' : 'shimmer',
        input: text,
        instructions: `Đọc bằng ${language === 'en' ? 'tiếng Anh (English)' : 'tiếng Việt'} với giọng ${direction === 'bf' ? 'nam' : 'nữ'}, kịch tính và hài hước nhẹ nhàng. Thể hiện cảm xúc phù hợp với nội dung: vui thì tươi sáng, buồn thì dịu và chậm, dỗi thì hờn nhẹ, căng thẳng thì nhấn giọng. Thay đổi ngữ điệu, nhấn từ quan trọng và ngắt nhịp tự nhiên; tránh đọc đều đều hoặc mặc định mọi câu đều giận dữ. Chỉ đọc nguyên văn nội dung, không thêm lời hay đọc chỉ dẫn cảm xúc.`,
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) throw new Error(`OpenAI TTS ${r.status}: ${await r.text()}`);
    res.setHeader('Content-Type', 'audio/mpeg');
    return res.status(200).send(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: message(language, 'Giọng đọc đang khàn tiếng, thử lại nhé 🎤', 'Voice is unavailable. Please try again 🎤') });
  }
}
