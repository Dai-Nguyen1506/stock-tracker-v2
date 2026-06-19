import React, { useState, useEffect } from 'react';
import { useWebSocket, PredictionData, TickData } from '../hooks/useWebSocket';
import { Brain, ArrowUpRight, ArrowDownRight, Sparkles } from 'lucide-react';

interface PredictiveCardProps {
  symbol: string;
}

export const PredictiveCard: React.FC<PredictiveCardProps> = ({ symbol }) => {
  const [prediction, setPrediction] = useState<PredictionData | null>(null);
  const [lastClose, setLastClose] = useState<number | null>(null);

  // Monitor incoming ticks to benchmark prediction accuracy and calculate trend direction
  useWebSocket(
    (tick: TickData) => {
      if (tick.symbol.toUpperCase() === symbol.toUpperCase()) {
        setLastClose(tick.close);
      }
    },
    (pred: PredictionData) => {
      if (pred.symbol.toUpperCase() === symbol.toUpperCase()) {
        setPrediction(pred);
      }
    }
  );

  // Reset local state when selected ticker shifts
  useEffect(() => {
    setPrediction(null);
  }, [symbol]);

  const isBullish = prediction && lastClose ? prediction.predicted_close >= lastClose : false;
  const difference = prediction && lastClose ? prediction.predicted_close - lastClose : 0;
  const percentage = lastClose ? (difference / lastClose) * 100 : 0;

  return (
    <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', height: '100%', minHeight: '340px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-accent)', fontWeight: 600, fontFamily: 'var(--font-title)', fontSize: '1.1rem' }}>
            <Brain size={20} />
            Dự Báo Xu Hướng AI
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Mô hình: {prediction ? prediction.model_name : 'ARIMA(2,1,0)'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', color: 'var(--color-gold)', background: 'rgba(251, 191, 36, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
          <Sparkles size={12} />
          Chu kỳ 10s
        </div>
      </div>

      {!prediction ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, textAlign: 'center', padding: '1rem', color: 'var(--text-secondary)' }}>
          <div className="animate-pulse-glow" style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
            <Brain size={20} color="var(--color-accent)" />
          </div>
          <p style={{ fontSize: '0.85rem', fontWeight: 500 }}>Đang khớp mô hình dự báo...</p>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>Chờ dữ liệu chuỗi thời gian từ Cassandra (khoảng 20 giây)</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1, justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Dự đoán giá trị đóng cửa kế tiếp:</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', marginTop: '0.4rem' }}>
              <div style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'var(--font-title)', color: '#fff' }}>
                ${prediction.predicted_close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
              </div>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.1rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: isBullish ? 'var(--color-bullish)' : 'var(--color-bearish)',
                background: isBullish ? 'var(--color-bullish-bg)' : 'var(--color-bearish-bg)',
                padding: '0.15rem 0.4rem',
                borderRadius: '6px'
              }}>
                {isBullish ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {isBullish ? '+' : ''}{percentage.toFixed(3)}%
              </div>
            </div>
          </div>

          <div style={{ background: 'rgba(255, 255, 255, 0.015)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.75rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.4rem' }}>
              Khoảng biến thiên tin cậy (95% CI)
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Cận trên (Tối đa):</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                ${prediction.confidence_upper.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Cận dưới (Tối thiểu):</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                ${prediction.confidence_lower.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
            <span>Định dạng mục tiêu lúc:</span>
            <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
              {new Date(prediction.target_timestamp).toLocaleTimeString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
export default PredictiveCard;
