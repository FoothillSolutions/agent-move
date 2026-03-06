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
import { HookEventManager } from './hooks/hook-event-manager.js';

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
  const hookManager = new HookEventManager(stateManager);
  const broadcaster = new Broadcaster(stateManager, hookManager);

  registerWsHandler(app, stateManager, broadcaster, hookManager);
  registerApiRoutes(app, stateManager);

  // Hook endpoint: receives Claude Code hook events via POST /hook
  app.post('/hook', {
    config: { rawBody: false },
  }, async (req, reply) => {
    const event = req.body as import('@agent-move/shared').HookEvent;
    if (!event?.hook_event_name || !event?.session_id) {
      console.warn('[hook] Received invalid hook payload:', JSON.stringify(req.body).slice(0, 200));
      return reply.status(400).send({ error: 'Invalid hook event' });
    }
    console.log(`[hook] ${event.hook_event_name} | session=${event.session_id.slice(0, 12)} | tool=${event.tool_name ?? '-'}`);
    // Broadcast to all WS clients that hooks are active
    broadcaster.broadcastHooksStatus();
    const result = await hookManager.handleEvent(event);
    if (result) {
      return reply.status(result.statusCode).send(result.body);
    }
    return reply.status(200).send({ ok: true });
  });

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
      await app.listen({ port: actualPort, host: '127.0.0.1' });
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

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down...');
    watcher.stop();
    hookManager.dispose();
    broadcaster.dispose();
    stateManager.dispose();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { port: actualPort };
}

// Auto-run when executed directly (not via CLI wrapper)
if (!process.env.__AGENT_MOVE_CLI) {
  main().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
