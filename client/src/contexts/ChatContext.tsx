import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext.js';
import { api } from '../lib/apiClient.js';
import { tokenStore } from '../lib/tokenStore.js';

interface ChatContextType {
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
  setUnreadCount: React.Dispatch<React.SetStateAction<number>>;
  subscribeToSocket: (handler: (event: any) => void) => () => void;
  sendSocketMessage: (data: any) => void;
  isConnected: boolean;
  onlineUserIds: Set<string>;
  isUserOnline: (userId?: string | null) => boolean;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, activeOrgId, isAuthenticated } = useAuth();
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  const socketRef = useRef<WebSocket | null>(null);
  const subscribersRef = useRef<Set<(event: any) => void>>(new Set());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Check if a specific user is currently online
  const isUserOnline = useCallback(
    (userId?: string | null) => {
      if (!userId) return false;
      return onlineUserIds.has(userId);
    },
    [onlineUserIds]
  );

  // 1. Fetch unread count from API
  const refreshUnreadCount = useCallback(async () => {
    if (!isAuthenticated || !activeOrgId) {
      setUnreadCount(0);
      return;
    }

    try {
      const data = await api.get<{ totalUnread: number }>('/api/v1/chat/unread-count');
      if (data && typeof data.totalUnread === 'number') {
        setUnreadCount(data.totalUnread);
      }
    } catch (err) {
      console.warn('Failed to fetch unread messages count:', err);
    }
  }, [isAuthenticated, activeOrgId]);

  // Fetch online users list from API
  const refreshOnlineUsers = useCallback(async () => {
    if (!isAuthenticated || !activeOrgId) {
      setOnlineUserIds(new Set());
      return;
    }

    try {
      const res = await api.get<{ onlineUserIds: string[] }>('/api/v1/chat/online-users');
      const data = (res as any)?.data || res;
      if (Array.isArray(data?.onlineUserIds)) {
        setOnlineUserIds(new Set(data.onlineUserIds));
      }
    } catch (err) {
      console.warn('Failed to fetch online users:', err);
    }
  }, [isAuthenticated, activeOrgId]);

  // Initial fetch on mount or org switch
  useEffect(() => {
    refreshUnreadCount();
    refreshOnlineUsers();
  }, [refreshUnreadCount, refreshOnlineUsers]);

  // 2. Manage Global WebSocket Connection for Realtime notifications across ALL pages
  useEffect(() => {
    const token = tokenStore.getAccessToken();
    if (!token || !activeOrgId || !isAuthenticated) {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    let isMounted = true;

    const connect = () => {
      if (!isMounted) return;
      if (
        socketRef.current &&
        (socketRef.current.readyState === WebSocket.OPEN ||
          socketRef.current.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname;
      // In dev backend runs on port 5000
      const wsUrl = `${protocol}//${host}:5000/ws/chat?token=${encodeURIComponent(token)}&orgId=${encodeURIComponent(activeOrgId)}`;

      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        if (!isMounted) return;
        setIsConnected(true);

        // Request online users list
        ws.send(JSON.stringify({ type: 'GET_ONLINE_USERS' }));

        // Start ping interval
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'PING' }));
          }
        }, 25000);

        // Fetch fresh unread count on connect
        refreshUnreadCount();
      };

      ws.onmessage = (event) => {
        if (!isMounted) return;
        try {
          const data = JSON.parse(event.data);

          // Handle online presence events
          if (data.type === 'CONNECTED' && Array.isArray(data.onlineUserIds)) {
            setOnlineUserIds(new Set(data.onlineUserIds));
          } else if (data.type === 'ONLINE_USERS' && Array.isArray(data.onlineUserIds)) {
            setOnlineUserIds(new Set(data.onlineUserIds));
          } else if (data.type === 'USER_PRESENCE' && data.userId) {
            setOnlineUserIds((prev) => {
              const next = new Set(prev);
              if (data.isOnline) {
                next.add(data.userId);
              } else {
                next.delete(data.userId);
              }
              return next;
            });
          }

          // Handle global unread count updates
          if (data.type === 'UNREAD_COUNT_CHANGED' && typeof data.totalUnread === 'number') {
            setUnreadCount(data.totalUnread);
          } else if (data.type === 'NEW_MESSAGE') {
            // Re-fetch or increment if notification received
            if (data.message && data.message.senderId !== user?.id) {
              refreshUnreadCount();
            }
          } else if (data.type === 'MESSAGES_READ') {
            refreshUnreadCount();
          }

          // Broadcast to all registered subscribers (e.g., active ChatPage)
          subscribersRef.current.forEach((subscriber) => {
            try {
              subscriber(data);
            } catch (e) {
              console.error('Error in socket subscriber callback:', e);
            }
          });
        } catch (err) {
          console.error('Error parsing WebSocket event:', err);
        }
      };

      ws.onclose = () => {
        if (!isMounted) return;
        setIsConnected(false);
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);

        // Auto-reconnect in 3s
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      ws.onerror = (err) => {
        console.warn('Global Chat WebSocket error:', err);
        ws.close();
      };
    };

    connect();

    return () => {
      isMounted = false;
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [activeOrgId, isAuthenticated, user?.id, refreshUnreadCount]);

  // 3. Subscription helper for page-level components
  const subscribeToSocket = useCallback((handler: (event: any) => void) => {
    subscribersRef.current.add(handler);
    return () => {
      subscribersRef.current.delete(handler);
    };
  }, []);

  // 4. Send socket message helper
  const sendSocketMessage = useCallback((data: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(typeof data === 'string' ? data : JSON.stringify(data));
    }
  }, []);

  return (
    <ChatContext.Provider
      value={{
        unreadCount,
        refreshUnreadCount,
        setUnreadCount,
        subscribeToSocket,
        sendSocketMessage,
        isConnected,
        onlineUserIds,
        isUserOnline,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChatContext = (): ChatContextType => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }
  return context;
};
