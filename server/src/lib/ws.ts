import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from './prisma.js';

export interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  organizationId?: string;
  isAlive?: boolean;
  rooms?: Set<string>;
}

interface WsMessagePayload {
  type: string;
  roomId?: string;
  content?: string;
  isTyping?: boolean;
  messageId?: string;
  [key: string]: any;
}

class RealtimeChatServer {
  private wss: WebSocketServer | null = null;
  // Map of userId -> Set of connected WebSockets (user might have multiple tabs)
  private userSockets = new Map<string, Set<AuthenticatedWebSocket>>();
  // Map of roomId -> Set of connected WebSockets
  private roomSockets = new Map<string, Set<AuthenticatedWebSocket>>();

  init(httpServer: HttpServer): void {
    this.wss = new WebSocketServer({
      server: httpServer,
      path: '/ws/chat',
    });

    this.wss.on('connection', async (ws: AuthenticatedWebSocket, req) => {
      try {
        const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
        const token = url.searchParams.get('token');
        const orgId = url.searchParams.get('orgId');

        if (!token) {
          ws.close(4001, 'Authentication token required');
          return;
        }

        const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as {
          userId: string;
          sessionId: string;
        };

        if (!decoded?.userId) {
          ws.close(4002, 'Invalid authentication token');
          return;
        }

        ws.userId = decoded.userId;
        ws.organizationId = orgId || undefined;
        ws.isAlive = true;
        ws.rooms = new Set();

        const wasOffline = !this.userSockets.has(ws.userId) || this.userSockets.get(ws.userId)!.size === 0;

        // Register user socket
        if (!this.userSockets.has(ws.userId)) {
          this.userSockets.set(ws.userId, new Set());
        }
        this.userSockets.get(ws.userId)!.add(ws);

        // Setup ping/pong heartbeat
        ws.on('pong', () => {
          ws.isAlive = true;
        });

        // Handle incoming messages
        ws.on('message', async (data) => {
          try {
            const raw = data.toString();
            const message: WsMessagePayload = JSON.parse(raw);
            await this.handleClientMessage(ws, message);
          } catch (err) {
            console.error('Error handling WS message:', err);
          }
        });

        // Cleanup on close
        ws.on('close', () => {
          this.handleDisconnect(ws);
        });

        ws.on('error', (err) => {
          console.error('WS client error:', err);
          this.handleDisconnect(ws);
        });

        // Send connection confirmation with currently online users
        ws.send(JSON.stringify({
          type: 'CONNECTED',
          userId: ws.userId,
          onlineUserIds: this.getOnlineUserIds(),
        }));

        // If user just came online, broadcast to all other active connections
        if (wasOffline) {
          this.broadcastToAll({
            type: 'USER_PRESENCE',
            userId: ws.userId,
            isOnline: true,
          }, ws.userId);
        }
      } catch (err) {
        console.error('WS Connection Auth Error:', err);
        ws.close(4003, 'Unauthorized');
      }
    });

    // Periodic heartbeat check every 30s
    const interval = setInterval(() => {
      if (!this.wss) return;
      this.wss.clients.forEach((wsClient) => {
        const socket = wsClient as AuthenticatedWebSocket;
        if (socket.isAlive === false) {
          socket.terminate();
          return;
        }
        socket.isAlive = false;
        socket.ping();
      });
    }, 30000);

    this.wss.on('close', () => {
      clearInterval(interval);
    });

    console.log('📡 Realtime Chat WebSocket server initialized at /ws/chat');
  }

  private async handleClientMessage(ws: AuthenticatedWebSocket, payload: WsMessagePayload): Promise<void> {
    const { type, roomId } = payload;

    switch (type) {
      case 'JOIN_ROOM': {
        if (roomId) {
          this.joinRoom(ws, roomId);
          ws.send(JSON.stringify({ type: 'ROOM_JOINED', roomId }));
        }
        break;
      }

      case 'LEAVE_ROOM': {
        if (roomId) {
          this.leaveRoom(ws, roomId);
          ws.send(JSON.stringify({ type: 'ROOM_LEFT', roomId }));
        }
        break;
      }

      case 'TYPING': {
        if (roomId && ws.userId) {
          // Fetch typing user's info
          const user = await prisma.user.findUnique({
            where: { id: ws.userId },
            select: { id: true, firstName: true, lastName: true, avatarUrl: true },
          });

          if (user) {
            this.broadcastToRoom(roomId, {
              type: 'TYPING_UPDATE',
              roomId,
              user: {
                id: user.id,
                name: `${user.firstName} ${user.lastName}`.trim(),
                avatarUrl: user.avatarUrl,
              },
              isTyping: Boolean(payload.isTyping),
            }, ws.userId); // Exclude the sender
          }
        }
        break;
      }

      case 'MARK_READ': {
        if (roomId && ws.userId) {
          const now = new Date();

          // Update participant lastReadAt
          await prisma.chatParticipant.updateMany({
            where: { roomId, userId: ws.userId },
            data: { lastReadAt: now },
          });

          // Fetch unread messages in room not sent by this user
          const unreadMessages = await prisma.chatMessage.findMany({
            where: {
              roomId,
              senderId: { not: ws.userId },
              receipts: { none: { userId: ws.userId } },
            },
            select: { id: true },
          });

          if (unreadMessages.length > 0) {
            await prisma.chatMessageReceipt.createMany({
              data: unreadMessages.map((m) => ({
                messageId: m.id,
                userId: ws.userId!,
                readAt: now,
              })),
              skipDuplicates: true,
            });
          }

          // Broadcast MESSAGES_READ to room so sender's ticks immediately turn blue!
          this.broadcastToRoom(roomId, {
            type: 'MESSAGES_READ',
            roomId,
            userId: ws.userId,
            messageIds: unreadMessages.map((m) => m.id),
            readAt: now.toISOString(),
          });

          // Compute and broadcast updated total unread count for this user
          const userRooms = await prisma.chatParticipant.findMany({
            where: {
              userId: ws.userId,
              ...(ws.organizationId ? { room: { organizationId: ws.organizationId } } : {}),
            },
            select: { roomId: true, lastReadAt: true },
          });

          let totalUnread = 0;
          for (const r of userRooms) {
            const count = await prisma.chatMessage.count({
              where: {
                roomId: r.roomId,
                senderId: { not: ws.userId },
                ...(r.lastReadAt ? { createdAt: { gt: r.lastReadAt } } : {}),
                receipts: { none: { userId: ws.userId } },
              },
            });
            totalUnread += count;
          }

          this.broadcastToUser(ws.userId, {
            type: 'UNREAD_COUNT_CHANGED',
            totalUnread,
            roomId,
          });
        }
        break;
      }

      case 'GET_ONLINE_USERS': {
        ws.send(JSON.stringify({
          type: 'ONLINE_USERS',
          onlineUserIds: this.getOnlineUserIds(),
        }));
        break;
      }

      default:
        break;
    }
  }

  joinRoom(ws: AuthenticatedWebSocket, roomId: string): void {
    if (!ws.rooms) ws.rooms = new Set();
    ws.rooms.add(roomId);

    if (!this.roomSockets.has(roomId)) {
      this.roomSockets.set(roomId, new Set());
    }
    this.roomSockets.get(roomId)!.add(ws);
  }

  leaveRoom(ws: AuthenticatedWebSocket, roomId: string): void {
    if (ws.rooms) {
      ws.rooms.delete(roomId);
    }
    const roomSet = this.roomSockets.get(roomId);
    if (roomSet) {
      roomSet.delete(ws);
      if (roomSet.size === 0) {
        this.roomSockets.delete(roomId);
      }
    }
  }

  private handleDisconnect(ws: AuthenticatedWebSocket): void {
    if (ws.userId && this.userSockets.has(ws.userId)) {
      const set = this.userSockets.get(ws.userId)!;
      set.delete(ws);
      if (set.size === 0) {
        this.userSockets.delete(ws.userId);

        // Broadcast that user is now OFFLINE
        this.broadcastToAll({
          type: 'USER_PRESENCE',
          userId: ws.userId,
          isOnline: false,
        });
      }
    }

    if (ws.rooms) {
      ws.rooms.forEach((roomId) => {
        this.leaveRoom(ws, roomId);
      });
    }
  }

  /**
   * Returns list of currently connected user IDs
   */
  getOnlineUserIds(): string[] {
    const ids: string[] = [];
    for (const [userId, sockets] of this.userSockets.entries()) {
      if (sockets && sockets.size > 0) {
        ids.push(userId);
      }
    }
    return ids;
  }

  /**
   * Broadcast message to ALL connected clients
   */
  broadcastToAll(message: any, excludeUserId?: string): void {
    if (!this.wss) return;
    const payload = typeof message === 'string' ? message : JSON.stringify(message);

    this.wss.clients.forEach((client) => {
      const authClient = client as AuthenticatedWebSocket;
      if (authClient.readyState === WebSocket.OPEN) {
        if (!excludeUserId || authClient.userId !== excludeUserId) {
          authClient.send(payload);
        }
      }
    });
  }

  /**
   * Broadcast message to all connected clients in a specific room
   */
  broadcastToRoom(roomId: string, message: any, excludeUserId?: string): void {
    const sockets = this.roomSockets.get(roomId);
    if (!sockets || sockets.size === 0) return;

    const payload = typeof message === 'string' ? message : JSON.stringify(message);

    sockets.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        if (!excludeUserId || client.userId !== excludeUserId) {
          client.send(payload);
        }
      }
    });
  }

  /**
   * Send notification or event to a specific user across all their open sockets
   */
  broadcastToUser(userId: string, message: any): void {
    const sockets = this.userSockets.get(userId);
    if (!sockets || sockets.size === 0) return;

    const payload = typeof message === 'string' ? message : JSON.stringify(message);

    sockets.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }
}

export const realtimeChat = new RealtimeChatServer();
