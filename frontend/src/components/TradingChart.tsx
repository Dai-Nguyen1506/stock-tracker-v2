import React, { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi } from 'lightweight-charts';
import { useWebSocket, TickData, PredictionData } from '../hooks/useWebSocket';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

interface TradingChartProps {
  symbol: string;
}

export const TradingChart: React.FC<TradingChartProps> = ({ symbol }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  
  // Track symbol in ref so callbacks don't read stale state
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial candles from Cassandra
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const fetchHistory = async () => {
      try {
        const response = await fetch(`${API_URL}/historical/${symbol}`);
        if (!response.ok) {
          throw new Error('Không thể tải dữ liệu lịch sử');
        }
        const data = await response.json();
        
        if (!active) return;

        if (seriesRef.current && volumeSeriesRef.current) {
          // Format candles
          seriesRef.current.setData(data);

          // Format volume
          const volumeData = data.map((d: any) => ({
            time: d.time,
            value: d.volume,
            color: d.close >= d.open ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)'
          }));
          volumeSeriesRef.current.setData(volumeData);
          
          chartRef.current?.timeScale().fitContent();
        }
        setLoading(false);
      } catch (err: any) {
        console.error('[Chart] Error loading history:', err);
        if (active) {
          setError(err.message || 'Có lỗi xảy ra');
          setLoading(false);
        }
      }
    };

    fetchHistory();

    return () => {
      active = false;
    };
  }, [symbol]);

  // Construct chart canvas on mount
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 450,
      layout: {
        background: { color: 'transparent' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: '#6366f1', width: 1, style: 2 },
        horzLine: { color: '#6366f1', width: 1, style: 2 },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        timeVisible: true,
        secondsVisible: true,
      },
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
    });

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });

    chart.priceScale('').applyOptions({
      scaleMargins: {
        top: 0.82,
        bottom: 0,
      },
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;
    volumeSeriesRef.current = volumeSeries;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // Real-time tick ingestion (Direct ref update to bypass React state re-renders)
  const onTickReceived = (tick: TickData) => {
    if (tick.symbol.toUpperCase() !== symbolRef.current.toUpperCase()) return;

    const seconds = Math.floor(tick.timestamp / 1000);

    seriesRef.current?.update({
      time: seconds,
      open: tick.open,
      high: tick.high,
      low: tick.low,
      close: tick.close
    });

    volumeSeriesRef.current?.update({
      time: seconds,
      value: tick.volume,
      color: tick.close >= tick.open ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)'
    });
  };

  // Real-time ARIMA prediction marker insertion
  const onPredictionReceived = (pred: PredictionData) => {
    if (pred.symbol.toUpperCase() !== symbolRef.current.toUpperCase()) return;

    const seconds = Math.floor(pred.timestamp / 1000);

    seriesRef.current?.setMarkers([
      {
        time: seconds,
        position: 'aboveBar',
        color: '#fbbf24',
        shape: 'arrowDown',
        text: `ARIMA Dự báo: $${pred.predicted_close.toFixed(2)}`,
        size: 1.5
      }
    ]);
  };

  useWebSocket(onTickReceived, onPredictionReceived);

  return (
    <div className="glass-card" style={{ padding: '1.5rem', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h2 style={{ fontFamily: 'var(--font-title)', fontWeight: 600, fontSize: '1.3rem' }}>
          Đồ Thị Giá Thời Gian Thực ({symbol.toUpperCase()})
        </h2>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {loading && <span style={{ color: 'var(--color-accent)', fontSize: '0.9rem' }}>Đang tải lịch sử...</span>}
          {error && <span style={{ color: 'var(--color-bearish)', fontSize: '0.9rem' }}>{error}</span>}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <span className="animate-pulse-glow" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
            Trực tiếp
          </div>
        </div>
      </div>
      <div ref={chartContainerRef} style={{ width: '100%', minHeight: '450px' }} />
    </div>
  );
};
export default TradingChart;
