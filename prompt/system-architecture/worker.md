Dưới đây là kết quả chưng cất phiên làm việc thành một Knowledge Object hoàn chỉnh, được biên soạn theo đúng vai trò và cấu trúc yêu cầu của bạn.

---

# Phân tích Delta và Đánh giá Tác động

1. **Xác định Object:** Đây là một **Knowledge Object Mới** (Thiết lập kiến trúc nền tảng cho cấu phần Ingestion Layer).
2. **Phân tích Delta (Tri thức thu hoạch được từ phiên làm việc):**
* **Tri thức & Kết luận mới:** Xác định mô hình kiến trúc Worker 4 thành phần giải quyết bài toán nghẽn cổ chai (backpressure) từ luồng dữ liệu WebSocket tần suất cao (Binance, Finnhub, Twelve Data). Khẳng định việc tách biệt luồng Raw Ticks (vào Cassandra) và Aggregated Data (vào LLM Chatbot) là tối ưu.
* **Quyết định kiến trúc mới:** Sử dụng cơ chế lập trình bất đồng bộ (Async), chuẩn hóa dữ liệu thô về một mẫu chung (Internal Tick Model), triển khai bộ đệm (In-Memory Queue/Micro-batching) thay vì ghi trực tiếp, và sử dụng chiến lược khóa phân vùng `((symbol, bucket_date), tick_time)` để giới hạn kích thước partition dưới 100MB trong Cassandra.
3. **Đánh giá tác động:** Là tài liệu đặc tả kỹ thuật đầu vào cho hai cấu phần tiếp theo: Lớp lưu trữ Cassandra (Storage Layer) và Lớp xử lý dữ liệu tổng hợp phục vụ AI (Aggregation Layer).

---

# Kiến Trúc Lớp Thu Thập Dữ Liệu Thị Trường Thời Gian Thực (Data Ingestion Layer)

---

## tags: #data-engineering #cassandra #websockets #time-series #architecture
last_distilled: 2026-06-18
dependencies: None

## Summary

Tài liệu này đặc tả kiến trúc kỹ thuật của **Data Ingestion Layer (Worker)** thuộc hệ thống theo dõi và phân tích dữ liệu chứng khoán/crypto thời gian thực. Hệ thống xử lý luồng dữ liệu chuỗi thời gian dạng thô (raw ticks) có tần suất ghi cực cao (write-heavy) từ các cổng cung cấp (Binance, Finnhub, Twelve Data) qua giao thức WebSockets.

Mục tiêu cốt lõi của lớp này là đảm bảo thu thập toàn vẹn dữ liệu không độ trễ, giải quyết áp lực nghẽn mạng (backpressure), chuẩn hóa dữ liệu về một định dạng nội bộ, và ghi xuống Apache Cassandra một cách tối ưu nhằm kiểm soát kích thước phân vùng (partition size) luôn dưới 100MB và triệt tiêu hiện tượng phân vùng quá tải (Hot Partition). Dữ liệu sau đó sẽ được tổng hợp (aggregate) để làm ngữ cảnh tinh gọn cho AI Chatbot (LLM).

## Core Repository

### 1. Tổng quan Kiến trúc Luồng Dữ liệu (Pipeline Pipeline)

Hệ thống phân tách rõ ràng luồng dữ liệu thành hai nhánh nhằm tối ưu hiệu năng:

* **Luồng Lưu trữ (Storage Path):** Raw Ticks từ WebSocket -> Worker -> Buffer/Batching -> Cassandra (Lưu trữ dài hạn, độ phân giải cao).
* **Luồng Trợ lý AI (AI Path):** Raw Ticks -> Aggregator (Tính toán chỉ số kỹ thuật: OHLCV, RSI, MACD) -> LLM Context Window (Giảm tải chi phí và tăng độ chính xác cho Chatbot).

### 2. Thiết kế Chi tiết Cấu phần Worker

Lớp Ingestion Worker được xây dựng dựa trên nền tảng lập trình bất đồng bộ (Asynchronous Event Loop) để tối ưu hóa tài nguyên hệ thống khi duy trì hàng loạt kết nối mạng đồng thời. Worker được chia thành 4 mô-đun chức năng độc lập:

#### A. Mô-đun Quản lý Kết nối (Connection Manager)

* **Chức năng:** Chịu trách nhiệm khởi tạo, duy trì và giám sát vòng đời của các kết nối WebSocket đến Binance, Finnhub, Twelve Data.
* **Cơ chế giữ mạng:** Thực hiện các thủ tục bắt tay (handshake), đăng ký danh mục tài sản (subscribe) và phản hồi mã độc lập đối với các gói tin kiểm tra trạng thái (Ping/Pong Heartbeat) từ phía nhà cung cấp.
* **Xử lý sự cố mạng:** Tích hợp giải thuật **Exponential Backoff** (Thời gian chờ thử lại tăng theo hàm mũ: 1s, 2s, 4s, 8s...) khi mất kết nối đột ngột, ngăn chặn việc gửi yêu cầu dồn dập khiến IP của hệ thống bị các đối tác block do nghi ngờ DDOS.

#### B. Mô-đun Chuẩn hóa Dữ liệu (Data Normalizer)

* **Chức năng:** Tiếp nhận các cấu trúc JSON thô, không đồng nhất từ các sàn khác nhau và chuyển đổi về một cấu trúc dữ liệu duy nhất dùng chung trong toàn hệ thống.
* **Internal Tick Model (Định dạng chuẩn hóa đầu ra):**

```json
{
  "symbol": "BTCUSDT",
  "timestamp": 1672531199000,
  "price": 16500.00,
  "volume": 0.01,
  "source": "binance"
}

```

#### C. Bộ đệm & Kiểm soát Áp lực Ghi (Backpressure & Batching Buffer)

* **Vấn đề giải quyết:** WebSocket là luồng đẩy liên tục không chờ đợi. Nếu Worker thực hiện truy vấn ghi trực tiếp (`INSERT`) vào Cassandra cho từng tick, một sự sụt giảm hiệu năng nhỏ từ phía DB sẽ gây nghẽn toàn bộ luồng mạng và làm rơi rớt dữ liệu (Drop packages).
* **Cơ chế giải quyết:**
1. **In-Memory Queue:** Sau khi dữ liệu được chuẩn hóa, mô-đun mạng đẩy ngay lập tức vào một hàng đợi bất đồng bộ trong bộ nhớ (ví dụ: `asyncio.Queue`). Tác vụ nhận tin được giải phóng ngay để tiếp tục nghe cổng mạng.
2. **Micro-Batching Writer:** Một tiến trình chạy ngầm (Background Task) tách biệt thực hiện "hút" dữ liệu từ hàng đợi ra. Tiến trình này gom các bản ghi lại theo lô (Batch) dựa trên hai điều kiện kích hoạt: Đạt số lượng bản ghi tối đa (ví dụ: 500 ticks) hoặc đạt giới hạn thời gian (tối đa 50ms).



#### D. Mô-đun Ghi Dữ liệu Cassandra (Cassandra Writer)

* Sử dụng cơ chế **Asynchronous Executions** (thực thi bất đồng bộ thông qua các Driver được hỗ trợ) để đẩy các lô dữ liệu đã được gom vào Cassandra, giảm thiểu tối đa round-trip time (RTT).

### 3. Chiến lược Thiết kế Schema Cassandra chống Hot Partition

Để đạt được mục tiêu tối ưu dung lượng phân vùng dưới 100MB và phân phối đều dữ liệu trên toàn cụm (Cluster), cấu trúc bảng lưu trữ dữ liệu thô được thiết kế như sau:

#### Cấu trúc Bảng Đề xuất (Dữ liệu Raw Ticks)

```sql
CREATE TABLE market_data.raw_ticks (
    symbol text,
    bucket_date date,
    tick_time timestamp,
    price decimal,
    volume decimal,
    source text,
    PRIMARY KEY ((symbol, bucket_date), tick_time)
) WITH CLUSTERING ORDER BY (tick_time DESC);

```

#### Phân tích Cơ chế Hoạt động:

* **Composite Partition Key `((symbol, bucket_date))`:** Khóa phân vùng kết hợp giữa mã tài sản (`symbol`) và ngày giao dịch (`bucket_date`). Cơ chế này đảm bảo toàn bộ dữ liệu biến động giá của một mã cụ thể trong một ngày duy nhất sẽ nằm chung trên một phân vùng (Partition).
* *Kiểm soát dung lượng:* Đối với hầu hết các tài sản tài chính, lượng tick phát sinh trong vòng 24 giờ hoàn toàn không thể vượt quá ngưỡng giới hạn nghiêm ngặt 100MB.
* *Tùy biến mở rộng (Scale-out):* Với các mã có tần suất giao dịch đột biến (gây nguy cơ vượt 100MB/ngày), cấu trúc `bucket_date` có thể được phân rã sâu hơn thành `bucket_hour` (lưu trữ theo giờ) mà không làm thay đổi logic hoạt động của các tầng phía trên.


* **Clustering Key `(tick_time DESC)`:** Định hướng sắp xếp dữ liệu vật lý bên trong phân vùng theo thứ tự thời gian giảm dần. Điều này tối ưu hóa tuyệt đối cho các truy vấn lấy danh sách biến động giá mới nhất từ hệ thống hoặc phục vụ luồng tổng hợp dữ liệu thời gian thực.

## Affected Objects

* `No Synchronization Required` (Do đây là tài liệu kiến trúc nền tảng đầu tiên được thiết lập cho phân hệ này).

## Related Knowledge

* **Cassandra Architecture:** Tìm hiểu sâu cơ chế Compaction Strategy (ưu tiên chọn SizeTieredCompactionStrategy hoặc TimeWindowCompactionStrategy cho dữ liệu chuỗi thời gian) để tối ưu hiệu năng đĩa cứng khi ghi tần suất cao.
* **Distributed Message Brokers:** Nghiên cứu tích hợp Apache Kafka hoặc Redis Streams làm lớp đệm trung gian bền vững (Persistent Buffer Layer) thay thế cho In-Memory Queue trong trường hợp hệ thống yêu cầu tính sẵn sàng cao (High Availability) và khả năng chịu lỗi (Fault Tolerance) khi Worker bị sập nguồn đột ngột.
* **Data Aggregation Pipelines:** Các kỹ thuật tính toán chỉ số kỹ thuật dạng cửa sổ trượt (Sliding Window, Tumbling Window) phục vụ nạp ngữ cảnh tinh gọn cho các Mô hình ngôn ngữ lớn (LLM).