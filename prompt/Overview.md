# Real-time Stock Monitoring System with Cassandra and AI Chatbot

---
tags: [architecture, cassandra, time-series, stock-monitoring, chatbot, system-design]
last_distilled: 2026-06-18
dependencies: []
---

## Summary

Dự án thiết lập một hệ thống theo dõi và phân tích dữ liệu chứng khoán theo thời gian thực sử dụng Apache Cassandra làm cơ sở dữ liệu cốt lõi, kết hợp với AI Chatbot phục vụ mục đích phân tích kỹ thuật. Hệ thống giải quyết bài toán xử lý ghi dữ liệu tần suất cao (Write-heavy) của luồng dữ liệu chuỗi thời gian (Time-series data), tối ưu hóa cấu trúc bảng để ngăn ngừa phân vùng quá tải (Hot Partition) và giới hạn kích thước phân vùng dưới 100MB. Hệ thống cũng định hình một kiến trúc tích hợp AI Chatbot tinh gọn, chuyển hóa dữ liệu thô thành thông tin tổng hợp trước khi đưa vào mô hình ngôn ngữ lớn (LLM).


## Core Repository

### 1. Kiến Trúc Tổng Quan Hệ Thống (System Architecture)

Hệ thống tuân thủ kiến trúc phân tầng chuẩn doanh nghiệp nhằm đảm bảo tính toàn vẹn của luồng dữ liệu thời gian thực và khả năng mở rộng độc lập giữa các thành phần:

* **Data Ingestion Layer (Worker):** Thành phần kết nối trực tiếp với các cổng cung cấp dữ liệu thị trường (như Binance, Finnhub, Twelve Data) thông qua giao thức WebSockets để thu thập dữ liệu biến động giá theo từng tích tắc (raw ticks).
* **Message Broker Layer (Kafka / RabbitMQ):** Đóng vai trò là bộ đệm dòng dữ liệu (Stream Buffer). Tầng này giải quyết hiện tượng nghẽn cổ chai khi thị trường có biến động mạnh (High Spike), bảo vệ hệ thống lưu trữ phía sau bằng cách cho phép Worker tiêu thụ dữ liệu theo cơ chế Backpressure.
* **Storage Layer (Apache Cassandra):** Cơ sở dữ liệu NoSQL chịu trách nhiệm chính trong việc lưu trữ dữ liệu chuỗi thời gian (Time-series) bao gồm dữ liệu giao dịch thô và dữ liệu nến đã qua tổng hợp.
* **Application API Layer (FastAPI):** Cung cấp hai cơ chế giao tiếp độc lập:
* *WebSocket Server:* Đẩy trực tiếp (Fanout) dữ liệu biến động giá thời gian thực từ Broker lên giao diện người dùng.
* *REST APIs:* Phục vụ truy vấn dữ liệu lịch sử cho Frontend và làm cổng cung cấp dữ liệu nén cho module Chatbot.


* **AI Chatbot Service:** Module xử lý ngôn ngữ tự nhiên độc lập, nhận ngữ cảnh dữ liệu từ API để đưa ra các nhận định phân tích tài chính.

### 2. Thiết Kế Cơ Sở Dũ Liệu Apache Cassandra

Thiết kế mô hình dữ liệu trong Cassandra tuân thủ nghiêm ngặt nguyên lý **Query-Driven Modeling** (thiết kế dựa trên câu hỏi truy vấn, không sử dụng quan hệ hay phép JOIN).

#### Bảng dữ liệu giao dịch thô (`stock_ticks`)

* **Mục tiêu:** Lưu trữ mọi biến động giá phục vụ vẽ đồ thị tick và truy vấn $N$ giao dịch gần nhất của một mã trong ngày.
* **Chiến lược phân vùng:** Sử dụng cơ chế Bucket theo ngày (`day_bucket`) kết hợp với mã chứng khoán để phân tán đều dữ liệu trên các node của Cluster và kiểm soát dung lượng phân vùng.

```sql
CREATE KEYSPACE stock_monitoring 
WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1};

USE stock_monitoring;

CREATE TABLE stock_ticks (
    symbol text,
    day_bucket text, -- Định dạng: YYYY-MM-DD
    timestamp timestamp,
    price decimal,
    volume bigint,
    PRIMARY KEY ((symbol, day_bucket), timestamp)
) WITH CLUSTERING ORDER BY (timestamp DESC);

```

#### Bảng dữ liệu nến lịch sử (`stock_candles`)

* **Mục tiêu:** Cung cấp dữ liệu OHLC (Open-High-Low-Close) phục vụ biểu đồ kỹ thuật theo các khung thời gian (`interval`).
* **Chiến lược phân vùng:** Sử dụng cấu trúc phân vùng theo năm (`year_bucket`) nhằm tối ưu hóa dung lượng lưu trữ dài hạn.

```sql
CREATE TABLE stock_candles (
    symbol text,
    interval text, -- Ví dụ: '1m', '5m', '1h', '1d'
    year_bucket int, -- Định dạng: YYYY
    timestamp timestamp,
    open decimal,
    high decimal,
    low decimal,
    close decimal,
    volume bigint,
    PRIMARY KEY ((symbol, interval, year_bucket), timestamp)
) WITH CLUSTERING ORDER BY (timestamp DESC);

```

#### Cấu hình nâng cao cho Time-Series dữ liệu lớn

* **Compaction Strategy:** Chuyển đổi từ cấu trúc mặc định sang **`TimeWindowCompactionStrategy` (TWCS)**. Chiến lược này gom cụm các cấu trúc SSTables dựa trên khoảng thời gian của dữ liệu, tối ưu hóa hiệu năng I/O cho việc ghi dữ liệu liên tục và truy vấn theo dòng thời gian.
* **Time-To-Live (TTL):** Thiết lập thuộc tính `TTL` cho bảng dữ liệu thô `stock_ticks` giới hạn trong vòng 7 ngày để tự động giải phóng dung lượng ổ đĩa. Dữ liệu nến trong bảng `stock_candles` được cấu hình lưu trữ vĩnh viễn.

### 3. Kiến Trúc Tích Hợp Chatbot Phân Tích

Để tối ưu tài nguyên hệ thống và loại bỏ việc LLM phải quét trực tiếp trên lượng dữ liệu thô khổng lồ từ Cassandra, cơ chế tích hợp được thực hiện thông qua quy trình 5 bước:

1. **Nhận diện Ý định (Intent & Entity Parsing):** Hệ thống đón nhận câu hỏi tự nhiên từ người dùng (ví dụ: *"Phân tích xu hướng mã AAPL trong 5 tiếng qua"*), trích xuất ra các thực thể định danh bao gồm: `Intent: Phân tích`, `Symbol: AAPL`, `Duration: 5 giờ`.
2. **Tổng hợp Dữ liệu (Data Aggregation):** Tầng Backend thực hiện một truy vấn quét phạm vi (Range Query) tinh gọn vào bảng `stock_candles` trong Cassandra để lấy tập hợp các nến tương ứng với khoảng thời gian yêu cầu.
3. **Tính toán Chỉ báo (Feature Engineering):** Backend sử dụng tập dữ liệu vừa lấy để tính toán nhanh các chỉ báo kỹ thuật cơ bản như Đường trung bình động (MA), Chỉ số sức mạnh tương đối (RSI), hoặc Phân kỳ hội tụ đường trung bình động (MACD).
4. **Thiết kế Ngữ cảnh (Prompt Engineering):** Chuyển đổi các thông số kỹ thuật khô khan thành một văn bản tóm tắt cấu trúc mạch lạc (Context injection).
5. **Suy luận sinh phản hồi (LLM Reasoning):** Gửi toàn bộ prompt chứa ngữ cảnh dữ liệu cô đọng sang mô hình ngôn ngữ lớn (như Gemini API, OpenAI API hoặc mô hình chạy cục bộ thông qua Ollama) để tạo ra phản hồi chuyên sâu dạng chuyên gia phân tích tài chính gửi lại cho người dùng.

### 4. Công Nghệ Triển Khai Chi Tiết (Tech Stack)

* **Backend Engine:** FastAPI (Python) - Đảm bảo tính bất đồng bộ (Asynchronous) tối ưu khi duy trì các cổng kết nối dữ liệu tầm cao, tích hợp mượt mà với driver của Cassandra và các thư viện xử lý dữ liệu (Pandas, Numpy).
* **Frontend Interface:** React.js kết hợp TailwindCSS và thư viện **Lightweight Charts** của TradingView giúp hiển thị biểu đồ nến mượt mà với tần suất cập nhật cao.
* **Data Pipeline:** Apache Kafka hoặc RabbitMQ làm cấu trúc Broker điều phối dữ liệu.
* **Containerization & Deployment:** Docker và Docker Compose quản lý môi trường đồng bộ cho cụm Cassandra Cluster, Broker, API và Worker.

---

## Affected Objects

No Synchronization Required

---

## Related Knowledge

* **Cassandra TimeWindowCompactionStrategy (TWCS) Tuning:** Cơ chế gộp SSTable theo thời gian để tối ưu hóa hiệu năng đọc/ghi đối với dữ liệu chuỗi thời gian.
* **Backpressure Handling in Message Brokers:** Kỹ thuật điều phối và kiểm soát dòng dữ liệu luân chuyển từ Broker vào NoSQL khi xảy ra hiện tượng quá tải cục bộ.
* **In-Memory Aggregation Pipelines:** Kỹ thuật tính toán các chỉ số tài chính (OHLC, RSI) theo thời gian thực trên RAM trước khi ghi dứt điểm vào cơ sở dữ liệu.
* **Context Window Optimization for Financial LLMs:** Phương pháp thiết kế Prompt và tối ưu kích thước ngữ cảnh tài chính khi làm việc với các mô hình ngôn ngữ lớn.