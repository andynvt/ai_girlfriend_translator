# Kiểm tra thông dịch liên tục và lịch sử

Cập nhật: 12/10/2026. `npm run test:history` kiểm tra browser bằng API mock; không thay thế các bước dưới đây với model và thiết bị thật.

1. Thiết lập người ấy, nhập câu đầu; mở ＋ để điền bối cảnh. Giải mã xong phải hiện Lượt 1/10; nút gửi/mic khóa đến khi chọn câu.
2. Chọn **Nên trả lời → Chọn & hỏi tiếp**. Kiểm tra câu đã chọn, lịch sử và câu hỏi “Cô ấy/anh ấy trả lời thế nào?”. Ô câu mới trống, bối cảnh giữ nguyên.
3. Nhập phản hồi tiếp theo; nếu thực tế gửi khác gợi ý, mở **Sửa / xác nhận câu đã gửi** trong bong bóng xanh và điền **Câu bạn thực sự đã gửi**. Kiểm request có lịch sử đúng thứ tự và câu đã gửi; nội dung AI phải xét bối cảnh cũ. Gợi ý không được chọn không được xem là sự kiện đã xảy ra.
4. Lặp với nhánh **Tuyệt đối đừng nói**. Nhãn vẫn là lời cần tránh; app lưu câu đã chọn để phân tích tình huống tiếp theo, không gửi tin nhắn ra ngoài.
5. Reload → Lịch sử ở header → Xem / tiếp tục. Kiểm đúng tên, đối tượng, ngôn ngữ, bối cảnh và số lượt. Bắt đầu cuộc mới không xóa cuộc đã lưu; Xóa cuộc này xóa dữ liệu và kết thúc phiên đó nếu đang mở.
6. Thử lỗi API/mất mạng sau một lượt đã chọn: không tăng số lượt, giữ kết quả/input, gửi lại được. Bấm gửi nhiều lần khi đang chờ chỉ có một request. Bắt đầu cuộc mới hoặc xác nhận profile khác khi request đang chờ: kết quả cũ đến muộn không nhập vào cuộc mới. Hủy onboarding giữ cuộc cũ.
7. Đủ 10 lượt thành công: lượt cuối vẫn mở phân tích để đọc được; lưu tự động khi chọn, hoặc menu ••• để lưu lượt chưa chọn, gửi lượt 11 bị khóa. Sửa `DEMO_SETTINGS.maxConversationTurns` trong `index.html` thành 15 rồi reload: cuộc đã lưu có thể tiếp tục đến 15. Giá trị không hợp lệ hoặc trên 50 fallback 10; trần server là 49 lượt lịch sử cộng câu mới.
8. Chọn ảnh: kiểm/sửa **Lời đọc từ ảnh** trước khi chọn câu hoặc lưu. Lịch sử chỉ chứa văn bản, không có data URL ảnh. Thử ảnh chữ nhỏ và đoạn chat dài với model thật; ghi lỗi OCR hoặc mất chi tiết do giới hạn 1.000 ký tự.
9. Chặn localStorage/quota đầy: báo chưa lưu, vẫn hỏi tiếp trong phiên; cho phép lại rồi Lưu kết quả / Thử lưu lại. Dữ liệu lỗi khi reload không làm mất preferences hoặc khóa onboarding. Kết quả chưa lưu không được khôi phục giả.
10. Chạy cả Việt/English và bạn gái/bạn trai; xem ở 375/1100px; Tab/Enter/Space tới nút chọn/lịch sử; kiểm mic, TTS và kết quả tiếng Anh trên điện thoại thật.

Ghi Pass/Fail/Bị chặn cùng dữ liệu tình huống, model, độ trễ và bằng chứng. Không đánh dấu Pass manual từ mock. Lịch sử chỉ nằm ở trình duyệt hiện tại và có thể được người dùng chung thiết bị xem; xóa dữ liệu trình duyệt sẽ mất lịch sử. Giới hạn lượt là flow demo, không phải rate limit chống lạm dụng.

## UI lựa chọn và chat · 12/10/2026

- Hai lựa chọn có header rõ, nút Chọn & hỏi tiếp. Sau chọn, đúng nút hiển thị ✓ Đã chọn; lỗi storage hiển thị Thử lưu lại, lưu thành công ✓ Đã lưu.
- Lời người ấy bên trái, câu đã chọn/gửi bên phải; nhãn phải phân biệt lựa chọn chưa gửi với câu thực tế. Xem phân tích mở/đóng bằng Enter/Space; câu gợi ý và mức nguy hiểm vẫn xem được.
- Danh sách hiển thị tên, preview, thời gian và cuộc đang xem. Mở lại/xóa không làm mất các cuộc khác. Kiểm chữ dài, Việt/English, layout 375/1100px và mở Về lịch sử; screen reader/điện thoại thật cần kiểm riêng.

## Một màn chat hợp nhất · 12/10/2026

- Mỗi lời người ấy chỉ xuất hiện một lần trong timeline. Phân tích Tim và hai lựa chọn mở tại lượt mới nhất, thu gọn thành Xem phân tích & gợi ý sau chọn. Mở lại bằng Enter/Space; nút đọc kết quả hiện hành nằm trong phần mở rộng.
- Header Lịch sử mở danh sách cuộc; menu ••• có Cuộc mới, lưu kết quả chưa chọn và Làm lại từ đầu. Lịch sử chọn cuộc nào thay nội dung trong cùng timeline; không mở thêm chatbox riêng.
- Composer ở dưới vùng cuộn: ảnh/bối cảnh mở bằng ＋, nhập lời người ấy được ghi rõ, lỗi và Thử lưu lại hiện tại đây. Kiểm viewport thấp/bàn phím điện thoại thật, nội dung dài và không có request trùng khi đang chờ.

## Responsive mobile · 12/10/2026

Kiểm 320/360/390/430/768px, xoay ngang 667×375 và viewport thấp 375×320. Thử tên 60 ký tự, câu nháp dài, bối cảnh dài; tên/nhãn thu gọn, tin nhắn vẫn đọc đủ bằng cuộn, menu không ra khỏi viewport. Ô nhập tự tăng đến 96px (48px ở màn thấp), nút menu/＋ tối thiểu 44px. Mở sheet bối cảnh, điền và bấm Xong để quay về nhập lời người ấy. Kiểm riêng Safari/iPhone/Android thật: bàn phím, zoom khi focus, notch/safe-area, thanh browser co/giãn; không tính emulation là Pass thiết bị thật.
