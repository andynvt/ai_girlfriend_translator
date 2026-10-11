# Mobile app (Flutter) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App Flutter iOS + Android cho "Thông Dịch Viên Tình Yêu", đủ tính năng web + nhận ảnh từ share sheet, gọi lại 3 Vercel endpoint hiện có; thêm rate limit theo IP cho backend.

**Architecture:** `mobile/` là Flutter project độc lập trong repo, chỉ nói chuyện với backend qua HTTP (`API_BASE_URL` dart-define). Logic AI giữ ở server. Model/lưu trữ dùng cùng JSON shape với web (`js/app.js`).

**Tech Stack:** Flutter 3.47.2 (fvm), Dart; `http`, `image_picker`, `record`, `just_audio`, `shared_preferences`, `receive_sharing_intent`. Backend: Node 24 Vercel functions, `node:test`.

**Spec:** [docs/superpowers/specs/2026-10-11-mobile-flutter-design.md](../specs/2026-10-11-mobile-flutter-design.md)

## Global Constraints

- Flutter qua `fvm` (`mobile/.fvmrc` → `3.47.2`); nếu không có `fvm` thì dùng `flutter`.
- Format: `fvm dart format --line-length 120 <files>` (giá trị từ `.vscode/settings.json` → `"dart.lineLength": 120`). Không format với line length mặc định.
- **Không commit / push** (AGENTS.md). Bước cuối mỗi task là "để nguyên thay đổi cho user review".
- Bundle ID / applicationId: `com.studioapp.thongdichtinhyeu`. App name hiển thị: `Thông Dịch Viên Tình Yêu`.
- Không thêm npm dependency. Dart dependency chỉ đúng danh sách Tech Stack (+ `flutter_test`, `flutter_lints`).
- State: `setState` / `ChangeNotifier`, không Riverpod/Bloc.
- Giới hạn: text ≤500, context ≤1000, partnerName ≤60, ảnh data URL ≤4 MB, ghi âm ≤30 s / 2 MB, 10 lượt/cuộc, 50 turns tối đa khi validate.
- Storage keys: `love-interpreter.preferences.v1`, `love-interpreter.conversations.v1`.
- Danger nhãn: `<40` "Êm đẹp", `40–69` "Có mùi dỗi", `≥70` "Báo động đỏ"; màu luôn kèm số + nhãn.
- Design token (từ `css/app.css`): background `#fff8f3`, surface `#fff`, primary `#b4235a`, primary-soft `#ffe6ee`, lavender `#f0e9ff`, mint `#e6f6ed`, text `#291b23`, muted `#715363`, border `#e6c8d6`, focus `#6744a3`, safe `#237a4b`, warning `#946000`, danger `#b42332`; radius card 24, input 16, pill 999; nút tối thiểu 48 px.
- Toàn bộ chuỗi UI qua `t(key)` với key là câu tiếng Việt, giống `js/i18n.js`.
- Sau mỗi task có thay đổi tính năng: cập nhật `docs/project-hub.html` (AGENTS.md) — "implemented" khác "verified".

## Review Focus

1. Ảnh share vào khi app cold start và chưa onboarding → ảnh phải được giữ tới màn giải mã, không mất. (Task 9 test `pending image survives onboarding`)
2. Ảnh chụp màn hình dài (vd. 1170×8000) vượt 4 MB sau nén → báo lỗi, không gửi request. (Task 7 test `oversized image blocked`)
3. Dữ liệu storage hỏng / từ phiên bản khác → bỏ qua bản ghi lỗi, app vẫn mở. (Task 3 test `corrupt history skipped`)
4. Người dùng bấm giải mã liên tục / đổi cuộc trò chuyện khi request đang chạy → kết quả cũ không ghi vào cuộc mới. (Task 7 test `stale response ignored`)
5. Lượt từ ảnh với `sourceText` rỗng → phải bắt người dùng nhập lời đọc trước khi chọn câu. (Task 7 test `image turn requires source text`)

---

## File Structure

```
.vscode/settings.json                 # dart.lineLength 120
lib/rate-limit.js                     # chỉ khi Firewall không khả dụng (Task 1)
api/{translate,speak,onboarding}.js   # gọi rateLimit ở đầu handler (Task 1, nhánh code)
test/rate-limit.test.js
mobile/
  .fvmrc  pubspec.yaml  analysis_options.yaml
  assets/tim-bot-atlas.png            # copy từ assets/tim-bot/
  lib/main.dart  lib/theme.dart  lib/api.dart  lib/models.dart  lib/store.dart  lib/i18n.dart
  lib/share_intake.dart
  lib/screens/{onboarding,decode,history}.dart
  lib/widgets/{tim_bot,danger_meter}.dart
  test/{models,api,store,i18n,widgets,onboarding,decode_flow,history,share_intake}_test.dart
  ios/ShareExtension/…  android/app/src/main/AndroidManifest.xml
```

---

### Task 1: Backend rate limit theo IP

**Files:**
- Decision → either `docs/rate-limit.md` (Firewall) **or** Create `lib/rate-limit.js`, `test/rate-limit.test.js`; Modify `api/translate.js`, `api/speak.js`, `api/onboarding.js`, `.env.example`.

**Interfaces:**
- Produces: HTTP 429 `{ "error": string }` từ cả 3 endpoint khi vượt giới hạn. Limits/10 phút: translate 20, speak 30, onboarding 10.

- [ ] **Step 1: Hỏi user plan Vercel có Firewall rate limiting không** (dashboard → Firewall → Configure → Rate Limit). Có → Step 2a. Không → Step 2b.
- [ ] **Step 2a (Firewall):** user/assistant tạo 3 rule theo path `/api/translate`, `/api/speak`, `/api/onboarding`, key IP, window 600 s, limit như trên, action 429. Ghi cấu hình vào `docs/rate-limit.md`. Kiểm: gọi 21 lần `/api/translate` từ một IP trên preview deploy → lần 21 trả 429. Bỏ qua Step 3–6.
- [ ] **Step 2b: Viết test fail** `test/rate-limit.test.js` với `fetch` stub:
  - `allows under limit`: stub Upstash trả `[{result: 5}, {result: 1}]` cho pipeline `INCR`+`EXPIRE` → `rateLimit(req,'translate')` resolves `true`.
  - `blocks over limit`: INCR trả 21 → `false`.
  - `fails open without env`: không có `UPSTASH_REDIS_REST_URL` → `true`, không gọi fetch.
  - `fails open on redis error`: fetch reject → `true`.
  - `handler returns 429`: `translate` handler với rateLimit false → status 429, `error` là `'Bạn hỏi nhanh quá, thử lại sau ít phút nhé.'` (vi) / `'Too many requests. Please try again in a few minutes.'` (en).
- [ ] **Step 3: Chạy** `node --test test/rate-limit.test.js` → FAIL (module không tồn tại).
- [ ] **Step 4: Implement** `export async function rateLimit(req, name): Promise<boolean>` trong `lib/rate-limit.js`. IP = phần đầu `x-forwarded-for` hoặc `'unknown'`. Key `rl:${name}:${ip}:${Math.floor(Date.now()/600000)}`. Gọi Upstash `POST ${URL}/pipeline` với `[["INCR",key],["EXPIRE",key,"600"]]`, header `Authorization: Bearer ${TOKEN}`. `LIMITS = { translate: 20, speak: 30, onboarding: 10 }`. Lỗi → `console.error` + `true`. Gọi sau check method POST trong mỗi handler; thêm 2 env vào `.env.example`.
- [ ] **Step 5: Chạy** `npm test` → toàn bộ PASS (kể cả test cũ).
- [ ] **Step 6:** Để thay đổi cho user review (không commit).

### Task 2: Scaffold Flutter + models

**Files:**
- Create: `.vscode/settings.json`, `mobile/` (qua `flutter create`), `mobile/.fvmrc`, `mobile/lib/models.dart`, `mobile/test/models_test.dart`

**Interfaces:**
- Produces (models.dart):
  - `class Profile { String language; String direction; String partnerName; Map<String,dynamic> toJson(); static Profile? fromJson(Object? j); }` — `fromJson` trả `null` nếu sai (language ∉ vi/en, direction ∉ gf/bf, name >60 hoặc có ký tự điều khiển, `onboardingCompleted != true`). `toJson` luôn ghi `onboardingCompleted: true`.
  - `class Analysis { String meaning; int danger; String reply; String avoid; }` + `fromJson` (clamp danger 0–100, thiếu field → `''`).
  - `class Turn { String text; Analysis analysis; String? selection; String selectedReply; String sentReply; DateTime createdAt; bool fromImage; Map<String,dynamic> toHistoryJson(); }` — `toHistoryJson` = `{text, analysis, selection, selectedReply, sentReply}`.
  - `class Conversation { String id; Profile profile; String context; List<Turn> turns; static Conversation? fromJson(Object? j); Map<String,dynamic> toJson(); }` — validate đúng luật `validConversation` trong `js/app.js:75-84`.
  - `const maxConversationTurns = 10;` `String dangerLabelKey(int d)` → `'Êm đẹp' | 'Có mùi dỗi' | 'Báo động đỏ'`.

- [ ] **Step 1:** `.vscode/settings.json` = `{ "dart.lineLength": 120 }`. Trong repo root: `fvm flutter create --org com.studioapp --project-name thongdichtinhyeu --platforms ios,android mobile`; `cd mobile && fvm use 3.47.2`. Sửa `CFBundleDisplayName` / `android:label` thành `Thông Dịch Viên Tình Yêu`; kiểm `PRODUCT_BUNDLE_IDENTIFIER` và `applicationId` = `com.studioapp.thongdichtinhyeu`. Xóa test counter mặc định.
- [ ] **Step 2: Viết test fail** `models_test.dart`:
  - `web conversation round-trips`: JSON mẫu y hệt web (2 turns, turn cuối `selection: null`, `selectedReply: ''`) → `Conversation.fromJson(j)!.toJson()` deep-equals `j`.
  - `rejects selection null on non-last turn` → `null`.
  - `rejects empty text`, `rejects 51 turns`, `rejects bad createdAt`, `rejects fromImage missing` → `null`.
  - `analysis clamps danger`: `{danger: 140}` → 100; `{danger: -3}` → 0.
  - `danger labels`: 39 → 'Êm đẹp', 40 → 'Có mùi dỗi', 69 → 'Có mùi dỗi', 70 → 'Báo động đỏ'.
  - `profile rejects 61-char name` → `null`.
- [ ] **Step 3:** `cd mobile && fvm flutter test test/models_test.dart` → FAIL.
- [ ] **Step 4:** Implement `models.dart` theo Interfaces.
- [ ] **Step 5:** `fvm flutter test` → PASS; `fvm flutter analyze` → No issues; format với line length 120.
- [ ] **Step 6:** Để thay đổi cho user review.

### Task 3: Store + i18n

**Files:** Create `mobile/lib/store.dart`, `mobile/lib/i18n.dart`, `mobile/test/store_test.dart`, `mobile/test/i18n_test.dart`

**Interfaces:**
- Consumes: `Profile`, `Conversation` (Task 2).
- Produces:
  - `class Store { Store(SharedPreferences p); Profile? loadProfile(); Future<bool> saveProfile(Profile); Future<void> clearProfile(); List<Conversation> loadConversations(); Future<bool> saveConversation(Conversation c); Future<bool> deleteConversation(String id); }` — save đưa `c` lên đầu, bỏ bản trùng `id`; trả `false` nếu `Conversation.fromJson(c.toJson()) == null` (không ghi đè dữ liệu cũ).
  - `i18n.dart`: `const Map<String,String> en`, `String t(String key, String language)` → `language=='en' ? en[key] ?? key : key`.

- [ ] **Step 1: Viết test fail**:
  - store `corrupt history skipped`: prefs có `[validConv, {"id":1}, "x"]` → `loadConversations()` length 1.
  - store `invalid JSON returns empty`: value `"{"` → `[]`, không throw.
  - store `save moves to top & dedupes`, `delete removes by id`, `profile round-trip`.
  - i18n `every used key has English`: quét `lib/**/*.dart` tìm `t('…'` bằng regex `t\('((?:[^'\\]|\\.)*)'`, mọi key có trong `en`.
- [ ] **Step 2:** `fvm flutter test test/store_test.dart test/i18n_test.dart` → FAIL.
- [ ] **Step 3:** Implement. `en` copy các cặp cần dùng từ `js/i18n.js` (`EN`); thêm key mới (vd. 429 fallback, quyền bị từ chối) kèm bản en. Store dùng `SharedPreferences.setMockInitialValues` trong test.
- [ ] **Step 4:** Test PASS, analyze sạch, format 120.
- [ ] **Step 5:** Để thay đổi cho user review.

### Task 4: API client

**Files:** Create `mobile/lib/api.dart`, `mobile/test/api_test.dart`

**Interfaces:**
- Consumes: `Analysis`, `Turn` (Task 2), `t` (Task 3).
- Produces:
  - `class ApiException implements Exception { final String message; final int? status; }`
  - `class DecodeResult { Analysis analysis; String? sourceText; }`
  - `class Api { Api({http.Client? client, String? baseUrl}); Future<DecodeResult> translate({required String text, required String context, String? imageDataUrl, required String direction, required String language, required String partnerName, required List<Turn> history}); Future<Uint8List> speak({required String text, required String direction, required String language}); Future<Map<String,dynamic>> onboarding({required String audioDataUrl, required String language}); }`
  - `baseUrl` mặc định `const String.fromEnvironment('API_BASE_URL')`. Timeout 30 s.

- [ ] **Step 1: Viết test fail** với `MockClient`:
  - `translate sends web-shaped body`: body có `text, context, direction, language, partnerName`; `image` chỉ khi có; `history` = `turns.map(toHistoryJson)` chỉ khi không rỗng.
  - `translate parses result + sourceText`.
  - `server error message surfaces`: 400 `{"error":"Dài quá…"}` → `ApiException.message == 'Dài quá…'`.
  - `429 without body uses fallback`: → message `t('Bạn hỏi nhanh quá, thử lại sau ít phút nhé.', lang)`.
  - `timeout maps to friendly error`: client không trả lời → `ApiException` với `t('Mạng chập chờn, thử lại nhé.', lang)` (dùng `fakeAsync` hoặc timeout tiêm vào constructor `Duration timeout`).
  - `speak returns bytes`: 200 `audio/mpeg` → bytes đúng.
- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS, analyze, format.
- [ ] **Step 5:** Để thay đổi cho user review.

### Task 5: Theme, Tim Bot, Danger meter, app shell

**Files:** Create `mobile/lib/theme.dart`, `mobile/lib/widgets/tim_bot.dart`, `mobile/lib/widgets/danger_meter.dart`; Modify `mobile/lib/main.dart`, `mobile/pubspec.yaml` (asset `assets/tim-bot-atlas.png` copy từ `assets/tim-bot/tim-bot-atlas.png`).

**Interfaces:**
- Produces:
  - `ThemeData appTheme()` dùng token Global Constraints.
  - `enum BotState { greet, choose, input, waiting, reading }` — row 0–4 của atlas, 4 cột × 256 px; fps greet/reading 5, còn lại 4; `waiting`/`reading` loop, còn lại chạy 1 lần rồi giữ frame 0. `TimBot({required BotState state, double size = 120})`. `MediaQuery.disableAnimationsOf(context)` → frame 0 tĩnh. Semantics `excludeSemantics: true` (trang trí).
  - `DangerMeter({required int danger, required String language})` — thanh 0–100 animate 600 ms (0 ms khi disableAnimations), hiện số + `t(dangerLabelKey(d))`, màu safe/warning/danger.
  - `main.dart`: `App(store, api)` — chưa có profile → `OnboardingScreen`, có → `DecodeScreen`. Placeholder `Scaffold` cho 2 màn này đến Task 6/7.

- [ ] **Step 1: Widget test fail** trong `test/widgets_test.dart`: `danger meter shows number and label` (danger 72 → thấy `'72'` và `'Báo động đỏ'`); `tim bot static when animations disabled` (MediaQuery `disableAnimations: true`, pump 1 s → không có frame scheduled: `tester.hasRunningAnimations == false`).
- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Implement (TimBot: `Ticker`/`AnimationController` + vẽ vùng ảnh bằng `CustomPainter` `canvas.drawImageRect`).
- [ ] **Step 4:** PASS, analyze, format. `fvm flutter run` trên iOS Simulator thấy app mở với theme đúng.
- [ ] **Step 5:** Để thay đổi cho user review.

### Task 6: Onboarding (wizard + giọng nói)

**Files:** Create `mobile/lib/screens/onboarding.dart`; Modify `mobile/lib/main.dart`, `ios/Runner/Info.plist` (`NSMicrophoneUsageDescription`), `android/app/src/main/AndroidManifest.xml` (`RECORD_AUDIO`, `INTERNET`); Test `mobile/test/onboarding_test.dart`.

**Interfaces:**
- Consumes: `Store.saveProfile`, `Api.onboarding`, `TimBot`, `t`.
- Produces: `OnboardingScreen({required Store store, required Api api, Profile? initial, required void Function(Profile) onDone})`.

Luồng: 4 bước (ngôn ngữ → bạn gái/trai → tên ≤60 → xác nhận), Back giữ giá trị, Next disabled khi bước hiện tại thiếu. Nút ghi âm: `record` AAC (`AudioEncoder.aacLc`), auto dừng ở 30 s, data URL `data:audio/mp4;base64,…`; >2 MB → lỗi, không gửi. Kết quả `null` field → giữ giá trị đang có; nhảy tới bước xác nhận nếu đủ 3 field, nếu không về bước đầu tiên còn thiếu. Quyền mic bị từ chối → ẩn nút + hint `t('Chưa có quyền micro, bạn nhập tay nhé.')`. Bot: greet khi mở, choose ở bước 1–2, input ở bước 3.

- [ ] **Step 1: Widget test fail**: `wizard back keeps values`; `cannot continue without direction`; `voice result fills fields and jumps to review` (Api giả trả `{language:'en', direction:'bf', partnerName:'Emma'}`; tiêm `Future<String?> Function() recordAudio` qua constructor để test không cần mic); `voice null field stays on missing step`; `confirm saves profile and calls onDone`.
- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS, analyze, format; chạy tay trên simulator: ghi âm "Dùng tiếng Anh, giải mã bạn gái, tên là Emma" với `vercel dev`.
- [ ] **Step 5:** Cập nhật `docs/project-hub.html` (mobile onboarding: implemented / unit-verified). Để thay đổi cho user review.

### Task 7: Màn giải mã + kết quả + hỏi tiếp + TTS

**Files:** Create `mobile/lib/screens/decode.dart`, `mobile/test/decode_flow_test.dart`; Modify `ios/Runner/Info.plist` (`NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`).

**Interfaces:**
- Consumes: `Api.translate`, `Api.speak`, `Store.saveConversation`, `Conversation`, `Turn`, `TimBot`, `DangerMeter`, `maxConversationTurns`.
- Produces: `DecodeScreen({required Store store, required Api api, required Profile profile, Conversation? resume, String? initialImageDataUrl, required VoidCallback onReset, required VoidCallback onOpenHistory})`; `Future<String?> pickImageDataUrl(ImageSource source)` (top-level, `image_picker` `maxWidth: 1600, imageQuality: 80`, rồi gọi `fileToDataUrl`); `Future<String> fileToDataUrl(String path)` (đọc file → `data:image/<jpeg|png>;base64,…`, dùng lại ở Task 9).

Hành vi (mirror `js/app.js` `decode()` / `chooseResponse()`):
- Input text (≤500) + context (≤1000, chỉ sửa ở lượt đầu) + ảnh (camera/thư viện, có nút xóa). Data URL >4 MB → lỗi `t('Ảnh nặng quá (tối đa 4 MB).')`, không gọi API.
- Giải mã: Bot `waiting`; dòng loading xoay câu mỗi 1.1 s; `conversationVersion` tăng khi reset/cuộc mới — response về với version cũ thì bỏ.
- Kết quả: meaning (nền lavender), DangerMeter, reply (mint), avoid (primary-soft), nút đọc meaning qua `speak` → `just_audio` (`AudioSource` từ bytes); Bot `reading` khi phát. Haptic: `<40` light, `40–69` medium, `≥70` heavy.
- Lượt từ ảnh: ô "Lời đọc từ ảnh" điền sẵn `sourceText`; rỗng hoặc >1000 → không cho chọn câu.
- Chọn reply/avoid → `selection`, `selectedReply` = câu tương ứng → `saveConversation`; ô "Câu bạn thực sự đã gửi" (tùy chọn) ghi vào `sentReply` của lượt trước khi giải mã lượt sau. Đạt 10 lượt → nút giải mã disabled + `t('Đã đạt giới hạn. Bắt đầu cuộc trò chuyện mới để hỏi tiếp.')`. Lượt trước chưa chọn → disabled.
- Dừng audio khi giải mã mới / reset / rời màn.

- [ ] **Step 1: Widget test fail** (Api + Store giả):
  - `decode → result → choose → second turn sends history` (request 2 có `history` 1 phần tử, `selection: 'reply'`).
  - `turn limit disables decode` (resume conversation 10 lượt đã chọn).
  - `oversized image blocked` (initialImageDataUrl dài > 4·1024·1024 → thấy lỗi, Api không bị gọi).
  - `image turn requires source text` (sourceText `''` → nút chọn disabled đến khi nhập).
  - `stale response ignored` (Completer chưa resolve → bấm "Cuộc trò chuyện mới" → resolve → không có kết quả hiển thị, store không lưu).
  - `api error shown and input kept`.
- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS, analyze, format; chạy tay: text, ảnh từ thư viện, TTS, 2 lượt.
- [ ] **Step 5:** Cập nhật project hub. Để thay đổi cho user review.

### Task 8: Lịch sử

**Files:** Create `mobile/lib/screens/history.dart`; Modify `mobile/lib/main.dart`; Test thêm vào `mobile/test/decode_flow_test.dart` hoặc `history_test.dart`.

**Interfaces:**
- Consumes: `Store.loadConversations/deleteConversation`, `DecodeScreen(resume:)`.
- Produces: `HistoryScreen({required Store store, required void Function(Conversation) onOpen})`.

Danh sách: tên người ấy + text lượt đầu (cắt 60 ký tự) + số lượt + ngày; mở → `DecodeScreen(resume: c)`; xóa có hộp thoại xác nhận. Rỗng → `t('Chưa có lịch sử đã lưu.')`. Hint quyền riêng tư như web (lưu trên thiết bị, người dùng chung máy có thể xem).

- [ ] **Step 1: Test fail**: `lists saved conversations`, `delete asks confirmation then removes`, `open resumes conversation`, `empty state`.
- [ ] **Step 2:** Chạy → FAIL. **Step 3:** Implement. **Step 4:** PASS, analyze, format.
- [ ] **Step 5:** Cập nhật project hub. Để thay đổi cho user review.

### Task 9: Share sheet

**Files:** Create `mobile/lib/share_intake.dart`, `mobile/test/share_intake_test.dart`, `mobile/ios/ShareExtension/*` (target Xcode); Modify `mobile/lib/main.dart`, `ios/Runner/Runner.entitlements` + `ShareExtension.entitlements` (App Group `group.com.studioapp.thongdichtinhyeu`), `ios/Runner/Info.plist` (`CFBundleURLTypes` scheme `ShareMedia-com.studioapp.thongdichtinhyeu`), `AndroidManifest.xml` (intent-filter `SEND` `image/*`, `launchMode="singleTask"`).

**Interfaces:**
- Consumes: `fileToDataUrl(String path)` (Task 7). Ảnh share không qua `image_picker` nên không được nén; nếu >4 MB thì DecodeScreen báo lỗi như Review Focus #2.
- Produces: `class ShareIntake extends ChangeNotifier { ShareIntake({Stream<List<String>>? stream, Future<List<String>> Function()? initial}); String? pendingImagePath; void consume(); }` — mặc định nối `ReceiveSharingIntent.instance.getMediaStream()` / `getInitialMedia()`, lấy path ảnh đầu tiên.
- `App` lắng nghe `ShareIntake`: có `pendingImagePath` + có profile → mở `DecodeScreen(initialImageDataUrl:)` (cuộc mới) rồi `consume()`; chưa có profile → giữ tới khi onboarding xong.

- [ ] **Step 1: Test fail**: `initial share sets pending`, `stream share sets pending`, `multiple images takes first`, `pending image survives onboarding` (widget test `App` với Store rỗng + ShareIntake giả → hoàn tất onboarding → DecodeScreen có ảnh).
- [ ] **Step 2:** Chạy → FAIL. **Step 3:** Implement + cấu hình native theo README của `receive_sharing_intent` (iOS Share Extension `ShareViewController: RSIShareViewController`, deployment target khớp Runner).
- [ ] **Step 4:** PASS, analyze, format. Chạy tay: iOS Simulator → Photos → Share → app; Android emulator → Google Photos → Share → app; cả cold start và khi app đang mở.
- [ ] **Step 5:** Cập nhật project hub. Để thay đổi cho user review.

### Task 10: Kiểm tra cuối + project hub

- [ ] **Step 1:** `npm test` (root) PASS; `cd mobile && fvm flutter test && fvm flutter analyze` PASS.
- [ ] **Step 2:** Build: `fvm flutter build ios --simulator --dart-define=API_BASE_URL=<url>` và `fvm flutter build apk --debug --dart-define=API_BASE_URL=<url>` thành công.
- [ ] **Step 3:** Chạy tay trên iOS Simulator + Android emulator theo checklist spec: onboarding tay + giọng nói, giải mã text/ảnh, TTS, 2 lượt + lịch sử, share sheet, từ chối quyền mic/ảnh, API lỗi (tắt server), giảm chuyển động. Chụp màn hình vào `.manual-test/mobile/`.
- [ ] **Step 4:** Cập nhật `docs/project-hub.html`: mục Mobile app với trạng thái từng tính năng, kết quả test thực tế, giới hạn còn lại (chưa submit store, rate limit cách nào), snapshot date. Giữ nguyên kết quả manual test user đã nhập.
- [ ] **Step 5:** Báo cáo cho user; không commit.
