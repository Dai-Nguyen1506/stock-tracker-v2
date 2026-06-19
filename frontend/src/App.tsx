import React, { useState, useEffect } from 'react';
import { TickerSelector } from './components/TickerSelector';
import { TradingChart } from './components/TradingChart';
import { PredictiveCard } from './components/PredictiveCard';
import { useWebSocket, TickData } from './hooks/useWebSocket';
import { Cpu, TrendingUp, TrendingDown, Coins, Activity } from 'lucide-react';

export default function App() {
  const [selectedSymbol, setSelectedSymbol] = useState('btcusdt');
  const [currentTick, setCurrentTick] = useState<TickData | null>(null);

  // Monitor live updates for the active symbol to feed statistics
  const { connected } = useWebSocket((tick: TickData) => {
    if (tick.symbol.toUpperCase() === selectedSymbol.toUpperCase()) {
      setCurrentTick(tick);
    }
  });

  // Clear stale ticks when changing assets
  useEffect(() => {
    setCurrentTick(null);
  }, [selectedSymbol]);

  const upperSymbol = selectedSymbol.toUpperCase();

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-logo">
          <Cpu size={24} color="var(--color-accent)" />
          <span style={{ fontWeight: 700 }}>AI Market Tracker</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Server:</span>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            background: connected ? 'rgba(16, 185, 129, 0.08)' : 'rgba(244, 63, 94, 0.08)',
            color: connected ? 'var(--color-bullish)' : 'var(--color-bearish)',
            padding: '0.3rem 0.75rem',
            borderRadius: '30px',
            fontSize: '0.75rem',
            fontWeight: 600,
            border: `1px solid ${connected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)'}`
          }}>
            <span className={connected ? 'animate-pulse-glow' : ''} style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: connected ? 'var(--color-bullish)' : 'var(--color-bearish)',
              display: 'inline-block'
            }}></span>
            {connected ? 'ĐANG KẾT NỐI' : 'MẤT KẾT NỐI'}
          </span>
        </div>
      </header>

      <main className="app-main">
        <aside className="sidebar">
          <TickerSelector selectedSymbol={selectedSymbol} onSelectSymbol={setSelectedSymbol} />
        </aside>

        <section className="dashboard-content">
          {/* Key Metrics row */}
          <div className="stats-grid">
            {/* Price */}
            <div className="glass-card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--color-accent)', width: '42px', height: '42px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Coins size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Giá hiện tại ({upperSymbol})</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-title)', color: '#fff', marginTop: '0.15rem' }}>
                  {currentTick ? `$${currentTick.close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : '---'}
                </div>
              </div>
            </div>

            {/* High */}
            <div className="glass-card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: 'var(--color-bullish-bg)', color: 'var(--color-bullish)', width: '42px', height: '42px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingUp size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Cao nhất (24h)</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-title)', color: '#fff', marginTop: '0.15rem' }}>
                  {currentTick ? `$${currentTick.high.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '---'}
                </div>
              </div>
            </div>

            {/* Low */}
            <div className="glass-card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: 'var(--color-bearish-bg)', color: 'var(--color-bearish)', width: '42px', height: '42px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingDown size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Thấp nhất (24h)</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-title)', color: '#fff', marginTop: '0.15rem' }}>
                  {currentTick ? `$${currentTick.low.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '---'}
                </div>
              </div>
            </div>

            {/* Volume */}
            <div className="glass-card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: 'rgba(251, 191, 36, 0.08)', color: 'var(--color-gold)', width: '42px', height: '42px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Activity size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Khối lượng giao dịch</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-title)', color: '#fff', marginTop: '0.15rem' }}>
                  {currentTick ? currentTick.volume.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '---'}
                </div>
              </div>
            </div>
          </div>

          {/* Main Visualizer Area */}
          <div className="chart-area">
            <TradingChart symbol={selectedSymbol} />
            <PredictiveCard symbol={selectedSymbol} />
          </div>
        </section>
      </main>
    </div>
  );
}
