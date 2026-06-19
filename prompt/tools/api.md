# Hệ Thống Theo Dõi Chứng Khoán Thời Gian Thực Tích Hợp AI

## Objective

Xây dựng một ứng dụng web theo dõi thị trường tài chính theo thời gian thực có tích hợp AI phân tích dữ liệu, sử dụng kiến trúc dịch vụ phân tách (decoupled services) để đảm bảo khả năng mở rộng, chịu tải cao và triển khai thành portfolio chuyên nghiệp trên GitHub.

## Current State

Hệ thống đã hoàn thiện thiết kế kiến trúc tổng thể dựa trên luồng dữ liệu thời gian thực. Nguồn dữ liệu API cho bản thử nghiệm (POC) đã được xác định. Cấu trúc chuẩn hóa dữ liệu nội bộ (Data Schema) tại trạm trung chuyển đã được thiết lập, sẵn sàng cho việc tích hợp đồng bộ giữa cơ sở dữ liệu, các module AI và giao diện người dùng.

## Confirmed Knowledge

* **Nguồn dữ liệu (POC):** Sử dụng **Crypto API (Binance WebSocket)** cho bản Proof of Concept. Lợi thế: Hoạt động 24/7, rate limit hào phóng, định dạng JSON nhất quán, cho phép subscribe đồng thời nhiều tickers (VD: 50 mã) để thực hiện stress test dễ dàng.
* **Tầng Backend (Broker):** Phát triển bằng **FastAPI** (Python), đóng vai trò trạm trung chuyển bất đồng bộ, tiếp nhận luồng dữ liệu, ép kiểu và broadcast xuống client qua WebSocket.
* **Chuẩn dữ liệu nội bộ (Internal Data Schema):** Sử dụng Pydantic model (`MarketDataPayload`) với chuẩn OHLCV, bao gồm: `symbol`, `timestamp` (Unix Epoch ms), `open`, `high`, `low`, `close`, `volume`, và `event_type` (VD: "kline_1s"). Schema này hoạt động như một Adapter độc lập với nguồn API cấp dữ liệu thô.
* **Tầng Cơ Sở Dữ Liệu:** Áp dụng lưu trữ phân tách.
* **Cassandra:** Tối ưu cho time-series. Schema nội bộ được ánh xạ với `symbol` làm Partition Key (phân tán dữ liệu) và `timestamp` làm Clustering Key (sắp xếp dữ liệu theo thời gian thực).
* **PostgreSQL:** Lưu trữ metadata và thông tin người dùng.


* **Tầng Phân Tích (AI Workers):** Tách biệt thành các tiến trình chạy nền độc lập. Sử dụng Pandas, ARIMA, LightGBM; tận dụng `timestamp` và dữ liệu OHLCV để thiết lập `DatetimeIndex` và tính toán features.
* **Tầng Giao Diện (Frontend):** Dữ liệu cập nhật real-time qua WebSocket. Sử dụng thư viện **Lightweight Charts**, nhận trực tiếp định dạng `{time, open, high, low, close}` từ payload chuẩn hóa của Backend.
* **DevOps & Triển khai:** Sử dụng **Docker** (docker-compose) để đóng gói toàn bộ services (FastAPI, Cassandra, AI Workers).
