# Tim Bot

Ngày cập nhật: 11/10/2026. Người dùng chọn hướng A và sprite-gen.

## Ngoại hình

Trái tim hồng đất sét 2.5D, tay chân ngắn, mắt đen, tai nghe lavender có microphone. Hình khối đơn giản để đọc rõ ở kích thước mascot hiện tại 112px. Mẫu gốc nhìn chính diện, toàn thân, nền trong suốt. Giữ cùng tỷ lệ, khuôn mặt và phụ kiện ở mọi animation.

Đã tạo ảnh mẫu `assets/tim-bot/concept-v1/tim-bot.png` bằng sprite-gen, provider Codex với model CLI gpt-5.5 (model cấu hình gpt-6.1-sol bị tài khoản CLI từ chối). Đã xem ảnh composite nền trắng: toàn thân, tay chân và tai nghe đầy đủ, đúng hướng A. Người dùng đã duyệt ngoại hình. Đã sản xuất đủ 5 animation và tích hợp vào app. Prompt được lưu ở `prompt.txt`. Không dùng API key trả phí riêng; provider được chọn là Codex.

## Bộ chuyển động đã triển khai

| Trạng thái | Chuyển động | Kết thúc |
| --- | --- | --- |
| Chào hỏi | Vẫy tay, nghiêng đầu, cười | Về tư thế nghỉ sau một lượt |
| Chọn option | Cử chỉ chỉ lựa chọn gọn, giữ kích thước cơ thể ổn định | Dừng hướng dẫn khi chọn xong |
| Nhập thông tin | Cầm phong thư và mở tay mời nhập thông tin | Chuyển sang chờ khi gửi yêu cầu |
| Chờ API | Di chuyển kính lúp và chớp mắt suy nghĩ | Lặp trong khi yêu cầu giải mã đang chờ; ẩn khi hoàn tất hoặc lỗi |
| Đọc kết quả | Cầm thẻ kết quả, thay đổi khẩu hình miệng | Chỉ chạy trong khi audio phát; dừng khi kết thúc hoặc lỗi |

Animation đọc là chuyển động nói chung, không cam kết khớp môi theo âm vị. Mỗi trạng thái cần ảnh tĩnh khi người dùng bật giảm chuyển động. Animation không thay thế label, trạng thái loading, nội dung kết quả hoặc thông báo lỗi hiện có.

## Hover và chuyển động tự động

- Bot thở/nhún nhẹ liên tục (chu kỳ 3,2 giây, dịch tối đa 2px và phóng 1,5%) kể cả khi cử chỉ đã kết thúc.
- Rê chuột vào bot chạy lại cử chỉ hiện tại; bot nghỉ sẽ vẫy tay. Không khởi động lại hoặc ghi đè vòng chờ API/đọc audio. Pointer cảm ứng không kích hoạt hover.
- Sau khoảng 12 giây không pointerdown, gõ phím hoặc nhập liệu: onboarding gợi ý chọn nếu thiếu đối tượng, mời nhập nếu đã chọn, chào ở màn review; màn nhập nhắc nhập; màn kết quả chào nhẹ.
- Không tự nhắc khi tab ẩn, đang thu âm, chờ giải mã, chờ/phát audio hoặc bật giảm chuyển động. Tương tác mới đặt lại thời gian chờ.
- Dùng lại atlas hiện có; không tạo thêm sprite hoặc dependency. Giảm chuyển động tắt cả thở và cử chỉ.

## Kiểm chứng

Report tạo ảnh xác nhận PNG RGBA 1312×1199, 48,55% pixel trong suốt hoàn toàn, không còn RGB thừa dưới alpha 0. Có ảnh composite nền trắng `tim-bot-white.png` và report `generation-report.json`. Đã chạy prepare → gen-set → extract → compose-atlas → compose-gif → inspect → export-pngs bằng sprite-gen. 20 frame RGBA 256×256, atlas 1024×1280. Đã xem toàn bộ contact sheet và các pha chuyển động render trong browser ở 112px; result bot 72px. Động tác chọn được tạo lại một lần vì bản đầu thay đổi tỷ lệ cơ thể. Inspector không có lỗi; cảnh báo chuyển động nhỏ ở reading (0,0065 < 0,01) được giữ nguyên vì chỉ miệng cử động.

- `npm test`: 49/49 pass, gồm lifecycle audio, lỗi phát, hủy và response TTS đến muộn.
- `npm run test:bot`: pass trên Chromium, 375/1100px, 5 trạng thái, hover chạy lại cử chỉ, nhắc sau 12 giây, không nhắc trong tab ẩn hoặc ngắt loop API/audio, tọa độ CSS đối chiếu manifest, frame tĩnh khi giảm chuyển động; API và sự kiện audio dùng mock.
- `npm run test:onboarding`: pass với microphone giả/backend mock.
- `npm run test:demo`: pass 12 luồng với API mock; 10 checkpoint manual chưa thực hiện, không ghi Pass manual từ mock.

Bằng chứng browser: `.manual-test/tim-bot/browser-report.json` và ảnh chụp cùng thư mục. QA từng trạng thái: `assets/generated/sprites/tim-bot/qa-notes.md`. [Xem bộ animation](../tim-bot-preview.html).

Runtime dùng `assets/tim-bot/tim-bot-atlas.png`, metadata trong `assets/tim-bot/manifest.json`. CSS cố định 4 cột × 5 hàng; cần cập nhật nếu thay cấu trúc atlas. Bản PNG đã áp dụng curation được xuất trong `assets/generated/sprites/tim-bot/curated/`. Chưa mở curation UI hoặc lưu lựa chọn provider làm mặc định.

Chưa nghe TTS thật hoặc kiểm tra thiết bị thật. Chuyển động gồm 4 pose mỗi trạng thái, không phải animation nội suy nhiều frame; khẩu hình không khớp âm vị.

## Favicon

Ngày 11/10/2026: `assets/tim-bot/favicon.png` dùng nguyên frame chào đầu tiên đã xuất, PNG RGBA 256×256. Khai báo `rel=icon` trong `index.html`; đường dẫn, định dạng và kích thước đã kiểm tra. Không tạo lại hình. Chưa kiểm tra cache favicon trong browser.

## Onboarding trợ lý — 11/10/2026

Hướng A đã triển khai: bubble chào → ngôn ngữ → hai thẻ bạn gái/bạn trai → tên → bubble xác nhận cá nhân hóa → gợi ý nhập tin nhắn/ảnh. Nội dung hiện đầy đủ ngay, transition 250ms, tắt chuyển động theo reduced-motion. Các chip giữ lựa chọn đã hoàn tất; Back giữ dữ liệu, Edit quay về tên và có thể Back để sửa lựa chọn. Voice giữ luồng nhận diện và bước xác nhận trước khi lưu. Không thêm API hoặc dependency.

Kiểm tra: 51 test Node pass; Chromium onboarding 375/1100px pass với 6 ảnh chụp, gồm bước thiếu lựa chọn, quay lại, vi/en × gf/bf, voice đầy đủ/thiếu, retry/cancel/quyền mic. Bot hover/idle/loop/audio/atlas pass; demo 12 case backend mock pass. Ảnh welcome và chọn người ấy đã xem. Chưa xác nhận mic/API/TTS hoặc Safari trên thiết bị thật.
