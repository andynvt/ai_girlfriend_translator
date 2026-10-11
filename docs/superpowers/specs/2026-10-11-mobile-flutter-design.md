# Mobile app (Flutter) — Design

Ngày: 2026-10-11 · Trạng thái: đã duyệt design trong chat, chờ review spec.

## Mục tiêu

App iOS + Android native cho "Thông Dịch Viên Tình Yêu", trải nghiệm native thật (share sheet, thu âm, haptics), đủ tính năng web hiện tại + nhận ảnh từ share sheet. Một codebase Flutter.

### Vì sao Flutter

| Lựa chọn | Kết luận |
|---|---|
| Flutter | ✅ Chọn. 1 codebase, plugin đủ cho thu âm/ảnh/audio/share sheet, toolchain `fvm` có sẵn trên máy. |
| React Native | Không hơn Flutter: UI web là DOM thuần nên vẫn viết lại; logic chung chỉ có `lib/preferences.js`. |
| Native Swift + Kotlin | ×2 công sức, app không cần API native nặng. |
| KMP / Compose Multiplatform | Mạnh khi chia sẻ business logic; app này logic nằm ở server. |
| Capacitor (bọc web) | Nhanh nhưng là webview, không đạt mục tiêu native; rủi ro bị Apple từ chối. |

## Quyết định đã chốt

- Thư mục: `mobile/` trong repo hiện tại, `.fvmrc` pin Flutter **3.47.2**.
- Bundle ID (iOS) / applicationId (Android): **`com.studioapp.thongdichtinhyeu`**.
- Hợp đồng 3 endpoint giữ nguyên; base URL qua `--dart-define=API_BASE_URL=<url>` (dev: `vercel dev` local; prod: domain Vercel). Không cần CORS.
- State: `setState` / `ChangeNotifier`. Không Riverpod/Bloc.
- Onboarding chỉ port flow **wizard** + thiết lập bằng giọng nói. Flow lá thư / phỏng vấn / quẹt thẻ là concept web, không port.
- `.vscode/settings.json` chưa tồn tại → tạo với `"dart.lineLength": 120`; mọi lệnh format dùng `fvm dart format --line-length 120`.

## Backend: rate limit theo IP

Áp cho cả web và app. Giới hạn mỗi IP / cửa sổ 10 phút: `translate` 20, `speak` 30, `onboarding` 10 (rộng vì CGNAT di động VN).

Thứ tự lựa chọn, quyết định khi implement:
1. **Vercel Firewall rate-limit rule** (cấu hình dashboard, không code) nếu plan Vercel hỗ trợ. Ghi lại cấu hình rule trong `docs/` để tái lập.
2. Nếu không: `lib/rate-limit.js` gọi Upstash Redis REST bằng `fetch` (không thêm npm dependency), gọi đầu mỗi handler. Thiếu env `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` hoặc Redis lỗi → cho qua (fail-open) và `console.error`. Thêm env vào `.env.example`.

Vượt giới hạn → HTTP 429, body `{ "error": "<vi|en message>" }` theo `language` của request, cùng shape lỗi hiện có. Web hiển thị qua đường lỗi sẵn có.

## Cấu trúc app

```
mobile/
  .fvmrc
  pubspec.yaml
  lib/
    main.dart          # MaterialApp, theme từ token Cupcake (docs/design/design-system.md), routing đơn giản
    api.dart           # translate / speak / onboarding; map lỗi
    models.dart        # Profile, Analysis, Turn, Conversation + fromJson/toJson/validate
    store.dart         # shared_preferences: profile + conversations
    i18n.dart          # map vi→en port từ js/i18n.js; t(key) theo ngôn ngữ profile
    share_intake.dart  # nhận ảnh từ share sheet → mở DecodeScreen với ảnh
    screens/
      onboarding.dart  # wizard: ngôn ngữ → bạn gái/trai → tên → xác nhận; + ghi âm
      decode.dart      # input text/bối cảnh/ảnh, kết quả, chọn câu, hỏi tiếp, TTS
      history.dart     # danh sách cuộc trò chuyện đã lưu, mở lại, xóa
    widgets/
      tim_bot.dart     # sprite atlas assets/tim-bot/tim-bot-atlas.png, 5 trạng thái × 4 frame
      danger_meter.dart
  test/
  ios/ (thêm target Share Extension + App Group)
  android/ (intent filter image/*)
```

Dependency: `http`, `image_picker`, `record`, `just_audio`, `shared_preferences`, `receive_sharing_intent`. Haptics dùng `HapticFeedback` có sẵn.

### Data model và lưu trữ

Cùng JSON shape và quy tắc validate với web (`js/app.js`, `js/onboarding.js`):
- Profile key `love-interpreter.preferences.v1`: `{ language: 'vi'|'en', direction: 'gf'|'bf', partnerName: string ≤60, onboardingCompleted: true }`.
- Conversations key `love-interpreter.conversations.v1`: mảng `{ id ≤100, profile, context ≤1000, turns[1..50] }`; turn có `text` (không rỗng), `selectedReply`, `sentReply` (string ≤1000), `createdAt` (ISO date), `fromImage` (bool), `analysis {meaning, danger 0–100, reply, avoid}`, `selection: null|'reply'|'avoid'`; chỉ lượt cuối được `selection: null` (khi đó `selectedReply` rỗng). Tối đa **10 lượt** mỗi cuộc (mặc định `maxConversationTurns` của web).
- Dữ liệu sai shape khi đọc → bỏ qua bản ghi đó, không crash.

### Luồng chính

1. **Onboarding** (lần đầu hoặc "Làm lại từ đầu"): wizard từng bước, Back giữ giá trị. Nút ghi âm tối đa 30 giây, AAC → data URL `audio/mp4` → `/api/onboarding`; field trả về `null` thì người dùng tự điền; review trước khi lưu.
2. **Giải mã**: text ≤500, bối cảnh ≤1000, ảnh từ camera/thư viện qua `image_picker` (`maxWidth` 1600, `imageQuality` 80; nếu data URL vẫn >4 MB → báo lỗi, không gửi). Gửi `history` từ các lượt đã chọn. Kết quả: meaning, danger meter (nhãn <40 "Êm đẹp", 40–69 "Có mùi dỗi", ≥70 "Báo động đỏ" — màu luôn kèm số + nhãn), reply, avoid, nút đọc (`/api/speak` → `just_audio` phát bytes mp3). Haptic: light <40, medium 40–69, heavy ≥70.
3. **Chọn câu & hỏi tiếp**: chọn reply/avoid → lưu cuộc trò chuyện → mở lượt mới; đạt 10 lượt → yêu cầu tạo cuộc mới.
4. **Share sheet**: app nhận 1 ảnh (cả cold start và khi đang chạy). Chưa onboarding → onboarding trước, giữ ảnh, sau đó mở giải mã. Nhiều ảnh → lấy ảnh đầu.
5. **Tim Bot**: trạng thái chào / chờ nhập / suy nghĩ (đang gọi API) / đọc (audio phát) / nghỉ. `MediaQuery.disableAnimations` → frame tĩnh.

## Xử lý lỗi

- Response non-2xx có `{error}` → hiển thị nguyên câu đó.
- 429 không có body hợp lệ → "Thử lại sau ít phút nhé" / "Please try again in a few minutes".
- Timeout client 30 giây, lỗi mạng → thông báo chung song ngữ; giữ nguyên input để thử lại.
- Từ chối quyền mic → ẩn ghi âm, nhập tay. Từ chối quyền ảnh/camera → vẫn nhập text.
- Đang phát audio thì dừng khi giải mã mới, làm lại thiết lập hoặc rời màn.

## Kiểm thử

- `fvm flutter test`:
  - `models`: validate đúng/sai shape, round-trip JSON tương thích dữ liệu web.
  - `api`: `MockClient` cho 200, 400 có `error`, 429, 502, timeout; body request đúng field.
  - `i18n`: mọi key dùng trong app có bản en.
  - Widget test luồng giải mã với API giả: nhập → kết quả → chọn câu → lượt 2.
- Backend (chỉ khi viết `lib/rate-limit.js`): `node --test` cho đếm, 429, fail-open.
- `fvm flutter analyze` sạch.
- Kiểm tay: iOS Simulator + Android emulator; share ảnh từ Photos; từ chối quyền; API trả lỗi; giảm chuyển động.
- Cập nhật `docs/project-hub.html` sau mỗi giai đoạn, phân biệt "đã code" và "đã verify".

## Ngoài phạm vi v1

Submit store (ký app, privacy label, screenshot), tài khoản, sync lịch sử, push notification, App Attest/Play Integrity, 3 flow onboarding concept.
