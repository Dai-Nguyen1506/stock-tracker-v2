# Hệ Thống Theo Dõi Chứng Khoán Thời Gian Thực Tích Hợp AI

## Objective

Xây dựng ứng dụng web theo dõi thị trường tài chính thời gian thực, tích hợp AI phân tích dữ liệu dự báo, thiết kế với kiến trúc dịch vụ phân tách (decoupled services) chuẩn mực để triển khai thành portfolio chuyên nghiệp.

## Current State

Kiến trúc hệ thống tổng thể đã được thiết kế hoàn thiện, ứng dụng luồng dữ liệu thời gian thực (real-time data streaming). Đã chốt giải pháp kết nối giao tiếp hai chiều liên tục (full-duplex) giữa các tầng bằng WebSockets. Phương pháp triển khai Frontend đã được xác định, áp dụng kỹ thuật tối ưu hóa luồng dữ liệu tần suất cao bằng React nhằm tránh nghẽn luồng xử lý giao diện (UI Thread).

## Confirmed Knowledge

* **Tầng Nguồn Dữ Liệu (Data Ingestion):** Thu thập trực tiếp luồng tick data từ các sàn giao dịch/nhà cung cấp API thông qua WebSockets.
* **Tầng Backend (Broker):** Xây dựng bằng FastAPI (Python) với ASGI (Starlette) để xử lý bất đồng bộ. FastAPI duy trì kết nối WebSockets với nguồn dữ liệu và phát (broadcast) dữ liệu trực tiếp xuống client. Cần triển khai lớp `ConnectionManager` để quản lý và tối ưu hóa việc phát dữ liệu cho hàng loạt kết nối client đồng thời.
* **Tầng Cơ Sở Dữ Liệu:** * **Cassandra:** Tối ưu cho luồng ghi tốc độ cao dữ liệu chuỗi thời gian (lịch sử giá, khối lượng).
* **PostgreSQL:** Lưu trữ metadata và thông tin người dùng.


* **Tầng Phân Tích (AI Workers):** Các module AI (Pandas, ARIMA, LightGBM) chạy như các background workers độc lập, truy xuất dữ liệu lịch sử để huấn luyện/dự báo và gửi tín hiệu định kỳ/tức thời lên server.
* **Tầng Giao Diện (Frontend):** * Sử dụng **React** (khởi tạo bằng Vite) kết hợp **Lightweight Charts** để vẽ biểu đồ nến.
* **Chiến lược tối ưu hóa cốt lõi:** Tách biệt hoàn toàn luồng dữ liệu tần suất cao khỏi chu trình Re-render của React.
* Không lưu tick data vào `useState`.
* Sử dụng Custom Hook (`useWebSocket`) để quản lý vòng đời kết nối, nhịp tim (heartbeat) và cơ chế tự động kết nối lại (Exponential Backoff).
* Sử dụng `useRef` để lưu trữ instance của biểu đồ và truyền trực tiếp dữ liệu vào Canvas thông qua hàm `update()` của Lightweight Charts, đảm bảo hiệu năng tối đa.


* **DevOps:** Đóng gói toàn bộ services bằng Docker (docker-compose).
