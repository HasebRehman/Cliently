import { useEffect, useRef, useState, useCallback } from 'react';
import { tokenStore } from '../lib/tokenStore.js';
import { useAuth } from '../contexts/AuthContext.js';
import { ChatMessage, TypingUser } from '../types/chat.js';

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

export interface UseChatSocketOptions {
  activeRoomId: string | null;
  onNewMessage?: (message: ChatMessage) => void;
  onMessagesRead?: (payload: { roomId: string; userId: string; messageIds: string[]; readAt: string }) => void;
  onRoomCreated?: (room: any) => void;
  onConversationUpdated?: (payload: { roomId: string; lastMessage: any }) => void;
  onMessageDeleted?: (payload: { roomId: string; messageId: string }) => void;
  onParticipantsAdded?: (payload: { roomId: string; participants: any[] }) => void;
  onParticipantRemoved?: (payload: { roomId: string; userId: string; userName: string }) => void;
  onRemovedFromRoom?: (payload: { roomId: string }) => void;
}

export function useChatSocket(options: UseChatSocketOptions) {
  const { activeOrgId, user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const typingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const activeRoomId = options.activeRoomId;

  // Cleanup typing indicators
  const clearTypingTimer = (userId: string) => {
    const existing = typingTimeoutsRef.current.get(userId);
    if (existing) {
      clearTimeout(existing);
      typingTimeoutsRef.current.delete(userId);
    }
  };

  // Connect WebSocket
  useEffect(() => {
    const token = tokenStore.getAccessToken();
    if (!token || !activeOrgId) {
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
      if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) {
        return;
      }

      const rawWsUrl = ((import.meta as any).env?.VITE_WS_URL as string) || '';
      let baseWsUrl = rawWsUrl.trim();
      if (!baseWsUrl) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;
        baseWsUrl = `${protocol}//${host}:5000/ws/chat`;
      }

      const separator = baseWsUrl.includes('?') ? '&' : '?';
      const wsUrl = `${baseWsUrl}${separator}token=${encodeURIComponent(token)}&orgId=${encodeURIComponent(activeOrgId)}`;

      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        if (!isMounted) return;
        setIsConnected(true);

        // Start ping interval
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'PING' }));
          }
        }, 25000);

        // If a room is already active, join it
        if (optionsRef.current.activeRoomId) {
          ws.send(JSON.stringify({
            type: 'JOIN_ROOM',
            roomId: optionsRef.current.activeRoomId,
          }));
        }
      };

      ws.onmessage = (event) => {
        if (!isMounted) return;
        try {
          const data: WebSocketMessage = JSON.parse(event.data);

          switch (data.type) {
            case 'PONG':
              break;

            case 'NEW_MESSAGE':
              if (optionsRef.current.onNewMessage && data.message) {
                optionsRef.current.onNewMessage(data.message);
              }
              break;

            case 'MESSAGES_READ':
              if (optionsRef.current.onMessagesRead) {
                optionsRef.current.onMessagesRead({
                  roomId: data.roomId,
                  userId: data.userId,
                  messageIds: data.messageIds,
                  readAt: data.readAt,
                });
              }
              break;

            case 'TYPING_INDICATOR':
              if (data.roomId === optionsRef.current.activeRoomId && data.userId !== user?.id) {
                const { userId, isTyping, userName, avatarUrl } = data;
                clearTypingTimer(userId);

                if (isTyping) {
                  setTypingUsers((prev) => {
                    const exists = prev.some((u) => u.userId === userId);
                    if (exists) return prev;
                    return [...prev, { userId, userName, avatarUrl }];
                  });

                  // Auto-remove typing after 3.5 seconds in case blur/stop is dropped
                  const timeout = setTimeout(() => {
                    setTypingUsers((prev) => prev.filter((u) => u.userId !== userId));
                    typingTimeoutsRef.current.delete(userId);
                  }, 3500);
                  typingTimeoutsRef.current.set(userId, timeout);
                } else {
                  setTypingUsers((prev) => prev.filter((u) => u.userId !== userId));
                }
              }
              break;

            case 'ROOM_CREATED':
              if (optionsRef.current.onRoomCreated && data.room) {
                optionsRef.current.onRoomCreated(data.room);
              }
              break;

            case 'CONVERSATION_UPDATED':
              if (optionsRef.current.onConversationUpdated) {
                optionsRef.current.onConversationUpdated({
                  roomId: data.roomId,
                  lastMessage: data.lastMessage,
                });
              }
              break;

            case 'MESSAGE_DELETED':
              if (optionsRef.current.onMessageDeleted) {
                optionsRef.current.onMessageDeleted({
                  roomId: data.roomId,
                  messageId: data.messageId,
                });
              }
              break;

            case 'PARTICIPANTS_ADDED':
              if (optionsRef.current.onParticipantsAdded) {
                optionsRef.current.onParticipantsAdded({
                  roomId: data.roomId,
                  participants: data.participants,
                });
              }
              break;

            case 'PARTICIPANT_REMOVED':
              if (optionsRef.current.onParticipantRemoved) {
                optionsRef.current.onParticipantRemoved({
                  roomId: data.roomId,
                  userId: data.userId,
                  userName: data.userName,
                });
              }
              break;

            case 'REMOVED_FROM_ROOM':
              if (optionsRef.current.onRemovedFromRoom) {
                optionsRef.current.onRemovedFromRoom({
                  roomId: data.roomId,
                });
              }
              break;

            default:
              break;
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onclose = () => {
        if (!isMounted) return;
        setIsConnected(false);
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);

        // Try reconnecting in 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      ws.onerror = (err) => {
        console.warn('WebSocket connection error:', err);
        ws.close();
      };
    };

    connect();

    return () => {
      isMounted = false;
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      typingTimeoutsRef.current.forEach((t) => clearTimeout(t));
      typingTimeoutsRef.current.clear();
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [activeOrgId]);

  // Handle room joining/leaving on activeRoomId changes
  useEffect(() => {
    setTypingUsers([]);
    typingTimeoutsRef.current.forEach((t) => clearTimeout(t));
    typingTimeoutsRef.current.clear();

    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && activeRoomId) {
      ws.send(JSON.stringify({
        type: 'JOIN_ROOM',
        roomId: activeRoomId,
      }));

      return () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'LEAVE_ROOM',
            roomId: activeRoomId,
          }));
        }
      };
    }
  }, [activeRoomId]);

  // Send typing event
  const sendTyping = useCallback((roomId: string, isTyping: boolean) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'TYPING',
        roomId,
        isTyping,
      }));
    }
  }, []);

  // Send mark read
  const markRead = useCallback((roomId: string) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'MARK_READ',
        roomId,
      }));
    }
  }, []);

  return {
    isConnected,
    typingUsers,
    sendTyping,
    markRead,
  };
}
