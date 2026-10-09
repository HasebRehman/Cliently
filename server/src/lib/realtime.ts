import { Response } from 'express';

interface SseClient {
  userId: string;
  res: Response;
}

const clients = new Map<string, Set<Response>>();

/**
 * Register an SSE connection for a user
 */
export function registerRealtimeClient(userId: string, res: Response): () => void {
  let userClients = clients.get(userId);
  if (!userClients) {
    userClients = new Set();
    clients.set(userId, userClients);
  }
  userClients.add(res);

  // Return cleanup function
  return () => {
    const set = clients.get(userId);
    if (set) {
      set.delete(res);
      if (set.size === 0) {
        clients.delete(userId);
      }
    }
  };
}

/**
 * Broadcast session revocation to force immediate real-time logout
 */
export function broadcastSessionRevoked(userId: string, organizationId?: string, message?: string): void {
  const userClients = clients.get(userId);
  if (!userClients || userClients.size === 0) return;

  const payload = JSON.stringify({
    type: 'SESSION_REVOKED',
    userId,
    organizationId,
    message: message || 'Your access has been revoked by the organization owner.',
    timestamp: new Date().toISOString(),
  });

  for (const res of userClients) {
    try {
      res.write(`event: session_revoked\ndata: ${payload}\n\n`);
    } catch {
      // Ignored if socket already closed
    }
  }
}
