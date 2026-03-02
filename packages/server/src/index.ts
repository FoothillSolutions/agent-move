import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { config } from './config.js';
import { FileWatcher } from './watcher/file-watcher.js';
import { SessionScanner } from './watcher/session-scanner.js';
import { AgentStateManager } from './state/agent-state-manager.js';
import { Broadcaster } from './ws/broadcaster.js';
import { registerWsHandler } from './ws/ws-handler.js';
import { registerApiRoutes } from './routes/api.js';

async function main() {
  const app = Fastify({ logger: { level: 'info' } });

  await app.register(cors, { origin: true });
  await app.register(websocket);

  const stateManager = new AgentStateManager();
  const broadcaster = new Broadcaster(stateManager);

  registerWsHandler(app, stateManager, broadcaster);
  registerApiRoutes(app, stateManager);

  // Scan for existing active sessions on startup
  const scanner = new SessionScanner(config.claudeHome);
  const existingSessions = await scanner.scan();
  console.log(`Found ${existingSessions.length} existing session files`);

  // Start file watcher
  const watcher = new FileWatcher(config.claudeHome, stateManager);
  watcher.start(existingSessions);

  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`Server listening on http://localhost:${config.port}`);

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down...');
    watcher.stop();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
