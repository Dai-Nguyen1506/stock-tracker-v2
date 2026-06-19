import { useEffect, useState } from 'react';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/live';

export interface TickData {
  symbol: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  event_type: string;
}

export interface PredictionData {
  symbol: string;
  predicted_close: number;
  confidence_upper: number;
  confidence_lower: number;
  timestamp: number;
  target_timestamp: number;
  model_name: string;
}

type WSMessage = 
  | { type: 'tick'; data: TickData }
  | { type: 'prediction'; data: PredictionData };

type TickListener = (data: TickData) => void;
type PredictionListener = (data: PredictionData) => void;

// Global subscription pools to share a single connection
const tickListeners = new Set<TickListener>();
const predictionListeners = new Set<PredictionListener>();

let socketInstance: WebSocket | null = null;
let reconnectTimer: number | null = null;
let delay = 1000;
let connecting = false;

const startConnection = () => {
  if (socketInstance || connecting) return;
  connecting = true;

  console.log(`[WS] Initializing connection to ${WS_URL}`);
  const ws = new WebSocket(WS_URL);
  socketInstance = ws;

  ws.onopen = () => {
    console.log('[WS] Connection open.');
    connecting = false;
    delay = 1000; // Reset reconnection backoff
  };

  ws.onmessage = (event) => {
    try {
      const parsed: WSMessage = JSON.parse(event.data);
      if (parsed.type === 'tick') {
        tickListeners.forEach(cb => cb(parsed.data));
      } else if (parsed.type === 'prediction') {
        predictionListeners.forEach(cb => cb(parsed.data));
      }
    } catch (e) {
      console.error('[WS] Parse message error:', e);
    }
  };

  ws.onclose = () => {
    console.log(`[WS] Closed. Attempting reconnect in ${delay}ms...`);
    socketInstance = null;
    connecting = false;
    
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = window.setTimeout(() => {
      delay = Math.min(delay * 1.5, 30000); // 30s limit
      startConnection();
    }, delay);
  };

  ws.onerror = (e) => {
    console.error('[WS] Error:', e);
    ws.close();
  };
};

export const useWebSocket = (
  onTick?: TickListener,
  onPrediction?: PredictionListener
) => {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    startConnection();

    // Monitor socket health
    const interval = setInterval(() => {
      setConnected(socketInstance?.readyState === WebSocket.OPEN);
    }, 1000);

    // Register listeners
    if (onTick) tickListeners.add(onTick);
    if (onPrediction) predictionListeners.add(onPrediction);

    return () => {
      clearInterval(interval);
      if (onTick) tickListeners.delete(onTick);
      if (onPrediction) predictionListeners.delete(onPrediction);
    };
  }, [onTick, onPrediction]);

  const send = (msg: any) => {
    if (socketInstance?.readyState === WebSocket.OPEN) {
      socketInstance.send(JSON.stringify(msg));
    } else {
      console.warn('[WS] Cannot send: Socket not open');
    }
  };

  return { connected, send };
};
