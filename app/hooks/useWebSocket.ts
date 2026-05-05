'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createWebSocketConnection,
  ReceivedMessage,
} from '@/app/lib/api';

interface UseWebSocketProps {
  token: string;
  onMessageReceived?: (message: ReceivedMessage) => void;
  onUserPresence?: (userId: string, online: boolean) => void;
  onError?: (error: string) => void;
  onRefreshTokenNeeded?: () => Promise<void>;
  enabled?: boolean;
}

export function useWebSocket({
  token,
  onMessageReceived,
  onUserPresence,
  onError,
  onRefreshTokenNeeded,
  enabled = true,
}: UseWebSocketProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 3000; // 3 seconds

  // Use refs for callbacks to avoid re-running the connect logic when they change
  const onMessageReceivedRef = useRef(onMessageReceived);
  const onUserPresenceRef = useRef(onUserPresence);
  const onErrorRef = useRef(onError);
  const onRefreshTokenNeededRef = useRef(onRefreshTokenNeeded);

  useEffect(() => { onMessageReceivedRef.current = onMessageReceived; }, [onMessageReceived]);
  useEffect(() => { onUserPresenceRef.current = onUserPresence; }, [onUserPresence]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { onRefreshTokenNeededRef.current = onRefreshTokenNeeded; }, [onRefreshTokenNeeded]);

  const connect = useCallback(() => {
    if (!token || !enabled || wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const ws = createWebSocketConnection(token);

    if (!ws) {
      onErrorRef.current?.('Failed to connect to real-time messaging');
      return;
    }

    ws.onopen = () => {
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.event === 'message.receive') {
          const encryptedMsg: ReceivedMessage = {
            id: data.id || `ws-${Date.now()}`,
            from_user_id: data.from_user_id || '',
            to_user_id: data.to_user_id || '',
            payload: {
              ciphertext: data.payload.ciphertext || '',
              encryptedKey: data.payload.encryptedKey || '',
              encryptedKeyForSelf: data.payload.encryptedKeyForSelf || '',
              iv: data.payload.iv || '',
            },
            created_at: data.created_at || new Date().toISOString(),
          };
          
          onMessageReceivedRef.current?.(encryptedMsg);
        } else if (data.event === 'user.online' || data.event === 'user.offline') {
          onUserPresenceRef.current?.(data.user_id, data.event === 'user.online');
        } else if (data.event === 'error') {
          onErrorRef.current?.(data.detail || 'WebSocket error');
        }
      } catch (e) {
        // Silent failure for malformed messages
      }
    };

    ws.onerror = (event: Event) => {
      setIsConnected(false);
    };

    ws.onclose = (event: CloseEvent) => {
      setIsConnected(false);

      if (event.code === 4001) {
        onRefreshTokenNeededRef.current?.().catch(() => {
          onErrorRef.current?.('Session expired. Please log in again.');
        });
      } else if (event.code === 4003 || event.code === 1008 || event.code === 1002) {
        onErrorRef.current?.(`Connection rejected by server (Code: ${event.code}). Please check your login.`);
        return; 
      }

      if (enabled && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, RECONNECT_DELAY);
      }
    };

    wsRef.current = ws;
  }, [token, enabled]); // Only depend on token and enabled

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    if (enabled && token) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, token, connect, disconnect]);

  const sendMessage = useCallback((to: string, payload: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        event: 'message.send',
        to,
        payload
      }));
      return true;
    }
    return false;
  }, []);

  return {
    isConnected,
    sendMessage,
    disconnect,
    reconnect: connect,
  };
}
