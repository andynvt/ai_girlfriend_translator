# Thông dịch tình yêu

Web app tĩnh (`index.html`, `css/`, `js/`) + Vercel serverless API (`api/`) gọi OpenAI. App Flutter nằm trong `mobile/`.

## Yêu cầu

- Node.js ≥ 20
- Vercel CLI: `npm install -g vercel`, rồi `vercel login` và `vercel link` (tạo `.vercel/project.json`)
- `npm install` (Playwright cho demo manual: `npx playwright install chromium`)

## Cấu hình

```bash
cp .env.example .env
```

Điền `OPENAI_API_KEY`. Các biến khác (model, Upstash rate limit, demo gate) xem chú thích trong `.env.example`. Đổi `.env` xong phải khởi động lại server local.

## Chạy local server

```bash
vercel dev --listen 127.0.0.1:3000
```

Mở http://127.0.0.1:3000. Không có Upstash → rate limit tắt (request vẫn được phép).

## Board quản lý (Project Hub)

```bash
npm run hub
```

Mở http://127.0.0.1:8765 — chỉ chạy local, không deploy. Từ Hub có thể: chạy test, khởi động/dừng app local (port 3000), đổi model trong `.env`, chạy demo manual, deploy Preview/Production, bật/tắt public demo (cần `DEMO_APP_URL` + `DEMO_ADMIN_TOKEN`). Slide demo: http://127.0.0.1:8765/demo-slides.html.

## Deploy production

Đặt env vars trên Vercel (Project → Settings → Environment Variables): `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_REASONING_EFFORT`, `OPENAI_TTS_MODEL`, `OPENAI_TRANSCRIBE_MODEL`, và nếu dùng: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `DEMO_ADMIN_TOKEN`, `DEMO_ACCESS_KEY`.

```bash
vercel --prod
```

Hoặc bấm **Deploy Production** trên Hub (Hub truyền model/effort đang chọn trong `.env`). Bỏ `--prod` để deploy Preview. `.vercelignore` giữ `docs/`, `scripts/`, `test/`, `.env`, `mobile/` ở local — Hub từ chối deploy nếu thiếu các dòng này.

## Test

```bash
npm test
```

Các check bằng Playwright (cần app local chạy): `npm run test:demo`, `test:onboarding`, `test:bot`, `test:history`. Demo manual: `npm run demo:manual -- --cases TC01,TC02 --voice off`.

## Sửa lỗi thường gặp

| Lỗi | Cách sửa |
|---|---|
| `Port 8765 đang được dùng` | Hub cũ còn chạy: `lsof -ti :8765 \| xargs kill` |
| Port 3000 bận / `vercel dev` không lên | `lsof -ti :3000 \| xargs kill`, chạy lại |
| `npx` báo thiếu vercel / không khởi chạy được lệnh | `npm install -g vercel`, đảm bảo `vercel` có trong `PATH` của shell chạy Hub |
| `Chưa link project` | `vercel login` rồi `vercel link` |
| `App local chưa sẵn sàng` trên slide demo | Bấm Khởi động app trên Hub/slide, hoặc chạy `vercel dev` ở port 3000 |
| API trả lỗi OpenAI / 401 | Kiểm tra `OPENAI_API_KEY` trong `.env` (local) hoặc env vars trên Vercel (prod), rồi restart/redeploy |
| Model không trả về JSON đầy đủ | Luna phải dùng `OPENAI_REASONING_EFFORT=none`; GPT-5 dùng `minimal` |
| `Dừng app local trước khi đổi model` | Bấm Dừng trên Hub, đổi model, khởi động lại |
| Public demo luôn đóng | Khi có `DEMO_ADMIN_TOKEN`, cần Redis (Upstash); bật public từ Hub |
