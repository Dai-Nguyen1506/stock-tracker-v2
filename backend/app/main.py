import asyncio
import logging
from datetime import datetime, timedelta, timezone
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import init_cassandra, init_postgres, close_dbs, get_cassandra_session, get_postgres_conn
from app.models import WatchlistSymbol, PredictionPayload
from app.websocket_manager import manager
from app.binance_consumer import start_binance_consumer

logger = logging.getLogger(__name__)

# Manage background tasks
background_tasks = set()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup tasks
    logger.info("Initializing databases...")
    try:
        init_cassandra()
        init_postgres()
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        # We don't crash, but log it. The db modules will attempt reconnects on demand
        
    logger.info("Starting Binance WebSocket consumer task...")
    task = asyncio.create_task(start_binance_consumer())
    background_tasks.add(task)
    task.add_done_callback(background_tasks.discard)
    
    yield
    
    # Shutdown tasks
    logger.info("Stopping background tasks...")
    for t in background_tasks:
        t.cancel()
    
    close_dbs()
    logger.info("App shutdown complete.")

app = FastAPI(
    title=settings.APP_NAME,
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For dev environment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}

# Historical time-series query from Cassandra
@app.get("/api/historical/{symbol}")
async def get_historical(symbol: str, limit: int = 300):
    symbol = symbol.upper()
    try:
        session = get_cassandra_session()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Cassandra database connection unavailable: {e}")

    now = datetime.now(timezone.utc)
    today_str = now.strftime("%Y-%m-%d")
    yesterday_str = (now - timedelta(days=1)).strftime("%Y-%m-%d")

    results = []

    def fetch_bucket(bucket_date):
        query = """
            SELECT timestamp, open, high, low, close, volume 
            FROM market_data 
            WHERE symbol = %s AND bucket_date = %s 
            LIMIT %s
        """
        rows = session.execute(query, (symbol, bucket_date, limit))
        return list(rows)

    try:
        # Fetch today's bucket
        today_rows = fetch_bucket(today_str)
        results.extend(today_rows)
        
        # If we don't have enough entries, query yesterday's bucket to fill the chart
        if len(results) < limit:
            yesterday_rows = fetch_bucket(yesterday_str)
            needed = limit - len(results)
            results.extend(yesterday_rows[:needed])
    except Exception as e:
        logger.error(f"Error reading historical data from Cassandra: {e}")
        return []

    # Standardize output for TradingView Lightweight Charts
    formatted_data = []
    for r in results:
        # Convert naive datetime from Cassandra to UTC timestamp in seconds
        ts_seconds = int(r.timestamp.replace(tzinfo=timezone.utc).timestamp())
        formatted_data.append({
            "time": ts_seconds,
            "open": r.open,
            "high": r.high,
            "low": r.low,
            "close": r.close,
            "volume": r.volume
        })

    # Lightweight Charts requires ascending order
    formatted_data.sort(key=lambda x: x["time"])
    return formatted_data

# PostgreSQL Watchlist Endpoints
@app.get("/api/watchlist")
async def get_watchlist():
    try:
        conn = get_postgres_conn()
        with conn.cursor() as cur:
            cur.execute("SELECT symbol FROM watchlist ORDER BY added_at DESC")
            rows = cur.fetchall()
            return [r[0] for r in rows]
    except Exception as e:
        logger.error(f"Error fetching watchlist: {e}")
        return []

@app.post("/api/watchlist")
async def add_to_watchlist(payload: WatchlistSymbol):
    symbol = payload.symbol.upper()
    try:
        conn = get_postgres_conn()
        with conn.cursor() as cur:
            cur.execute("INSERT INTO watchlist (symbol) VALUES (%s) ON CONFLICT DO NOTHING", (symbol,))
            conn.commit()
        return {"status": "success", "message": f"Added {symbol} to watchlist"}
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

@app.delete("/api/watchlist/{symbol}")
async def remove_from_watchlist(symbol: str):
    symbol = symbol.upper()
    try:
        conn = get_postgres_conn()
        with conn.cursor() as cur:
            cur.execute("DELETE FROM watchlist WHERE symbol = %s", (symbol,))
            conn.commit()
        return {"status": "success", "message": f"Removed {symbol} from watchlist"}
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

# AI predictions endpoint (Worker pushes prediction updates here)
@app.post("/api/predictions")
async def add_prediction(payload: PredictionPayload):
    # Broadcast to all active client WebSockets
    await manager.broadcast({
        "type": "prediction",
        "data": payload.model_dump()
    })
    return {"status": "success"}

# Client real-time WebSocket connection endpoint
@app.websocket("/ws/live")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # We listen for messages to keep connection alive or handle client actions
            data = await websocket.receive_text()
    except Exception:
        pass
    finally:
        manager.disconnect(websocket)
