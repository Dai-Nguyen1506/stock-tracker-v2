import React, { useEffect, useState } from 'react';
import { useWebSocket, TickData } from '../hooks/useWebSocket';
import { Star } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const ASSETS = [
  { symbol: 'BTCUSDT', name: 'Bitcoin', logo: '₿' },
  { symbol: 'ETHUSDT', name: 'Ethereum', logo: 'Ξ' },
  { symbol: 'SOLUSDT', name: 'Solana', logo: '◎' },
  { symbol: 'BNBUSDT', name: 'BNB Coin', logo: '🔶' },
  { symbol: 'ADAUSDT', name: 'Cardano', logo: '₳' },
  { symbol: 'XRPUSDT', name: 'Ripple', logo: '✕' },
];

interface TickerSelectorProps {
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
}

interface PriceState {
  price: number;
  direction: 'up' | 'down' | 'flat';
}

export const TickerSelector: React.FC<TickerSelectorProps> = ({ selectedSymbol, onSelectSymbol }) => {
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [prices, setPrices] = useState<Record<string, PriceState>>({});

  // Sync watchlist state with Postgres on startup
  useEffect(() => {
    const fetchWatchlist = async () => {
      try {
        const res = await fetch(`${API_URL}/watchlist`);
        if (res.ok) {
          const list = await res.json();
          setWatchlist(list.map((s: string) => s.toUpperCase()));
        }
      } catch (err) {
        console.error('[Watchlist] Fetch error:', err);
      }
    };
    fetchWatchlist();
  }, []);

  // Update live pricing in sidebar
  useWebSocket((tick: TickData) => {
    const symbol = tick.symbol.toUpperCase();
    setPrices(prev => {
      const prevVal = prev[symbol];
      let direction: 'up' | 'down' | 'flat' = 'flat';
      if (prevVal) {
        if (tick.close > prevVal.price) {
          direction = 'up';
        } else if (tick.close < prevVal.price) {
          direction = 'down';
        } else {
          direction = prevVal.direction;
        }
      }
      return {
        ...prev,
        [symbol]: { price: tick.close, direction }
      };
    });
  });

  // Toggle PostgreSQL persistence for watchlist
  const handleToggleWatchlist = async (e: React.MouseEvent, symbol: string) => {
    e.stopPropagation(); // Stop parent click selection trigger
    const inWatchlist = watchlist.includes(symbol);

    try {
      if (inWatchlist) {
        const res = await fetch(`${API_URL}/watchlist/${symbol}`, { method: 'DELETE' });
        if (res.ok) {
          setWatchlist(prev => prev.filter(s => s !== symbol));
        }
      } else {
        const res = await fetch(`${API_URL}/watchlist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol })
        });
        if (res.ok) {
          setWatchlist(prev => [...prev, symbol]);
        }
      }
    } catch (err) {
      console.error('[Watchlist] Sync error:', err);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontFamily: 'var(--font-title)', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
          Tài Sản Theo Dõi
        </h3>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          {watchlist.length} ưa thích
        </span>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {ASSETS.map(asset => {
          const sym = asset.symbol;
          const info = prices[sym];
          const active = selectedSymbol.toUpperCase() === sym;
          const favored = watchlist.includes(sym);

          let priceColor = 'var(--text-primary)';
          if (info?.direction === 'up') priceColor = 'var(--color-bullish)';
          if (info?.direction === 'down') priceColor = 'var(--color-bearish)';

          return (
            <div
              key={sym}
              onClick={() => onSelectSymbol(sym.toLowerCase())}
              className={`ticker-row ${active ? 'active-row' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.85rem 1rem',
                borderRadius: '12px',
                cursor: 'pointer',
                background: active ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255, 255, 255, 0.015)',
                border: active ? '1px solid var(--color-accent)' : '1px solid var(--border-color)',
                transition: 'background var(--transition-smooth), border-color var(--transition-smooth)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                <span style={{ 
                  fontSize: '1.2rem', 
                  display: 'flex', 
                  width: '32px', 
                  height: '32px', 
                  background: active ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.03)', 
                  borderRadius: '50%', 
                  alignItems: 'center', 
                  justifyContent: 'center' 
                }}>
                  {asset.logo}
                </span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff' }}>{sym}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{asset.name}</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ 
                  fontFamily: 'var(--font-title)', 
                  fontWeight: 600, 
                  fontSize: '0.9rem', 
                  color: priceColor,
                  transition: 'color 0.1s ease'
                }}>
                  {info ? `$${info.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '---'}
                </span>

                <button
                  onClick={(e) => handleToggleWatchlist(e, sym)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: favored ? 'var(--color-gold)' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0.2rem',
                    transition: 'color var(--transition-smooth)'
                  }}
                >
                  <Star size={16} fill={favored ? 'var(--color-gold)' : 'none'} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
export default TickerSelector;
