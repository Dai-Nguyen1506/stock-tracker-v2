# Hệ Thống Theo Dõi Chứng Khoán & Crypto Thời Gian Thực Tích Hợp AI (ARIMA Forecast)

Ứng dụng web theo dõi biến động thị trường tài chính (Crypto) theo thời gian thực kết hợp AI dự báo giá, được xây dựng trên kiến trúc dịch vụ phân tách (decoupled services) để đảm bảo khả năng chịu tải ghi cao, mở rộng linh hoạt và độ trễ thấp.

---

## 🏗️ Kiến Trúc Hệ Thống (System Architecture)

Hệ thống được tổ chức thành 5 container hoạt động phối hợp:

1. **Data Ingestion & Backend (FastAPI):**
   * Kết nối WebSocket thời gian thực tới sàn Binance để nhận luồng nến Kline 1 giây (`btcusdt`, `ethusdt`, `solusdt`, `bnbusdt`, `adausdt`, `xrpusdt`).
   * Chuẩn hóa dữ liệu thô về `MarketDataPayload` (OHLCV) độc lập và lưu trữ bất đồng bộ vào Cassandra.
   * Quản lý kết nối Client và phát (`broadcast`) trực tiếp các bản ghi tick và tín hiệu dự báo qua WebSocket.
2. **Time-series Database (Apache Cassandra 4.1):**
   * Tối ưu hóa lưu trữ dữ liệu chuỗi thời gian khổng lồ với chiến lược phân vùng Composite Key `((symbol, bucket_date), timestamp)`.
   * Sử dụng thuật toán nén `TimeWindowCompactionStrategy` (TWCS) tối ưu cho vòng đời của chuỗi thời gian tài chính.
3. **Metadata Database (PostgreSQL 15):**
   * Lưu trữ metadata bền vững, phục vụ tính năng danh sách theo dõi yêu thích (`watchlist`) của người dùng.
4. **AI Forecasting Engine (Background Worker):**
   * Chạy ngầm lặp lại chu kỳ mỗi 10 giây để nạp dữ liệu lịch sử từ Cassandra.
   * Huấn luyện mô hình **ARIMA(2,1,0)** để dự báo giá đóng cửa trong 5 giây tới (kèm cận tin cậy 95% CI).
   * Tích hợp thuật toán hồi quy tuyến tính dự phòng (`LinearRegressionFallback`) tự động kích hoạt nếu ARIMA lỗi hội tụ, đảm bảo tiến trình ngầm không bao giờ bị gián đoạn.
5. **Frontend Dashboard (Vite + React + TS):**
   * Sử dụng thư viện **Lightweight Charts** của TradingView vẽ đồ thị nến và khối lượng thời gian thực.
   * **Tối ưu hóa hiệu năng cực cao:** Bỏ qua hoàn toàn cơ chế re-render React truyền thống đối với các cập nhật tick 1 giây bằng cách dùng `useRef` lưu giữ instance và gọi hàm cập nhật Canvas trực tiếp.
   * Tích hợp tính năng thêm yêu thích đồng bộ CSDL, bảng thống kê OHLCV, và đánh dấu điểm dự báo AI (markers) ngay trên nến đồ thị.

---

## 🛠️ Yêu Cầu Hệ Thống (Prerequisites)

* **Docker** (phiên bản 20.10 trở lên)
* **Docker Compose** (phiên bản 2.0 trở lên)

---

## 🚀 Hướng Dẫn Khởi Động Ứng Dụng

Chỉ với một lệnh duy nhất, toàn bộ hệ thống (gồm cả CSDL Cassandra & Postgres) sẽ tự động khởi dựng cấu trúc bảng và kết nối:

```bash
# Di chuyển vào thư mục dự án và chạy
docker-compose up --build -d
```

> [!NOTE]
> **Lưu ý trong lần khởi chạy đầu tiên:**
> Apache Cassandra cần khoảng **30 - 45 giây** để khởi động và cấu hình cụm nút ban đầu. FastAPI Backend đã tích hợp cơ chế kết nối lại tự động (retry loop mỗi 5 giây tối đa 20 lần) nên hệ thống sẽ tự động chờ Cassandra khỏe mạnh trước khi chạy migrations tạo keyspace/tables. Bạn không cần thực hiện thêm thao tác thủ công nào.

---

## 📍 Các Cổng Dịch Vụ Mặc Định

Sau khi các container báo trạng thái healthy, bạn có thể truy cập các địa chỉ sau:

* 🖥️ **Giao diện Dashboard (Frontend):** [http://localhost:5173](http://localhost:5173)
* ⚙️ **Tài liệu API (Swagger UI):** [http://localhost:8000/docs](http://localhost:8000/docs)
* 📊 **Cổng API Live Healthcheck:** [http://localhost:8000/api/health](http://localhost:8000/api/health)

---

## 📂 Sơ Đồ Cấu Trúc Mã Nguồn

```text
├── docker-compose.yml       # Điều phối dịch vụ container
├── backend/                 # FastAPI Broker & API
│   ├── app/
│   │   ├── main.py          # Khởi chạy API và lifecycle task
│   │   ├── db.py            # Chạy migration CSDL (Cassandra & Postgres)
│   │   ├── config.py        # Quản lý cấu hình & danh sách mã
│   │   ├── binance_consumer # Luồng WebSocket ingestion
│   │   └── websocket_manager# Broadcast dữ liệu thời gian thực
│   ├── Dockerfile
│   └── requirements.txt
├── ai_worker/               # background workers dự báo
│   ├── main.py              # Vòng lặp ARIMA(2,1,0) và linear fallback
│   ├── Dockerfile
│   └── requirements.txt
└── frontend/                # React Dashboard UI
    ├── src/
    │   ├── App.tsx          # Bố cục dashboard và bộ lắng nghe stats
    │   ├── components/
    │   │   ├── TradingChart # Biểu đồ nến hiệu năng cao v4
    │   │   ├── PredictiveCard # Widget hiển thị dự báo AI
    │   │   └── TickerSelector # Thanh bên chuyển đổi cặp & watchlist
    │   ├── hooks/
    │   │   └── useWebSocket.ts # Custom WebSocket hook chia sẻ kết nối
    │   └── index.css        # Hệ thống giao diện tối hiện đại
    ├── index.html
    └── Dockerfile
```

---

## 🔍 Cách Kiểm Tra Logs Dịch Vụ

Nếu cần gỡ lỗi hoặc theo dõi các tiến trình hoạt động dưới nền:

```bash
# Kiểm tra log nạp dữ liệu từ Binance và API
docker-compose logs -f backend

# Kiểm tra tiến trình huấn luyện mô hình ARIMA của AI worker
docker-compose logs -f ai-worker

# Xem log biên dịch frontend React
docker-compose logs -f frontend
```
