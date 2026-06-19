import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # App Settings
    APP_NAME: str = "Stock Tracker API"
    DEBUG: bool = False

    # Cassandra Settings
    CASSANDRA_HOST: str = os.getenv("CASSANDRA_HOST", "localhost")
    CASSANDRA_PORT: int = int(os.getenv("CASSANDRA_PORT", 9042))
    CASSANDRA_KEYSPACE: str = "stock_tracker"

    # PostgreSQL Settings
    POSTGRES_HOST: str = os.getenv("POSTGRES_HOST", "localhost")
    POSTGRES_PORT: int = int(os.getenv("POSTGRES_PORT", 5432))
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "stock_tracker")
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "postgres")

    # Binance WebSocket API
    BINANCE_WS_URL: str = "wss://stream.binance.com:9443"
    
    # Tracked Symbols (lowercase for Binance WebSocket subscription)
    TRACKED_SYMBOLS: list[str] = [
        "btcusdt",
        "ethusdt",
        "solusdt",
        "bnbusdt",
        "adausdt",
        "xrpusdt"
    ]

    class Config:
        env_file = ".env"

settings = Settings()
