import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { FileWatcher } from './watcher/file-watcher.js';
import { SessionScanner } from './watcher/session-scanner.js';
import { AgentStateManager } from './state/agent-state-manager.js';
import { Broadcaster } from './ws/broadcaster.js';
import { registerWsHandler } from './ws/ws-handler.js';
import { registerApiRoutes } from './routes/api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function main() {
  const app = Fastify({ logger: { level: 'info' } });

  await app.register(cors, { origin: true });
  await app.register(websocket);

  // Serve built client as static files
  const clientDist = join(__dirname, '..', '..', 'client', 'dist');
  await app.register(fastifyStatic, {
    root: clientDist,
    prefix: '/',
    wildcard: false,
  });

  const stateManager = new AgentStateManager();
  const broadcaster = new Broadcaster(stateManager);

  registerWsHandler(app, stateManager, broadcaster);
  registerApiRoutes(app, stateManager);

  // SPA fallback: serve index.html for non-API, non-WS routes
  app.setNotFoundHandler((_req, reply) => {
    reply.sendFile('index.html');
  });

  // Scan for existing active sessions on startup
  const scanner = new SessionScanner(config.claudeHome);
  const existingSessions = await scanner.scan();
  console.log(`Found ${existingSessions.length} existing session files`);

  // Start file watcher
  const watcher = new FileWatcher(config.claudeHome, stateManager);
  await watcher.start(existingSessions);

  // Flush stale pending queues from replay — only real-time Agent tool calls should name subagents
  stateManager.flushPendingQueues();

  // Try preferred port, then increment up to 10 times on conflict
  let actualPort = config.port;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await app.listen({ port: actualPort, host: '0.0.0.0' });
      break;
    } catch (err: any) {
      if (err.code === 'EADDRINUSE' && attempt < 9) {
        actualPort++;
        continue;
      }
      throw err;
    }
  }
  console.log(`Server listening on http://localhost:${actualPort}`);

  return { port: actualPort };

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

// Auto-run when executed directly (not via CLI wrapper)
if (!process.env.__AGENT_MOVE_CLI) {
  main().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
