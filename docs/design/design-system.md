# Design system — Thông Dịch Viên Tình Yêu

Hướng Cupcake: dễ thương, pastel, chữ rõ và kết quả nổi bật khi demo. Tham khảo https://daisyui.com/docs/themes/; triển khai bằng CSS thuần, không thêm dependency. Token nguồn nằm trong `:root` của `css/app.css`; style onboarding ở `css/onboarding.css`.

| Vai trò | Token / giá trị |
| --- | --- |
| Nền / bề mặt | `--background: #fff8f3`, `--surface: #fff` |
| Hành động chính | `--primary: #b4235a`, chữ trắng |
| Nền hồng / lavender / mint | `--primary-soft: #ffe6ee`, `--lavender: #f0e9ff`, `--mint: #e6f6ed` |
| Chữ / chữ phụ | `--text: #291b23`, `--muted: #715363` |
| Focus | `--focus: #6744a3`, outline 3px |
| Trạng thái | `--safe: #237a4b`, `--warning: #946000`, `--danger: #b42332` |
| Spacing | 4 / 8 / 12 / 16 / 24 / 32px |
| Bo góc | Card 24px, input 16px, nút/chip 999px |
| Font | system-ui, sans-serif; nội dung 18–20px, tiêu đề 28–40px |

## Thành phần và hành vi

- Một cột trên điện thoại; hai cột từ 860px; chiều rộng trang tối đa 1120px.
- Nút có vùng bấm tối thiểu 48px, trạng thái focus/hover/disabled; nút giải mã là hành động chính.
- Toggle bạn gái/bạn trai dùng `aria-pressed`; textarea có label và hướng dẫn.
- Chip chọn câu ví dụ và giải mã ngay. Ảnh đã chọn có nút xóa riêng.
- Kết quả dùng bong bóng chat: ý nghĩa lavender, câu nên trả lời mint, câu cần tránh hồng.
- Tim Bot trái tim đất sét 2.5D dùng sprite atlas nền trong suốt (5 trạng thái, 4 frame/trạng thái). Mức nguy hiểm: dưới 40 “Êm đẹp”, 40–69 “Có mùi dỗi”, từ 70 “Báo động đỏ”. Màu luôn đi cùng số và nhãn, không diễn đạt chỉ bằng màu.
- Bot chào khi mở onboarding, chỉ lựa chọn khi focus select, mời nhập khi focus ô tên/lời nhắn/bối cảnh, lặp suy nghĩ khi chờ giải mã, đọc khi audio phát; dừng audio khi giải mã mới, làm lại thiết lập hoặc rời trang. Bot thở nhẹ liên tục, hover chạy lại cử chỉ; sau khoảng 12 giây không thao tác tự gợi ý theo màn hình. Không tự nhắc khi tab ẩn, thu âm hoặc chờ/phát API/audio. Chế độ giảm chuyển động dùng frame tĩnh.
- Loading có thông báo trạng thái; lỗi dùng `role=alert`; kết quả có `aria-live=polite`.
- Animation kết quả 250ms, thanh nguy hiểm 600ms; tắt chuyển động khi người dùng yêu cầu giảm chuyển động.
- Nội dung tiếng Việt, hài hước nhẹ; nhắc người dùng đây là giải mã cho vui.

## Kiểm tra trước demo

Kiểm tra 375px và desktop, nội dung dài, bàn phím, giảm chuyển động, lỗi API, upload/xóa ảnh và đọc giọng. Kiểm tra độ rõ trên máy chiếu thật. Không thêm dark mode hoặc tải font ngoài cho bản demo.

### Tim onboarding

Bot và speech bubble đặt cạnh nhau. Mỗi màn một quyết định: ngôn ngữ, thẻ người ấy, tên, xác nhận. Chip hiển thị lựa chọn trước; Back giữ giá trị, lỗi dùng role=alert, bubble dùng aria-live=polite. Bản Việt/English có cùng luồng. Bubble trong màn nhập nhắc gửi lời nhắn hoặc ảnh chat. Transition 250ms và sprite dùng thiết lập reduced-motion hiện có.

### Lựa chọn kết quả và lịch sử · 12/10/2026

Header kết quả nêu câu hỏi, hai thẻ cùng khoảng cách/bo góc. Hành động chính “Chọn & hỏi tiếp”, câu cần tránh dùng nút viền; lựa chọn hiện “✓ Đã chọn” cùng aria-pressed. Nút lưu phụ hiển thị thành công/thử lại theo storage thực tế.

Lịch sử kiểu iMessage: lời người ấy bên trái xám, câu bạn chọn/gửi bên phải xanh (#1264d6); nhãn phân biệt lựa chọn chưa xác nhận gửi. Phân tích trong details/summary hỗ trợ bàn phím, không lẫn với tin nhắn. Danh sách cuộc có preview/thời gian và trạng thái đang xem; sidebar desktop, cuộn ngang mobile. Không thay schema lưu trữ hoặc API.

### Màn chat hợp nhất · 12/10/2026

App dùng một khung chat cao theo 100dvh, header tên/lượt và composer tách khỏi vùng cuộn. Lịch sử và tùy chọn mở bằng details ở header; ảnh/bối cảnh mở qua ＋. Tin đến xám bên trái, câu chọn/gửi xanh bên phải, nhãn phân biệt chưa xác nhận gửi. Phân tích Tim nằm tại cùng lượt, mở khi chưa chọn và thu gọn sau chọn; các lượt cũ chỉ giữ phần mở rộng. Không dựng thêm kết quả ở panel riêng. UI chat thay bố cục hai cột và sidebar lịch sử mô tả ở phần trước; onboarding giữ giao diện hiện có.

### Responsive mobile · 12/10/2026

Chat fullscreen đến 768px, một vùng cuộn bên trong; header tên một dòng ellipsis, composer có safe-area. Vùng bấm summary tối thiểu 44px, ô sửa phản hồi font 16px. Composer dùng field-sizing: content (browser không hỗ trợ giữ textarea vốn có), tối đa 96px và 48px khi màn thấp. Bối cảnh mở dưới dạng sheet có nút Xong; header menu neo trong khung chat. Kiểm thêm 320px, xoay ngang và viewport thấp; bàn phím/notch/browser bar thật cần manual.
