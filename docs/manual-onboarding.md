# Onboarding và English — kiểm tra manual

Flow mới: sau kết quả, chọn **Nên trả lời** hoặc **Tuyệt đối đừng nói** để lưu và hỏi tiếp. Các tình huống độc lập dùng **Cuộc trò chuyện mới**. Xem [kiểm tra lịch sử và giới hạn](manual-history.md). Xác nhận profile mới bắt đầu cuộc mới; hủy onboarding giữ cuộc cũ.

Cập nhật 11/10/2026. Các mục dưới đây **chưa được đánh dấu Pass manual**. `npm run test:onboarding` kiểm tra Chromium với microphone giả và backend mock; `npm test` mock OpenAI. Không dùng kết quả mock để xác nhận chất lượng nhận diện hoặc nội dung AI.

## Chuẩn bị

- Chạy app với backend có `/api/onboarding`, `/api/translate`, `/api/speak` và `OPENAI_API_KEY` phía server. Model speech-to-text mặc định `gpt-4o-mini-transcribe`, có thể cấu hình `OPENAI_TRANSCRIBE_MODEL`.
- Dùng localhost hoặc HTTPS, cấp quyền microphone. Thử Chrome desktop, Chrome Android và Safari iPhone trên thiết bị thật.
- Chỉ dùng tên và lời nhắn giả. Onboarding lưu ngôn ngữ, đối tượng và tên tại `love-interpreter.preferences.v1` trong localStorage; không lưu audio hoặc transcript vào cấu hình. Audio được gửi server/OpenAI để xử lý.
- Xóa riêng khóa cấu hình trên để thử lần đầu; không xóa dữ liệu sổ tiến độ/ghi chú.

## Nhập tay, xem lại và khôi phục

1. Lần đầu thấy Tim chào trong bubble, chưa thấy màn giải mã. Chọn English → Meet Tim → Girlfriend → Continue → Emma. Bấm Back và Continue để kiểm tra lựa chọn/tên còn nguyên; thử Continue khi chưa chọn người ấy để thấy lỗi inline.
2. Toàn bộ nhãn, hướng dẫn, lỗi và accessibility đổi sang English.
3. Bấm Review setup: thấy đúng ba lựa chọn, chưa lưu cấu hình. Bấm Edit để sửa tên.
4. Bubble xác nhận có tên Emma và ngôn ngữ đã chọn. Confirm and start: vào app với “What did Emma say?” và bubble hướng dẫn nhập tin nhắn/ảnh chat. Reload vẫn giữ cấu hình.
5. Thử đủ Việt/English × bạn gái/bạn trai. Thử tên có dấu, tên rỗng/chỉ khoảng trắng và quá 60 ký tự. Tên được hiển thị như văn bản, không thực thi HTML.
6. Sau onboarding không còn nút chọn Girlfriend/Boyfriend trên màn giải mã. Start over mở onboarding từ bước đầu, giữ ngôn ngữ hiện tại nhưng để trống đối tượng và tên; Cancel changes giữ cấu hình và lời nhắn cũ. Chỉ Confirm and start mới lưu thiết lập mới. Reload sau xác nhận phải khôi phục đúng thiết lập mới. Nếu localStorage bị chặn, vẫn vào app được trong phiên hiện tại và có thông báo không lưu được.

**Mong đợi:** Không bỏ qua dữ liệu bắt buộc, không mất dữ liệu nhập giải mã khi sửa thiết lập, không cần onboarding lại khi cấu hình đã lưu hợp lệ.

## Thu âm và thiết lập bằng lời nói

1. Chọn Set up by voice, cấp quyền, nói “Use English. Decode my girlfriend. Her name is Emma.”, bấm Stop and process.
2. Kiểm tra transcript và các lựa chọn được điền đúng; Tim chuyển đến bước chọn người ấy nếu còn thiếu, hoặc bước tên; chưa tự lưu hoặc vào app. Sửa tên nếu nhận sai rồi xác nhận.
3. Thử “Dùng tiếng Việt, giải mã bạn trai, tên là Minh”. Thử nói tiếng Việt nhưng chọn kết quả tiếng Anh và ngược lại.
4. Thử chỉ nói “Decode my boyfriend”: trường được nhận diện cập nhật; trường thiếu giữ nguyên lựa chọn đang nhập, không tự bịa tên/ngôn ngữ. Nếu còn trống, phải bổ sung trước khi lưu.
5. Thử tiếng ồn, im lặng, tên nước ngoài, câu mâu thuẫn hoặc không có yêu cầu thiết lập. Kiểm tra khả năng sửa hoặc ghi lại.
6. Hủy khi đang xin quyền, đang ghi hoặc đang xử lý. Không áp dụng kết quả đến muộn; các nút nhập tay mở lại. Kiểm tra chỉ báo microphone tắt sau dừng/hủy; nếu cấp quyền sau khi đã hủy, stream vừa cấp cũng phải được dừng.
7. Từ chối quyền mic, mất mạng, lỗi API hoặc trình duyệt không hỗ trợ thu âm: có thông báo, vẫn nhập tay được.
8. Để ghi quá 30 giây: trình duyệt tự dừng và xử lý. Server kiểm tra định dạng, base64 và giới hạn audio 2 MB; giới hạn thời lượng 30 giây thực hiện ở client.

**Mong đợi:** Không tự xác nhận hoặc ghi đè cấu hình đã lưu. Audio không lưu vào localStorage/lịch sử app. Không thực hiện lệnh ngoài ba trường onboarding.

## English end-to-end và giọng đọc

1. English / Girlfriend / Emma, nhập “I'm fine” cùng context “We argued because I forgot our date.”
2. Kiểm tra ba phần nội dung trả về bằng English, không lẫn đại từ anh/em; mức nguy hiểm phù hợp bối cảnh, không mặc định biết suy nghĩ người ấy.
3. Thử English slang, ảnh chat English và đầu vào tiếng Việt trong chế độ English: kết quả vẫn English.
4. Thử cả hai đối tượng và nhấn Read aloud; nghe đúng ngôn ngữ, giọng và cảm xúc.
5. Sau khi giải mã bằng English, mở thiết lập và đổi ngôn ngữ nháp rồi hủy: đọc kết quả cũ vẫn bằng English và đúng đối tượng cũ. Xác nhận profile mới thì bắt đầu cuộc mới. Thử lại sau một lần giải mã lỗi.
6. Kiểm tra thiếu đầu vào, lỗi API, retry, viewport hẹp, Tab/Shift Tab/Enter/Space và reduced motion. Lỗi tiếng Anh phải hiển thị trong chế độ English.

**Mong đợi:** Cấu hình ngôn ngữ quyết định GUI và nội dung kết quả; TTS giữ ngôn ngữ/đối tượng của kết quả thành công. Không bị mất kết quả cũ khi request mới lỗi.

Nguồn triển khai speech-to-text: [official OpenAI documentation](https://developers.openai.com/api/docs/guides/speech-to-text).
