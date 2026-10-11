export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Chỉ nhận POST' });
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text || text.length > 500) return res.status(400).json({ error: 'Không có gì để đọc.' });

  try {
    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
        voice: 'onyx',
        input: text,
        instructions: 'Đọc bằng tiếng Việt như người dẫn phim tài liệu kịch tính, nghiêm trọng quá mức một cách hài hước.',
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) throw new Error(`OpenAI TTS ${r.status}: ${await r.text()}`);
    res.setHeader('Content-Type', 'audio/mpeg');
    return res.status(200).send(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Giọng đọc đang khàn tiếng, thử lại nhé 🎤' });
  }
}
