import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { realtimeChat } from './lib/ws.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`🚀 Cliently API server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
  console.log(`🩺 Health check available at http://localhost:${env.PORT}/health`);
  console.log(`📡 API v1 root available at http://localhost:${env.PORT}/api/v1`);
  console.log(`💬 WebSocket Chat available at ws://localhost:${env.PORT}/ws/chat`);
});

// Attach WebSocket Realtime Server
realtimeChat.init(server);

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  server.close(async () => {
    console.log('🔒 Closed HTTP server.');
    try {
      await prisma.$disconnect();
      console.log('🗄️ Disconnected from database.');
      process.exit(0);
    } catch (err) {
      console.error('❌ Error during database disconnect:', err);
      process.exit(1);
    }
  });

  // Force close after 10s if graceful shutdown hangs
  setTimeout(() => {
    console.error('⚠️ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
