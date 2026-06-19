from pydantic import BaseModel

class MarketDataPayload(BaseModel):
    symbol: str
    timestamp: int  # Unix Epoch in milliseconds
    open: float
    high: float
    low: float
    close: float
    volume: float
    event_type: str = "kline_1s"

class PredictionPayload(BaseModel):
    symbol: str
    predicted_close: float
    confidence_upper: float
    confidence_lower: float
    timestamp: int        # When the prediction was generated
    target_timestamp: int # The target time of the forecast
    model_name: str       # E.g., ARIMA(2,1,0)

class WatchlistSymbol(BaseModel):
    symbol: str
