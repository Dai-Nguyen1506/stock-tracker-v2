import os
import time
import logging
from datetime import datetime, timezone, timedelta
import requests
import pandas as pd
import numpy as np
from cassandra.cluster import Cluster
from statsmodels.tsa.arima.model import ARIMA

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai_worker")

CASSANDRA_HOST = os.getenv("CASSANDRA_HOST", "localhost")
CASSANDRA_KEYSPACE = "stock_tracker"
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

# Active symbols list
SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "ADAUSDT", "XRPUSDT"]

def connect_cassandra():
    retries = 20
    delay = 5
    cluster = None
    
    for i in range(retries):
        try:
            logger.info(f"AI Worker connecting to Cassandra at {CASSANDRA_HOST} (attempt {i+1}/{retries})...")
            cluster = Cluster([CASSANDRA_HOST])
            session = cluster.connect(CASSANDRA_KEYSPACE)
            logger.info("AI Worker connected to Cassandra keyspace successfully!")
            return cluster, session
        except Exception as e:
            logger.warning(f"AI Worker Cassandra connection failed: {e}")
            if cluster:
                try:
                    cluster.shutdown()
                except Exception:
                    pass
            time.sleep(delay)
    raise Exception("AI Worker failed to connect to Cassandra after multiple attempts.")

def fetch_history(session, symbol, limit=100):
    now = datetime.now(timezone.utc)
    today_str = now.strftime("%Y-%m-%d")
    yesterday_str = (now - timedelta(days=1)).strftime("%Y-%m-%d")

    def query_bucket(bucket_date):
        query = """
            SELECT timestamp, close 
            FROM market_data 
            WHERE symbol = %s AND bucket_date = %s 
            LIMIT %s
        """
        rows = session.execute(query, (symbol, bucket_date, limit))
        return list(rows)

    try:
        # Load today's ticks
        results = query_bucket(today_str)
        
        # If we have less than needed, load yesterday's ticks
        if len(results) < limit:
            yesterday_rows = query_bucket(yesterday_str)
            needed = limit - len(results)
            results.extend(yesterday_rows[:needed])
            
        return results
    except Exception as e:
        logger.error(f"Error querying history from Cassandra for {symbol}: {e}")
        return []

def calculate_forecast(data):
    df = pd.DataFrame(data)
    if df.empty:
        return None

    # Transform timestamps and close prices
    df['timestamp_ms'] = df['timestamp'].apply(lambda x: int(x.replace(tzinfo=timezone.utc).timestamp() * 1000))
    df['close'] = df['close'].astype(float)
    
    # Sort ascending for time series analysis
    df = df.sort_values('timestamp_ms').reset_index(drop=True)

    # Need at least 20 ticks to build a forecast model
    if len(df) < 20:
        logger.info(f"Insufficient history ({len(df)} ticks). Skipping.")
        return None

    prices = df['close'].values
    last_timestamp = int(df['timestamp_ms'].iloc[-1])
    last_price = prices[-1]

    # Attempt ARIMA Fit
    try:
        # ARIMA(2, 1, 0) is quick and works well for high-frequency trends
        model = ARIMA(prices, order=(2, 1, 0))
        results = model.fit()
        
        steps = 5 # 5 steps ahead (5 seconds)
        forecast_res = results.get_forecast(steps=steps)
        conf_int = forecast_res.conf_int(alpha=0.05) # 95% confidence interval
        
        predicted_close = float(forecast_res.predicted_mean[-1])
        confidence_upper = float(conf_int[-1][1])
        confidence_lower = float(conf_int[-1][0])
        target_timestamp = last_timestamp + (steps * 1000)

        # Basic anomaly check
        if np.isnan(predicted_close) or np.isnan(confidence_upper) or np.isnan(confidence_lower):
            raise ValueError("ARIMA model outputted NaN values.")

        return {
            "predicted_close": predicted_close,
            "confidence_upper": confidence_upper,
            "confidence_lower": confidence_lower,
            "target_timestamp": target_timestamp,
            "model_name": "ARIMA(2,1,0)"
        }

    except Exception as err:
        logger.warning(f"ARIMA fitting failed for symbol. Falling back to linear trend regression. Error: {err}")
        # Robust linear fallback: y = ax + b
        n = len(prices)
        x = np.arange(n)
        
        # Fit last 15 records
        fit_len = min(15, n)
        a, b = np.polyfit(x[-fit_len:], prices[-fit_len:], 1)
        
        # Forecast 5 steps out
        predicted_close = float(a * (n - 1 + 5) + b)
        
        # Estimate variance based on standard deviation of recent prices
        std_dev = float(np.std(prices[-fit_len:]))
        if std_dev == 0:
            std_dev = last_price * 0.0001 # basic buffer

        confidence_upper = predicted_close + (1.96 * std_dev)
        confidence_lower = predicted_close - (1.96 * std_dev)
        target_timestamp = last_timestamp + (5 * 1000)

        return {
            "predicted_close": predicted_close,
            "confidence_upper": confidence_upper,
            "confidence_lower": confidence_lower,
            "target_timestamp": target_timestamp,
            "model_name": "LinearRegressionFallback"
        }

def submit_prediction(symbol, pred):
    payload = {
        "symbol": symbol,
        "predicted_close": pred["predicted_close"],
        "confidence_upper": pred["confidence_upper"],
        "confidence_lower": pred["confidence_lower"],
        "timestamp": int(time.time() * 1000),
        "target_timestamp": pred["target_timestamp"],
        "model_name": pred["model_name"]
    }
    
    url = f"{BACKEND_URL}/api/predictions"
    try:
        resp = requests.post(url, json=payload, timeout=5)
        if resp.status_code == 200:
            logger.info(f"Submitted {symbol} {payload['model_name']} forecast: {payload['predicted_close']:.2f}")
        else:
            logger.warning(f"Failed to submit forecast to API. Status code: {resp.status_code}")
    except Exception as e:
        logger.error(f"Error submitting prediction payload to backend: {e}")

def main():
    cluster, session = connect_cassandra()
    
    logger.info("Starting AI forecasting engine loop...")
    while True:
        try:
            for symbol in SYMBOLS:
                history = fetch_history(session, symbol, limit=100)
                if not history:
                    continue
                
                pred = calculate_forecast(history)
                if pred:
                    submit_prediction(symbol, pred)
            
            # Recalculate forecasts every 10 seconds
            time.sleep(10)
            
        except KeyboardInterrupt:
            logger.info("AI Worker engine interrupted by user. Shutting down.")
            break
        except Exception as e:
            logger.error(f"Unexpected error in AI forecasting loop: {e}")
            time.sleep(5)
            
    cluster.shutdown()

if __name__ == "__main__":
    main()
