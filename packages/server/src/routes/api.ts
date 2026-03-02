import type { FastifyInstance } from 'fastify';
import type { AgentStateManager } from '../state/agent-state-manager.js';

export function registerApiRoutes(app: FastifyInstance, stateManager: AgentStateManager) {
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: Date.now() };
  });

  app.get('/api/state', async () => {
    return {
      agents: stateManager.getAll(),
      timestamp: Date.now(),
    };
  });
}
