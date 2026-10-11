# Kiểm tra thông dịch liên tục và lịch sử

Cập nhật: 11/10/2026. `npm run test:history` kiểm tra browser bằng API mock; không thay thế các bước dưới đây với model và thiết bị thật.

1. Thiết lập người ấy, nhập câu đầu và bối cảnh. Giải mã xong phải hiện Lượt 1/10; nút gửi/mic khóa đến khi chọn câu.
2. Chọn **Nên trả lời → Chọn câu này & lưu**. Kiểm tra câu đã chọn, lịch sử và câu hỏi “Cô ấy/anh ấy trả lời thế nào?”. Ô câu mới trống, bối cảnh giữ nguyên.
3. Nhập phản hồi tiếp theo; nếu thực tế gửi khác gợi ý, điền **Câu bạn thực sự đã gửi**. Kiểm request có lịch sử đúng thứ tự và câu đã gửi; nội dung AI phải xét bối cảnh cũ. Gợi ý không được chọn không được xem là sự kiện đã xảy ra.
4. Lặp với nhánh **Tuyệt đối đừng nói**. Nhãn vẫn là lời cần tránh; app lưu câu đã chọn để phân tích tình huống tiếp theo, không gửi tin nhắn ra ngoài.
5. Reload → Lịch sử trên thiết bị → Xem / tiếp tục. Kiểm đúng tên, đối tượng, ngôn ngữ, bối cảnh và số lượt. Bắt đầu cuộc mới không xóa cuộc đã lưu; Xóa cuộc này xóa dữ liệu và kết thúc phiên đó nếu đang mở.
6. Thử lỗi API/mất mạng sau một lượt đã chọn: không tăng số lượt, giữ kết quả/input, gửi lại được. Bấm gửi nhiều lần khi đang chờ chỉ có một request. Bắt đầu cuộc mới hoặc xác nhận profile khác khi request đang chờ: kết quả cũ đến muộn không nhập vào cuộc mới. Hủy onboarding giữ cuộc cũ.
7. Đủ 10 lượt thành công: lượt cuối vẫn lưu/đọc được, gửi lượt 11 bị khóa. Sửa `DEMO_SETTINGS.maxConversationTurns` trong `index.html` thành 15 rồi reload: cuộc đã lưu có thể tiếp tục đến 15. Giá trị không hợp lệ hoặc trên 50 fallback 10; trần server là 49 lượt lịch sử cộng câu mới.
8. Chọn ảnh: kiểm/sửa **Lời đọc từ ảnh** trước khi chọn câu hoặc lưu. Lịch sử chỉ chứa văn bản, không có data URL ảnh. Thử ảnh chữ nhỏ và đoạn chat dài với model thật; ghi lỗi OCR hoặc mất chi tiết do giới hạn 1.000 ký tự.
9. Chặn localStorage/quota đầy: báo chưa lưu, vẫn hỏi tiếp trong phiên; cho phép lại rồi Lưu kết quả / thử lưu lại. Dữ liệu lỗi khi reload không làm mất preferences hoặc khóa onboarding. Kết quả chưa lưu không được khôi phục giả.
10. Chạy cả Việt/English và bạn gái/bạn trai; xem ở 375/1100px; Tab/Enter/Space tới nút chọn/lịch sử; kiểm mic, TTS và kết quả tiếng Anh trên điện thoại thật.

Ghi Pass/Fail/Bị chặn cùng dữ liệu tình huống, model, độ trễ và bằng chứng. Không đánh dấu Pass manual từ mock. Lịch sử chỉ nằm ở trình duyệt hiện tại và có thể được người dùng chung thiết bị xem; xóa dữ liệu trình duyệt sẽ mất lịch sử. Giới hạn lượt là flow demo, không phải rate limit chống lạm dụng.
