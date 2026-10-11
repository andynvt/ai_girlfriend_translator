# Demo tuần tự có voiceover

Flow mới: sau kết quả, chọn **Nên trả lời** hoặc **Tuyệt đối đừng nói** để lưu và hỏi tiếp. Các tình huống độc lập dùng **Cuộc trò chuyện mới**. Xem [kiểm tra lịch sử và giới hạn](manual-history.md). Xác nhận profile mới bắt đầu cuộc mới; hủy onboarding giữ cuộc cũ.

Runner dùng Playwright mở một cửa sổ Chromium, tự điền dữ liệu, thao tác và kiểm tra theo 12 case trong `manual-test.md`. Lời dẫn tiếng Anh theo `manual-demo-en.md`, đọc bằng macOS Samantha ở 1,15×. Không có bước xác nhận hoặc nhập ghi chú bắt buộc; cửa sổ app được đưa lên trước mỗi lời dẫn.

## Chạy Trong Hub

1. Chạy `npm run hub`, mở http://127.0.0.1:8765/#manual-demo và tải lại trang.
2. Chạy app local trong Tools nếu chưa sẵn sàng.
3. Chọn case, URL và voice; bấm **Chạy demo**.
4. Demo chạy các case tuần tự. Theo dõi app, nghe lời dẫn; transcript nằm trong log Tools.
5. **Dừng demo** dừng riêng runner và voice, không dừng app local. Bằng chứng của các case đã hoàn tất được giữ.

Phiên demo cũ đang chờ xác nhận cần dừng rồi chạy lại để dùng luồng mới. Runner dùng hồ sơ giả Mai Demo, ngôn ngữ tiếng Việt và lựa chọn Bạn gái trước mỗi case. Không mở tab/cửa sổ narrator riêng, không yêu cầu quay lại Hub để tiếp tục.

## Chạy Từ Terminal

Yêu cầu Node.js 24+, Playwright và Chromium:

```sh
npm install
npx --no-install playwright install chromium
npm run hub
npm run demo:manual -- --cases TC01,TC02 --url http://127.0.0.1:3000
npm run demo:manual -- --voice off
```

App cần backend hoạt động và API key ở server. Runner không tự deploy hoặc đổi model. Ctrl+C dừng lượt demo; không cần terminal tương tác để trả lời câu hỏi.

## Voiceover Và Checkpoint

Giọng local dùng `/usr/bin/say -v Samantha -r 201.25`: 201,25 từ/phút = 1,15× mốc 175. Không gọi OpenAI TTS, không đọc API key và không tạo audio cache. Nếu voice lỗi, runner tiếp tục bằng chữ. `--voice off` tắt giọng, vẫn giữ log.

App, dữ liệu test và output vẫn tiếng Việt. Lời dẫn hướng dẫn kiểm tra output, không tự dịch output. API giải mã và nút đọc kết quả của app vẫn có thể tính phí.

Checkpoint nội dung, mic, âm thanh và bàn phím được đọc và lưu là **chưa xác nhận**, nghỉ 1,5 giây rồi tiếp tục. Không chờ thao tác người dùng và không coi checkpoint đó là đã Pass. TC08 không tự cấp quyền/nói vào mic; TC09 không tự chấm chất lượng giọng. Muốn kiểm tra các phần này, chạy manual riêng theo kịch bản.

## Kết Quả

- `.manual-test/<run-id>/`: request/output/screenshot, bằng chứng từng case và report.
- `.manual-test/results.json`: report gần nhất, có `mode: automatic`; chỉ chạy một runner cùng lúc.
- Case có lỗi assertion ghi `fail`; case hoàn tất kiểm tra tự động ghi `blocked` để thể hiện review manual còn thiếu. Đây không phải kết quả manual Pass.
- Hub tự nối bằng chứng vào ghi chú, **không thay đổi trạng thái manual** hoặc xóa ghi chú cũ. Kết quả tự động nằm trong report/log.
- Dữ liệu và bằng chứng giữ local, loại khỏi Git/Vercel; chỉ dùng chat giả. File HTML và URL Hub có localStorage riêng.

## Kiểm Chứng

```sh
npm test
npm run test:demo
```

Smoke dùng backend mock, chạy 12 luồng/assertion và chạy TC01 rồi TC07 từ Hub bằng runner thật, không gửi câu trả lời. Kiểm tra không có prompt, thứ tự case, report, giữ nguyên kết quả manual/ghi chú và bố cục 375/1100 px. Không gọi API trả phí, không ghi report vào sổ thật. Screenshot ở `.manual-test/verification/`; chất lượng nội dung, mic, âm thanh và thiết bị thật chưa được chấm.
