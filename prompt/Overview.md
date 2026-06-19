# Hệ Thống Theo Dõi Chứng Khoán Thời Gian Thực Tích Hợp AI

## Objective

Xây dựng một ứng dụng web theo dõi thị trường tài chính theo thời gian thực có tích hợp AI phân tích dữ liệu, được tổ chức kiến trúc chuẩn mực để triển khai thành portfolio chuyên nghiệp trên GitHub.

## Current State

Đã hoàn thiện thiết kế kiến trúc hệ thống tổng thể (System Architecture). Hệ thống sử dụng mô hình luồng dữ liệu thời gian thực (real-time data streaming) kết hợp kiến trúc dịch vụ phân tách (decoupled services), đảm bảo khả năng mở rộng, chịu tải ghi cao và tích hợp AI mượt mà mà không làm nghẽn luồng xử lý chính.

## Confirmed Knowledge

* **Tầng Nguồn Dữ Liệu (Data Ingestion):** Sử dụng dữ liệu động, thu thập trực tiếp luồng tick data từ các nhà cung cấp (như Binance, Finnhub) thông qua kết nối **WebSockets**.
* **Tầng Backend (Trạm Trung Chuyển):** Xây dựng bằng **FastAPI** (Python). Đảm nhiệm vai trò Broker tiếp nhận dữ liệu bất đồng bộ và phát (broadcast) dữ liệu trực tiếp xuống client qua WebSockets nội bộ.
* **Tầng Cơ Sở Dữ Liệu:** Áp dụng chiến lược lưu trữ phân tách:
* **Cassandra:** Xử lý luồng ghi dữ liệu chuỗi thời gian (time-series) tốc độ cao cho lịch sử giá và khối lượng.
* **PostgreSQL:** (Dự kiến) Lưu trữ metadata và thông tin người dùng.


* **Tầng Phân Tích (AI Workers):** Các module AI (sử dụng Pandas, ARIMA, LightGBM) được tách riêng thành các Background Workers độc lập, thực hiện truy xuất dữ liệu lịch sử từ CSDL, dự báo và gửi tín hiệu định kỳ lên server.
* **Tầng Giao Diện (Frontend):** Hiển thị dữ liệu real-time qua WebSockets mà không cần tải lại trang. Tích hợp thư viện **Lightweight Charts** để vẽ biểu đồ nến tài chính.
* **DevOps & Triển khai:** Đóng gói toàn bộ các service (FastAPI, Cassandra, AI Workers) bằng **Docker** (docker-compose) ngay từ giai đoạn phát triển đầu tiên. Sử dụng Git để quản lý phiên bản theo từng nhánh tính năng rõ ràng.

## Open Questions

* Thứ tự triển khai ưu tiên: Thiết lập môi trường Docker Compose trước hay dựng khung mã nguồn FastAPI trước?
* Xác định nguồn API dữ liệu tài chính cụ thể (Crypto hay Stock) sẽ được sử dụng cho bản thử nghiệm đầu tiên (POC)?
* Thiết kế Data Model chi tiết (Partition Key, Clustering Key) trong Cassandra để tối ưu hóa việc đọc dữ liệu huấn luyện cho AI worker.
* Lựa chọn công nghệ Frontend cụ thể (Vanilla JS, React, hoặc Vue) để tích hợp cùng Lightweight Charts và WebSockets.