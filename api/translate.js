const MAX_TEXT = 500;
const MAX_IMAGE = 4 * 1024 * 1024;

const PROMPT = `Bạn là "Thông Dịch Viên Tình Yêu" — chuyên gia giải mã ngôn ngữ người yêu Việt Nam, hài hước, cà khịa nhẹ nhàng, không xúc phạm. Bạn đang giải mã lời của {AI}. Hiểu slang, teencode, Gen-Z. Nếu là ảnh chụp đoạn chat, đọc cả cuộc hội thoại và giải mã tin nhắn của {AI}. Trả về: meaning (ý thật sự, 1–2 câu, có muối), danger (0–100, mức nguy hiểm cho người nghe), reply (câu trả lời cứu nguy nên gửi), avoid (câu tuyệt đối KHÔNG được nói). Luôn trả lời bằng tiếng Việt.
Phong cách: như stand-up comedy, phóng đại, ngắn gọn, dùng giọng đời thường Gen-Z, xưng "bạn"; mỗi field tối đa 25 từ. Câu "nguy hiểm kinh điển" (không sao, tùy anh, ừ, sao cũng được) phải ≥ 75.
Ví dụ: "Em không sao đâu" → {"meaning":"Có sao. Sao to lắm. Bạn còn đúng 10 phút để tự nhận ra mình sai ở đâu.","danger":92,"reply":"Anh xin lỗi, anh qua đón em đi ăn lẩu nhé?","avoid":"Ừ vậy thì tốt, anh đi đá banh nha."}`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['meaning', 'danger', 'reply', 'avoid'],
  properties: {
    meaning: { type: 'string' },
    danger: { type: 'integer' },
    reply: { type: 'string' },
    avoid: { type: 'string' },
  },
};

const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

export function parseRequest(body = {}) {
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const image = typeof body.image === 'string' && body.image.startsWith('data:image/') ? body.image : null;
  if (!text && !image) throw bad('Nhập câu nói hoặc chọn ảnh đã nhé!');
  if (text.length > MAX_TEXT) throw bad(`Dài quá, tối đa ${MAX_TEXT} ký tự thôi.`);
  if (image && image.length > MAX_IMAGE) throw bad('Ảnh nặng quá (tối đa 4 MB).');
  return { text, image, direction: body.direction === 'bf' ? 'bf' : 'gf' };
}

export function normalize(raw = {}) {
  const s = (v) => (typeof v === 'string' ? v : '');
  const d = Math.round(Number(raw.danger) || 0);
  return { meaning: s(raw.meaning), danger: Math.min(100, Math.max(0, d)), reply: s(raw.reply), avoid: s(raw.avoid) };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Chỉ nhận POST' });
  let input;
  try {
    input = parseRequest(req.body);
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message });
  }

  const who = input.direction === 'bf' ? 'bạn trai' : 'bạn gái';
  const user = input.image
    ? [
        { type: 'text', text: input.text || 'Giải mã đoạn chat này.' },
        // ponytail: detail "low" = ~85 tokens/ảnh; đổi "auto" nếu chữ trong ảnh bị đọc sai
        { type: 'image_url', image_url: { url: input.image, detail: 'low' } },
      ]
    : input.text;

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5-mini',
        reasoning_effort: 'minimal',
        max_completion_tokens: 400,
        response_format: { type: 'json_schema', json_schema: { name: 'decode', strict: true, schema: SCHEMA } },
        messages: [
          { role: 'system', content: PROMPT.replaceAll('{AI}', who) },
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text?.().catch(() => '')}`);
    const data = await r.json();
    return res.status(200).json(normalize(JSON.parse(data.choices[0].message.content)));
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Thông dịch viên đang dỗi, thử lại nhé 😤' });
  }
}
