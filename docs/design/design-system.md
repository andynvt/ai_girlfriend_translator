# Design system — Thông Dịch Viên Tình Yêu

Hướng Cupcake: dễ thương, pastel, chữ rõ và kết quả nổi bật khi demo. Tham khảo https://daisyui.com/docs/themes/; triển khai bằng CSS thuần, không thêm dependency. Token nguồn nằm trong `:root` của `index.html`.

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
- Mascot trái tim CSS/chữ: dưới 40 “Êm đẹp”, 40–69 “Có mùi dỗi”, từ 70 “Báo động đỏ”. Màu luôn đi cùng số và nhãn, không diễn đạt chỉ bằng màu.
- Loading có thông báo trạng thái; lỗi dùng `role=alert`; kết quả có `aria-live=polite`.
- Animation kết quả 250ms, thanh nguy hiểm 600ms; tắt chuyển động khi người dùng yêu cầu giảm chuyển động.
- Nội dung tiếng Việt, hài hước nhẹ; nhắc người dùng đây là giải mã cho vui.

## Kiểm tra trước demo

Kiểm tra 375px và desktop, nội dung dài, bàn phím, giảm chuyển động, lỗi API, upload/xóa ảnh và đọc giọng. Kiểm tra độ rõ trên máy chiếu thật. Không thêm dark mode hoặc tải font ngoài cho bản demo.
