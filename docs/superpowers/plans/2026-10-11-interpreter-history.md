# Kế hoạch: thông dịch liên tục và lưu lịch sử

Ngày: 11/10/2026. Trạng thái: đã triển khai; 59/59 Node test và browser history 375/1100px bằng mock pass ngày 11/10/2026. Chưa kiểm chất lượng model/thiết bị thật.

## Mục tiêu và lựa chọn đã chốt

Cho user phân tích liên tục cuộc trò chuyện với cùng một người, giữ bối cảnh và các lượt trước. Demo mặc định 10 lượt phân tích thành công cho mỗi cuộc trò chuyện; tăng được qua cấu hình trong HTML.

User đã chốt: hai lựa chọn là **Nên trả lời** (`reply`) và **Tuyệt đối đừng nói** (`avoid`) trong kết quả AI. Đây là hai câu để chọn và lưu vào lịch sử. Sau khi chọn, app hỏi người ấy phản hồi thế nào rồi tiếp tục phân tích. Lựa chọn avoid là một nhánh tình huống cần phân tích, không đổi nhãn thành lời khuyên nên gửi và không tự gửi tin nhắn cho người ấy.

## Flow đề xuất

1. Onboarding hiện tại → bắt đầu cuộc trò chuyện mới; nhập câu đầu và bối cảnh tùy chọn.
2. Phân tích → hiện ý nghĩa, nguy hiểm, nên trả lời, nên tránh như hiện tại; chỉ thêm lịch sử khi API thành công.
3. Cho chọn một trong hai câu **Nên trả lời** / **Tuyệt đối đừng nói**. Chọn câu nào thì lưu lượt phân tích và lựa chọn đó vào lịch sử thiết bị, rồi mở câu hỏi “Cô ấy/anh ấy trả lời thế nào?”. Hiện câu đã chọn, cho sửa nếu user thực tế gửi khác; không tự gửi câu đó ra ứng dụng chat.
4. User nhập phản hồi mới bằng text, mic hoặc ảnh rồi phân tích tiếp. Request mang bối cảnh gốc và toàn bộ lượt trước trong phiên, theo thứ tự. Không xóa bối cảnh khi làm trống ô câu mới.
5. Lặp đến lượt 10/10. Vẫn cho lưu/xem/đọc kết quả cuối; khóa phân tích tiếp và hiện “Cuộc trò chuyện mới”. Không cho retry hoặc bấm lưu hai lần tăng lượt.
6. Mở Lịch sử → xem các cuộc đã lưu và tiếp tục từ lượt đã lưu gần nhất, hoặc xóa cuộc đã chọn. Reload chỉ khôi phục phần đã lưu; hiển thị rõ kết quả chưa lưu sẽ mất khi đóng trang.

Luôn phân biệt **hai gợi ý AI** với **câu user đã chọn** và **câu user thực sự đã gửi**. History chứa nhánh đã chọn; không xem cả reply và avoid là sự kiện cùng xảy ra. Prompt mô tả đó là lựa chọn của user, chưa khẳng định đã gửi nếu chưa xác nhận; phản hồi tiếp theo là thông tin user cung cấp. Kết quả chưa chọn vẫn giữ trong phiên; khi chọn hoặc lưu kết quả cuối thì mới ghi thiết bị. Cho lưu kết quả cuối dù không muốn hỏi tiếp.

## Dữ liệu và cấu hình

- Một cuộc gồm id, thời gian, snapshot ngôn ngữ/đối tượng/tên, bối cảnh gốc, số lượt thành công, các lượt đã lưu và lượt phân tích đang chờ lựa chọn.
- Một lượt gồm lời người ấy, kết quả phân tích, lựa chọn reply/avoid cùng nguyên văn câu đã chọn, câu sửa/xác nhận đã gửi (nếu có) và thời gian. Lưu snapshot dữ liệu đã gửi, không lấy lại textarea có thể đã đổi trong lúc chờ API.
- Dùng localStorage với key phiên bản riêng, tách khỏi preferences và Hub. Không tài khoản/database/dependency mới. Validate dữ liệu khi khôi phục; render bằng textContent. Storage lỗi/quota đầy: giữ phiên và báo chưa lưu, không hiện lưu thành công giả.
- Với ảnh: không lưu base64 lâu dài. Bổ sung `sourceText` vào kết quả translate để trích lời/đoạn chat được dùng làm đầu vào; dùng văn bản này cho lịch sử và context tiếp theo. UI cho xem/sửa văn bản trước khi lưu hoặc hỏi tiếp, vì OCR có thể sai. Không dùng riêng meaning để thay thế lời gốc. Giới hạn và kiểm tra độ dài văn bản trích xuất.
- Trong script của `index.html`: `const DEMO_SETTINGS = { maxConversationTurns: 10 };`. Đây là setting sửa trực tiếp trong HTML, chưa cần thêm màn cài đặt. Chỉ nhận số nguyên dương trong trần server cho phép; cấu hình lỗi fallback 10.
- Server có trần history/payload cố định, độc lập với client (đề xuất tối đa 50 lượt cho bản này). API kiểm tra từng trường, số lượt, tổng ký tự trước khi gọi model; HTML chỉ cho tăng đến trần này. Đây là giới hạn flow demo, không phải rate limit hoặc hàng rào chống lạm dụng chi phí.
- Số lượt của cuộc đã lưu giữ nguyên khi mở lại; kết quả đã lưu nhưng chưa chọn nhánh vẫn có thể chọn sau khi mở lại. Khi tăng giới hạn, cuộc đang ở 10 có thể hỏi tiếp; khi giảm xuống dưới số lượt hiện có, vẫn xem/lưu được nhưng không gửi mới.

## Phạm vi file

- `index.html`: cấu hình demo, state phiên, bộ đếm, hai lựa chọn, câu hỏi tiếp, lịch sử xem/tiếp tục/xóa, lưu/khôi phục, i18n Việt/English, accessibility, tích hợp reset/loading/TTS/mic/ảnh hiện có.
- `api/translate.js`: mở rộng parseRequest cho history và câu user đã chọn/gửi; mở rộng schema/normalize cho sourceText; giữ tương thích request cũ không có history. Đưa history đã validate vào dữ liệu user, không cho client gửi system prompt hoặc role tùy ý; prompt phân biệt gợi ý với sự kiện, chỉ phân tích câu mới.
- `test/translate.test.js`: history vắng/hợp lệ/sai kiểu/quá dài/quá nhiều; payload model đúng thứ tự; sourceText và lỗi upstream. Giữ test text/ảnh/context/language cũ.
- `test/ui.test.js`: vòng lặp, chọn reply/avoid và lưu, restore, bộ đếm, retry, lỗi storage, reset và đổi profile. Mock storage hiện tại phải đổi sang lưu theo key để không lẫn preferences với history.
- `scripts/check-onboarding.mjs`, `scripts/check-manual-demo.mjs`, `scripts/check-tim-bot.mjs`, `scripts/manual-demo.mjs` và fixtures liên quan: rà soát các thao tác decode liên tiếp và kỳ vọng schema; chỉ sửa các caller bị flow mới ảnh hưởng.
- `docs/manual-test.md`, `docs/manual-demo.md`, `docs/manual-demo-en.md`, `docs/manual-onboarding.md`: bổ sung case lịch sử/giới hạn và cập nhật thao tác bị thay đổi.
- `docs/project-hub.html`: cập nhật progress, roadmap, snapshot và bằng chứng khi triển khai; nội dung nguồn không bị trạng thái local cũ ghi đè; giữ manual results/notes.
- Không cần thay `/api/speak`, `/api/onboarding` hoặc deploy config trừ khi caller thực tế buộc phải sửa.

## Thứ tự triển khai

- [x] Đã chốt hai lựa chọn reply/avoid; định nghĩa lưu lựa chọn, kết quả đang chờ chọn và câu thực tế user gửi.
- [x] Thêm validation/history và sourceText trong translate, test bằng mock trước.
- [x] Thêm state cuộc trò chuyện và flow hỏi tiếp trong HTML; khóa double-submit; API lỗi không tăng lượt hoặc mất context/kết quả cũ.
- [x] Thêm lưu/xem/tiếp tục/xóa lịch sử, xử lý storage lỗi và cấu hình 10 lượt.
- [x] Tích hợp Việt/English, focus/keyboard, TTS kết quả hiện hành, ảnh/OCR, mic; ngăn response cũ ghi vào cuộc mới khi reset hoặc đổi profile. Hủy onboarding giữ nguyên cuộc cũ; xác nhận profile mới bắt đầu cuộc mới, không trộn hai người.
- [x] Chạy npm test; browser mock ở 375/1100px cho vòng lặp, reload, đổi profile và lượt 10/11. Chỉ chạy các runner bị ảnh hưởng.
- [ ] Kiểm với model thật: cùng câu nhưng lịch sử khác nhau, câu user gửi khác gợi ý, ảnh OCR, lựa chọn avoid và câu đã sửa; kiểm TTS/mic trên thiết bị thật nếu có điều kiện. Ghi riêng những mục chưa chạy.
- [x] Cập nhật Hub theo kết quả thực tế. Không commit, push hoặc deploy.

## Tiêu chí hoàn thành

- Lượt 2+ có bối cảnh và các lượt trước đúng thứ tự; AI không xem reply gợi ý là câu đã gửi.
- Chọn reply/avoid lưu đúng câu và nhánh; reload/tiếp tục không lẫn tên/đối tượng; dữ liệu lịch sử xóa được và không lưu ảnh gốc.
- Lượt thành công thứ 10 chạy; lượt 11 bị chặn; đổi setting thành 15 cho chạy đến 15 trong trần server. Retry lỗi, TTS, xem lịch sử và thao tác lưu không tăng số lượt.
- Request cũ vẫn hoạt động; dữ liệu history hỏng hoặc quá giới hạn bị chặn trước khi gọi model.
- Không mất input/context khi API hoặc storage lỗi; không có stale response ghi vào cuộc mới; UI hai ngôn ngữ dùng được bằng bàn phím.

## Giới hạn cần hiển thị

Lịch sử nằm trên trình duyệt/thiết bị đang dùng, có thể mất khi xóa dữ liệu trình duyệt; ai dùng chung thiết bị có thể xem. Không có đồng bộ hoặc sao lưu tài khoản. Tăng số lượt làm tăng token, chi phí và độ trễ; chưa thêm tóm tắt tự động vì trần demo đủ nhỏ. Tính đúng bối cảnh, OCR và giọng đọc cần kiểm API/thiết bị thật, mock không xác nhận được.

## Bằng chứng triển khai

- `npm test`: 59/59 pass.
- `npm run test:history`: API mock + parseRequest thật, 375/1100px; 4 PNG/report tại `.manual-test/history/`. Đã xem ảnh followup mobile.
- `npm run test:onboarding`, `npm run test:bot`: pass bằng mock; onboarding dùng microphone giả.
- `npm run test:demo`: 12 case + Hub pass, giữ manual results/notes.
- Manual mới ở `docs/manual-history.md`; chưa đánh dấu model/thiết bị thật đã pass.
