# Slide demo HTML

Mở `docs/demo-slides.html` trực tiếp để xem nội dung. Để chạy runner và điều khiển public:

```sh
npm run hub
```

Mở http://127.0.0.1:8765/demo-slides.html. Phím ←/→, Home/End chuyển slide; F bật/tắt toàn màn hình. Có 10 slide tiếng Việt, demo tự động TC01/TC02/TC05, phần mời khán giả thao tác và QR cuối bài. URL trình diễn mặc định là app local port 3000; cần khởi chạy app từ Hub hoặc dùng app đã deploy. Runner cần Playwright/Chromium như `manual-demo.md`. Demo thật có thể gọi API tính phí.

## Chuẩn bị public

- `.env` local: `DEMO_APP_URL=https://<domain-app>` (origin HTTPS, không path/query), `DEMO_ADMIN_TOKEN=<secret-ngẫu-nhiên-dài>`.
- App hosting: cùng `DEMO_ADMIN_TOKEN`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. Cấu hình `OPENAI_API_KEY` như app hiện có.
- Tách Redis hoặc `DEMO_ACCESS_KEY` giữa production/preview/local. Mặc định key là `thong-dich-tinh-yeu:demo:public`.
- Bản app cần có `api/demo-access.js` cùng gate ở translate/speak/onboarding. Slide và Hub giữ local, được loại khỏi deployment bởi `.vercelignore`.
- Không nhập token vào HTML, URL, QR hoặc trình duyệt. Hub đọc từ `.env` và proxy request xác thực đến URL cố định ở server; không theo redirect.

Khi hosting có `DEMO_ADMIN_TOKEN`, ba API trả phí mặc định đóng. Redis lỗi/thiếu thì trả 503, không cho qua. Nếu không cấu hình token, app giữ hành vi mở như trước; slide không thể nhận trạng thái public từ API quản trị.

Ở slide cuối, đọc trạng thái rồi bấm **Bật public · 60 phút**. Redis tự hết hạn sau 60 phút, hoặc bấm **Tắt public** để đóng sớm. QR và link chỉ hiện khi server xác nhận mở. Trạng thái được đọc lại mỗi 5 giây khi ở slide cuối; lỗi kết nối làm ẩn QR và vô hiệu hóa toggle cho đến lần đọc thành công. Nếu muốn demo trên app có gate, mở public trước khi chạy runner/manual.

Tắt public chặn lượt mới qua cả ba API, kể cả người đã giữ link. Trang HTML, kết quả và lịch sử đã tải vẫn xem được; lượt đang xử lý có thể hoàn tất. Không có đăng nhập/quyền presenter riêng cho các API trả phí.

QR được render bằng [QuickChart](https://quickchart.io/documentation/qr-codes/), cần internet và gửi URL public cho dịch vụ đó. Nếu tải QR thất bại, giữ link để khán giả mở trực tiếp. Quét QR thật trước buổi trình diễn.

## Kiểm chứng

```sh
npm test
node scripts/check-demo-slides.mjs
```

Script browser dùng backend và runner mock; kiểm tra 10 slide ở 1440×900 và 375×812, chuyển trang/bàn phím, URL QR và fallback khi dịch vụ QR lỗi, public mở/đóng/lỗi và runner khởi chạy/dừng qua Hub. Ảnh trong `.manual-test/verification/slides/`. Không gọi AI trả phí, không đổi public trên hosting và không ghi kết quả manual Pass. Cần kiểm tra riêng deployment, Redis thật, quét QR bằng điện thoại và demo AI/mic/audio thật.
