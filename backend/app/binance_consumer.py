import asyncio
import json
import logging
from datetime import datetime, timezone
import websockets
from app.config import settings
from app.db import get_cassandra_session
from app.models import MarketDataPayload
from app.websocket_manager import manager

logger = logging.getLogger(__name__)

async def start_binance_consumer():
    streams = "/".join([f"{s}@kline_1s" for s in settings.TRACKED_SYMBOLS])
    ws_url = f"{settings.BINANCE_WS_URL}/stream?streams={streams}"
    
    logger.info(f"Connecting to Binance WebSocket streams: {streams}")
    
    while True:
        try:
            async with websockets.connect(ws_url) as ws:
                logger.info("Connected to Binance WebSocket API successfully!")
                while True:
                    message = await ws.recv()
                    data = json.loads(message)
                    
                    stream_data = data.get("data", {})
                    event_type = stream_data.get("e")
                    
                    if event_type == "kline":
                        symbol = stream_data.get("s").upper()
                        kline = stream_data.get("k", {})
                        
                        timestamp = kline.get("t")
                        o = float(kline.get("o"))
                        h = float(kline.get("h"))
                        l = float(kline.get("l"))
                        c = float(kline.get("c"))
                        v = float(kline.get("v"))
                        
                        dt = datetime.fromtimestamp(timestamp / 1000, tz=timezone.utc)
                        # Remove timezone info for simpler Cassandra format
                        dt_naive = dt.replace(tzinfo=None)
                        bucket_date = dt.strftime("%Y-%m-%d")
                        
                        payload = MarketDataPayload(
                            symbol=symbol,
                            timestamp=timestamp,
                            open=o,
                            high=h,
                            low=l,
                            close=c,
                            volume=v,
                            event_type="kline_1s"
                        )
                        
                        # Write to Cassandra asynchronously
                        try:
                            session = get_cassandra_session()
                            query = """
                                INSERT INTO market_data (symbol, bucket_date, timestamp, open, high, low, close, volume, event_type)
                                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                            """
                            session.execute_async(query, (
                                payload.symbol,
                                bucket_date,
                                dt_naive,
                                payload.open,
                                payload.high,
                                payload.low,
                                payload.close,
                                payload.volume,
                                payload.event_type
                            ))
                        except Exception as db_err:
                            logger.error(f"Failed to write to Cassandra: {db_err}")
                        
                        # Broadcast to connected UI clients
                        await manager.broadcast({
                            "type": "tick",
                            "data": payload.model_dump()
                        })
                        
        except asyncio.CancelledError:
            logger.info("Binance consumer task has been cancelled.")
            break
        except Exception as e:
            logger.error(f"Binance consumer connection error: {e}. Reconnecting in 5 seconds...")
            await asyncio.sleep(5)
