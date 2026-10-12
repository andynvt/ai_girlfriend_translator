# Slide demo HTML

Chạy `npm run hub`, mở http://127.0.0.1:8765/demo-slides.html. Có 10 slide với hai phiên bản Việt/English, ngày demo 12/10/2026. Nút English / Tiếng Việt ở thanh điều khiển đổi nội dung mà giữ nguyên vị trí slide. Demo tự động dùng ngôn ngữ đang chọn; nút ngôn ngữ tạm khóa khi đang chạy/khởi động app. Phím ←/→, Home/End chuyển slide; F bật/tắt toàn màn hình. Mở HTML trực tiếp chỉ xem nội dung; demo cần Hub.

## Demo ngay trong slide

- Slide 8: bấm **Khởi động app**, đợi thông báo sẵn sàng, rồi bấm **Chạy tự động**. App chạy trong iframe ngay trên slide, không mở cửa sổ runner khác.
- Bốn lượt minh họa ba nhóm tình huống: thiếu bối cảnh, cùng câu trong hai bối cảnh, ảnh chat giả. Mỗi kết quả giữ 5 giây. **Dừng** ngăn lượt tiếp theo; lượt API đã gửi có thể vẫn hoàn tất ở server.
- Slide 9: khán giả hoàn tất onboarding và thao tác trực tiếp trong iframe manual. Có nút tải lại app. Chỉ dùng dữ liệu giả/được đồng ý chia sẻ.
- Demo dùng API local thật và có thể phát sinh phí AI. Không tự chấm nội dung hoặc ghi manual Pass. Runner Playwright 12 case vẫn có ở Hub như trước.
- Hub phục vụ đúng tài nguyên app ở `/demo-app/`; chỉ proxy translate/speak/onboarding tới app cố định `127.0.0.1:3000`. Không proxy API quản trị hoặc URL tùy ý.
- Vercel dev phải có CLI/project đã liên kết và `.env` chứa API key. `.vercelignore` loại `mobile/` khỏi web để tránh watcher quét build Flutter gây `EMFILE`, đồng thời không đưa source/build mobile lên web.

Chữ nội dung desktop khoảng 28 px, chú thích 22 px và nút 22 px. Dùng `-apple-system`/SF Pro trên macOS và iOS; hệ thống khác dùng font fallback. Không đóng gói/phân phối binary font Apple. App nhúng cũng dùng SF system font và cỡ chữ lớn hơn.

## Link production và QR cuối bài

QR/link cố định: https://aigirlfriend-demo.vercel.app/. QR luôn hiển thị, kể cả khi mở file HTML trực tiếp; không cần DEMO_APP_URL, admin token hoặc Redis. Người trình bày tự quản lý quyền truy cập trong Vercel Console; slide không xác minh truy cập và không tự đóng sau 60 phút.

Chỉ `OPENAI_API_KEY` bắt buộc trong .env local và Vercel Production. Đã bỏ cấu hình model/TTS/transcribe tùy chọn khỏi .env và .env.example; server dùng các mặc định có sẵn. Chọn model trong Hub vẫn có thể tạo lại cấu hình model khi cần. Rate limit Redis hiện có vẫn được giữ trong code cho các môi trường khác, nhưng không cần cấu hình Redis cho buổi demo này. Public gate riêng và API demo-access đã được gỡ.

[QuickChart](https://quickchart.io/documentation/qr-codes/) render QR bằng URL public và cần internet. QR lỗi vẫn có link mở trực tiếp. Không đặt API key trong HTML/QR. Quét thử bằng điện thoại trước buổi trình diễn.

## Kiểm chứng

```sh
npm test
node scripts/check-demo-slides.mjs
```

Browser check dùng app thật trong iframe với API mock: desktop/mobile, font/cỡ chữ, tự động bốn lượt gồm ảnh, dừng, manual onboarding/giải mã, QR production cố định/fallback và không còn public gate và file standalone. Ảnh ở `.manual-test/verification/slides/`. Không gọi AI trả phí hoặc đổi quyền truy cập trên hosting; cần kiểm riêng quét QR và mic/audio thật.
