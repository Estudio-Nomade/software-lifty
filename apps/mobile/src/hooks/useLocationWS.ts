import { useCallback, useEffect, useRef } from 'react';
import { getWsUrl } from '../lib/wsUrl';
import { useLocationStore } from '../store/locationStore';

const SEND_INTERVAL_MS = 5000;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

export function useLocationWS(enabled = true) {
  const wsRef = useRef<WebSocket | null>(null);
  const sendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const backoffRef = useRef(INITIAL_BACKOFF_MS);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const cleanup = useCallback(() => {
    if (sendIntervalRef.current) {
      clearInterval(sendIntervalRef.current);
      sendIntervalRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    cleanup();

    const url = getWsUrl();
    if (!url.includes('token=')) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      backoffRef.current = INITIAL_BACKOFF_MS;

      sendIntervalRef.current = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const { lat, lng, heading } = useLocationStore.getState();
        if (lat == null || lng == null) return;
        ws.send(JSON.stringify({ lat, lng, heading }));
      }, SEND_INTERVAL_MS);
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      if (!enabledRef.current) return;

      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
      }, backoffRef.current);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [cleanup]);

  useEffect(() => {
    mountedRef.current = true;

    if (enabled) {
      connect();
    } else {
      cleanup();
    }

    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [enabled, connect, cleanup]);
}
