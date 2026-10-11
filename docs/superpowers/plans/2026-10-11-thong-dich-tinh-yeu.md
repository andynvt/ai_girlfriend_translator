# Thông Dịch Viên Tình Yêu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web app (giao diện tiếng Việt, mobile-first) giải mã câu nói của người yêu theo 2 chiều (bạn gái ↔ bạn trai), có đồng hồ "mức nguy hiểm", câu trả lời gợi ý, giọng đọc kịch tính và chế độ chụp màn hình chat. Demo tại DevDay Exchange HCMC 12/10/2026.

**Architecture:** Một trang `index.html` thuần (không framework) + 2 Vercel serverless function (`api/translate.js`, `api/speak.js`) gọi OpenAI qua `fetch`, giữ API key phía server. Nhập giọng nói dùng Web Speech API có sẵn trên trình duyệt (`vi-VN`), không tốn API.

**Tech Stack:** HTML/CSS/JS thuần, Node 24 (fetch có sẵn), Vercel Functions, OpenAI Chat Completions (structured output JSON, vision) + OpenAI TTS. Test bằng `node:test`. Không thêm dependency nào.

**Design system:** [Cupcake tùy biến, CSS thuần](../../design/design-system.md) — nền kem/hồng/lavender, card bo tròn, kết quả bong bóng chat, mascot trái tim và responsive hai cột trên desktop.

**Spec:** Phần brainstorm trong conversation ngày 2026-10-11 (tóm tắt ở Goal + Global Constraints).

## Global Constraints

- Toàn bộ chữ trên UI bằng tiếng Việt; AI trả lời bằng tiếng Việt, hiểu slang/Gen-Z ("ừ", "sao cũng được", "tùy anh", "k sao đâu").
- Hai chiều: `direction` ∈ `"gf"` (giải mã bạn gái) | `"bf"` (giải mã bạn trai). Giọng hài hước, trêu cả hai giới đều nhau, không xúc phạm.
- Kết quả JSON: `{ meaning: string, danger: integer 0–100, reply: string, avoid: string }`.
- Model qua env: `OPENAI_MODEL` (mặc định `gpt-5-mini`), `OPENAI_TTS_MODEL` (mặc định `gpt-4o-mini-tts`). Key: `OPENAI_API_KEY`, không bao giờ gửi xuống client.
- Giới hạn input: text ≤ 500 ký tự; ảnh ≤ 4 MB (data URL) — để không đốt credit khi cả phòng quét QR.
- Không dependency npm. Không tài khoản, không lưu lịch sử.

## Review Focus

- Text rỗng/chỉ khoảng trắng và không có ảnh → API trả 400 với thông báo tiếng Việt, UI hiện lỗi, không gọi OpenAI. (test ở Task 1)
- Model trả JSON thiếu field hoặc `danger` ngoài 0–100 → server clamp/điền mặc định, UI không vỡ. (test ở Task 1)
- OpenAI lỗi/hết quota/timeout giữa demo → trả 502 + câu báo lỗi vui ("Thông dịch viên đang dỗi, thử lại nhé"), không trắng trang. (test ở Task 1)
- Trình duyệt không hỗ trợ Web Speech (Safari iOS cũ, Firefox) → ẩn nút mic, vẫn dùng được bằng gõ. (kiểm tay ở Task 3)
- Request `direction` lạ → mặc định `"gf"`. (test ở Task 1)

---

## File Structure

```
package.json            # "type":"module", script "test": "node --test"
.env.example            # OPENAI_API_KEY=, OPENAI_MODEL=, OPENAI_TTS_MODEL=
.gitignore              # .env, .vercel
api/translate.js        # POST → gọi OpenAI, trả JSON giải mã
api/speak.js            # POST {text} → audio/mpeg từ OpenAI TTS
index.html              # UI + JS + CSS (một file)
test/translate.test.js  # node:test, mock fetch
```

### Task 1: API giải mã `api/translate.js`

**Files:**
- Create: `package.json`, `.env.example`, `.gitignore`, `api/translate.js`
- Test: `test/translate.test.js`

**Interfaces:**
- Produces:
  - `export function parseRequest(body: object): { text: string, image: string|null, direction: "gf"|"bf" }` — ném `Error` có `.status = 400` khi không hợp lệ.
  - `export function normalize(raw: object): { meaning, danger, reply, avoid }` — clamp `danger` vào 0–100 (làm tròn), field thiếu → `""`.
  - `export default async function handler(req, res)` — Vercel Node handler. POST body JSON `{ text?, image?, direction? }` → 200 JSON kết quả; 400 `{ error }`; 502 `{ error }`.

- [ ] **Step 1: Viết test fail** trong `test/translate.test.js`:
  - `parseRequest({text:"  "})` throws, `.status === 400`
  - `parseRequest({text:"a".repeat(501)})` throws 400
  - `parseRequest({text:"em k sao", direction:"xyz"}).direction === "gf"`
  - `parseRequest({image:"data:image/png;base64,AAA"}).image` truthy, `.text === ""`
  - `normalize({meaning:"x", danger:150}).danger === 100`; `normalize({}).reply === ""`; `normalize({danger:-3}).danger === 0`
  - handler với `globalThis.fetch` mock trả `{ok:false,status:429}` → `res.statusCode === 502`, body có `error`
  - handler với fetch mock trả choices[0].message.content = `'{"meaning":"m","danger":80,"reply":"r","avoid":"a"}'` → 200, body `{meaning:"m",danger:80,reply:"r",avoid:"a"}`
  - Mock `res` là object có `status(code)` (lưu `statusCode`, return this) và `json(obj)` (lưu body).

- [ ] **Step 2:** `npm test` → FAIL (module chưa tồn tại).

- [ ] **Step 3: Implement.** Gọi `POST https://api.openai.com/v1/chat/completions` với `response_format: { type: "json_schema", json_schema: { name: "decode", strict: true, schema: {...4 field, required all} } }`. Có ảnh → user content là mảng `[{type:"text",...},{type:"image_url",image_url:{url:image}}]`. Timeout 25s bằng `AbortSignal.timeout(25000)`. Method khác POST → 405. System prompt (copy nguyên văn, thay `{AI}`):

  > Bạn là "Thông Dịch Viên Tình Yêu" — chuyên gia giải mã ngôn ngữ người yêu Việt Nam, hài hước, cà khịa nhẹ nhàng, không xúc phạm. Bạn đang giải mã lời của {AI}. Hiểu slang, teencode, Gen-Z. Nếu là ảnh chụp đoạn chat, đọc cả cuộc hội thoại và giải mã tin nhắn của {AI}. Trả về: meaning (ý thật sự, 1–2 câu, có muối), danger (0–100, mức nguy hiểm cho người nghe), reply (câu trả lời cứu nguy nên gửi), avoid (câu tuyệt đối KHÔNG được nói). Luôn trả lời bằng tiếng Việt.

  `{AI}` = `"bạn gái"` khi `gf`, `"bạn trai"` khi `bf`.

- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** `git init && git add -A && git commit -m "feat: translate API"`

### Task 2: API giọng đọc `api/speak.js`

**Files:**
- Create: `api/speak.js`

**Interfaces:**
- Produces: `POST /api/speak` body `{ text: string }` (≤ 500 ký tự) → `audio/mpeg` bytes; 400/502 JSON `{ error }`.

- [ ] **Step 1:** Gọi `POST https://api.openai.com/v1/audio/speech` với `{ model: OPENAI_TTS_MODEL, voice: "onyx", input: text, instructions: "Đọc bằng tiếng Việt như người dẫn phim tài liệu kịch tính, nghiêm trọng quá mức một cách hài hước." }`, trả `Buffer.from(await r.arrayBuffer())` với header `Content-Type: audio/mpeg`.
- [ ] **Step 2: Kiểm tay** (sau khi có `.env`):
  `vercel dev` rồi `curl -s -X POST localhost:3000/api/speak -H 'content-type: application/json' -d '{"text":"Em không sao đâu"}' -o /tmp/t.mp3 && afplay /tmp/t.mp3` → nghe được tiếng.
- [ ] **Step 3:** Commit `feat: TTS endpoint`.

### Task 3: Giao diện `index.html`

**Files:**
- Create: `index.html`

**Interfaces:**
- Consumes: `POST /api/translate`, `POST /api/speak` (Task 1, 2).

- [ ] **Step 1: Dựng UI** (mobile-first, chữ to, màu hồng/đỏ, đọc rõ trên máy chiếu):
  - Toggle 2 nút: "💁‍♀️ Giải mã Bạn Gái" / "🙋‍♂️ Giải mã Bạn Trai" → `direction`.
  - Textarea placeholder "Ví dụ: Em không sao đâu…", nút 🎤 (Web Speech `lang="vi-VN"`, ẩn nếu `!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)`), nút 📷 (`<input type="file" accept="image/*">` → `FileReader.readAsDataURL`), nút "Giải mã!".
  - 3 chip ví dụ bấm nhanh mỗi chiều. Bạn gái: "Em không sao đâu", "Tùy anh", "Anh đi đi, em không giận". Bạn trai: "Anh bận chút", "Ừ", "Để anh suy nghĩ đã".
  - Kết quả: thanh "Mức nguy hiểm" (xanh <40, vàng <70, đỏ ≥70, có số %), thẻ "Ý thật sự", "Nên trả lời", "❌ Tuyệt đối đừng nói", nút 🔊 "Đọc kịch tính" (gọi `/api/speak` với `meaning`, phát qua `new Audio(URL.createObjectURL(blob))`).
  - Loading: "Đang phân tích tâm lý…"; lỗi: hiện `error` từ server.
- [ ] **Step 2: Kiểm tay** bằng `vercel dev`: gõ text, bấm chip, upload ảnh chụp Zalo, đổi chiều, thử mic trên Chrome, thử view mobile 375px. Tất cả ra kết quả tiếng Việt.
- [ ] **Step 3:** Commit `feat: Vietnamese UI`.

### Task 4: Deploy + QR

- [ ] **Step 1:** `vercel link`, `vercel env add OPENAI_API_KEY production` (+ 2 biến model nếu khác mặc định), `vercel --prod`.
- [ ] **Step 2:** Mở URL production trên điện thoại thật (4G, không wifi) → chạy được cả text + 🔊.
- [ ] **Step 3:** Tạo QR từ URL production (vd. qr-code-generator bất kỳ hoặc `npx qrcode` chỉ khi cần), lưu `qr.png`, chèn slide cuối.
- [ ] **Step 4:** Commit.

### Task 5: Dàn dựng demo (không code)

- [ ] Chuẩn bị sẵn 2 ảnh chụp đoạn chat (tự dựng, không dùng chat thật của ai) để upload khi demo.
- [ ] Tập kịch bản 3 phút: Hook → 2 ví dụ + 1 câu khán giả → lật chiều bạn trai → "Codex build trong X giờ" + QR.
- [ ] Đặt hard limit chi phí trên OpenAI dashboard trước khi phát QR.
