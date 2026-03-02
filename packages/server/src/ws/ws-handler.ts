import type { FastifyInstance } from 'fastify';
import type { AgentStateManager } from '../state/agent-state-manager.js';
import type { Broadcaster } from './broadcaster.js';

export function registerWsHandler(
  app: FastifyInstance,
  _stateManager: AgentStateManager,
  broadcaster: Broadcaster
) {
  app.get('/ws', { websocket: true }, (socket, _req) => {
    console.log('WebSocket client connected');
    broadcaster.addClient(socket);

    socket.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong' }));
        }
      } catch {
        // Ignore malformed messages
      }
    });

    socket.on('close', () => {
      console.log('WebSocket client disconnected');
    });
  });
}
