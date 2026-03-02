import type { WebSocket } from 'ws';
import type { AgentStateManager } from '../state/agent-state-manager.js';
import type { ServerMessage, AgentEvent } from '@agentflow/shared';

export class Broadcaster {
  private clients = new Set<WebSocket>();

  constructor(private stateManager: AgentStateManager) {
    // Forward all agent events to connected clients
    for (const eventType of ['agent:spawn', 'agent:update', 'agent:idle', 'agent:shutdown'] as const) {
      stateManager.on(eventType, (event: AgentEvent) => {
        if (eventType === 'agent:shutdown') {
          this.broadcast({
            type: 'agent:shutdown',
            agentId: event.agent.id,
            timestamp: event.timestamp,
          });
        } else {
          this.broadcast({
            type: eventType,
            agent: event.agent,
            timestamp: event.timestamp,
          } as ServerMessage);
        }
      });
    }
  }

  addClient(ws: WebSocket) {
    this.clients.add(ws);

    // Send full state snapshot on connect
    const fullState: ServerMessage = {
      type: 'full_state',
      agents: this.stateManager.getAll(),
      timestamp: Date.now(),
    };
    ws.send(JSON.stringify(fullState));

    ws.on('close', () => {
      this.clients.delete(ws);
    });
  }

  private broadcast(message: ServerMessage) {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === 1) { // OPEN
        client.send(data);
      }
    }
  }
}
