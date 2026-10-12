BẢN THIỆP ĐÃ TỐI ƯU CHO ĐIỆN THOẠI

Cách sử dụng:
1. Giải nén và tải TOÀN BỘ nội dung lên GitHub Pages hoặc hosting tĩnh.
2. Giữ nguyên cấu trúc thư mục vendor/three. Không chỉ tải riêng 3 file code.
3. Mở bằng đường dẫn http/https; không mở index.html trực tiếp bằng file://.
4. Giữ nút khoảng 1 giây để bắt đầu; nhấn phong bì để đọc thư.
5. Nút ♫ ở góc trên cho phép bật/tắt nhạc.

Chỉnh lời chúc, nội dung thư và người gửi ở đầu file main.js.
Thay nhạc bằng file bgm.mp3 cùng tên.

Các thay đổi:
- Điện thoại dùng 6.000–10.000 hạt thay vì 32.000; máy tính dùng 18.000.
- Ghép hạt thành chữ bằng vertex shader trên GPU; tạo và lưu sẵn mẫu chữ.
- Thêm chuyển động lượn nhẹ lúc ghép chữ và dùng hạt phát sáng.
- Tắt bloom trên điện thoại; giới hạn độ phân giải và tự giảm khi tốc độ khung hình thấp.
- Chữ được căn vừa khung hình, không xoay bằng thao tác chạm trên điện thoại.
- Pháo hoa chạy theo thời gian, giới hạn hạt và dừng khi kết thúc.
- Dừng vẽ và nhạc khi chuyển tab; tạm dừng thời gian lời chúc khi ẩn trang.
- Giải phóng tài nguyên 3D sau phần chữ.
- Thiệp hỗ trợ vùng an toàn tai thỏ, chiều cao màn hình động và cuộn thư bằng tay.
- Tôn trọng chế độ giảm chuyển động; có giao diện nhẹ nếu khởi tạo WebGL thất bại.
- Đóng gói Three.js 0.163.0 và giấy phép; chỉ phông Pacifico dùng mạng, có phông dự phòng.
- Bỏ ký tự thừa “mj” sau thẻ HTML.

Kiểm tra:
Đã kiểm tra cú pháp JS, đường dẫn các module đóng gói và mô phỏng luồng
trên màn hình dọc, ngang, chế độ giảm chuyển động và lỗi khởi tạo WebGL.
Chưa đo FPS trên điện thoại thật hoặc kiểm tra kết quả vẽ GPU trên Safari/iOS.
