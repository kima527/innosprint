// ============================================================================
//  useWebSocket.js — Custom React hook for the driving-analysis WebSocket
// ============================================================================
//  Encapsulates all connection management so App.jsx stays clean.
//
//  Usage:
//    const { messages, connected } = useWebSocket('ws://localhost:8000/ws/driving-analysis');
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';

const WS_URL = 'ws://localhost:8000/ws/driving-analysis';

/**
 * Custom hook that manages a WebSocket connection and exposes the latest
 * incoming JSON messages as state.
 *
 * @returns {{ messages: object[], connected: boolean, reconnectCount: number }}
 */
export function useWebSocket() {
  const [messages, setMessages]           = useState([]);
  const [connected, setConnected]         = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0);

  const wsRef         = useRef(null);   // live WebSocket instance
  const mountedRef    = useRef(true);   // prevent state updates after unmount
  const retryTimerRef = useRef(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      console.info('[WS] Connection established.');
      setConnected(true);
      setReconnectCount(0);
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const parsed = JSON.parse(event.data);
        // Prepend new messages so the newest appears at the top of the log
        setMessages((prev) => [parsed, ...prev].slice(0, 100)); // cap at 100
      } catch (err) {
        console.warn('[WS] Could not parse message:', event.data, err);
      }
    };

    ws.onerror = (err) => {
      console.error('[WS] Error:', err);
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setConnected(false);
      console.warn('[WS] Disconnected. Retrying in 4 s…');
      // Auto-reconnect with back-off
      retryTimerRef.current = setTimeout(() => {
        if (mountedRef.current) {
          setReconnectCount((n) => n + 1);
          connect();
        }
      }, 4000);
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      clearTimeout(retryTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { messages, connected, reconnectCount };
}
