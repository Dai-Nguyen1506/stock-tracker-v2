# Hệ Thống Theo Dõi Chứng Khoán Thời Gian Thực Tích Hợp AI

## Objective

Xây dựng một ứng dụng web theo dõi thị trường tài chính theo thời gian thực có tích hợp AI phân tích dữ liệu, được tổ chức kiến trúc chuẩn mực để triển khai thành portfolio chuyên nghiệp trên GitHub.

## Current State

Kiến trúc hệ thống tổng thể đã được thiết kế hoàn thiện sử dụng mô hình luồng dữ liệu thời gian thực (real-time data streaming) kết hợp kiến trúc dịch vụ phân tách (decoupled services). Giải pháp lưu trữ cốt lõi cho chuỗi thời gian tốc độ cao đã được chốt sử dụng Apache Cassandra với mô hình dữ liệu Data Bucketing tối ưu hóa cho AI Worker.

## Confirmed Knowledge

* **Tầng Nguồn Dữ Liệu (Data Ingestion):** Thu thập trực tiếp luồng tick data từ các nhà cung cấp thông qua kết nối WebSockets.
* **Tầng Backend (Trạm Trung Chuyển):** Sử dụng FastAPI (Python) làm Broker tiếp nhận dữ liệu bất đồng bộ và phát (broadcast) trực tiếp xuống client qua WebSockets nội bộ.
* **Tầng Cơ Sở Dữ Liệu:**
* **PostgreSQL:** Lưu trữ metadata và thông tin người dùng.
* **Apache Cassandra:** Xử lý luồng ghi dữ liệu chuỗi thời gian (time-series). Đảm bảo tốc độ ghi O(1) nhờ kiến trúc Append-Only (Memtable -> CommitLog -> SSTable) và khả năng chịu lỗi nhờ kiến trúc Masterless phân tán qua Token Ring.


* **Thiết kế Data Model Cassandra (Tối ưu hóa Time-series & AI Query):**
* **Chiến lược Data Bucketing:** Khóa chính (Primary Key) được thiết kế dạng `((symbol, bucket_date), timestamp)`.
* **Partition Key `(symbol, bucket_date)`:** Composite key giúp gom nhóm tick data của một tài sản theo từng ngày, giải quyết vấn đề Hot Spot Partition và giữ kích thước phân vùng ổn định.
* **Clustering Key `timestamp`:** Dữ liệu được sắp xếp vật lý theo `CLUSTERING ORDER BY (timestamp DESC)` giúp hệ thống lấy ra $N$ bản ghi mới nhất với tốc độ cực nhanh (Sequential Read).
* **Chiến lược Compaction:** Sử dụng `TimeWindowCompactionStrategy` (TWCS) gom nhóm và xử lý các tệp SSTable theo cửa sổ thời gian, tối ưu tuyệt đối cho vòng đời dữ liệu time-series.


* **Tầng Phân Tích (AI Workers):** Các module AI (Pandas, ARIMA, LightGBM) chạy như Background Workers độc lập. Quá trình lấy mẫu huấn luyện dựa trên việc truy vấn trực tiếp vào từng partition `(symbol, bucket_date)` trên Cassandra để đọc dữ liệu tuyến tính.
* **Tầng Giao Diện (Frontend):** Hiển thị dữ liệu real-time qua WebSockets. Tích hợp thư viện Lightweight Charts vẽ biểu đồ nến.
* **DevOps & Triển khai:** Toàn bộ hệ thống (FastAPI, Cassandra, AI Workers) được container hóa bằng Docker (docker-compose) ngay từ giai đoạn phát triển. Quản lý phiên bản bằng Git.