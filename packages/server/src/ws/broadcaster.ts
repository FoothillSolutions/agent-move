import type { WebSocket } from 'ws';
import type { AgentStateManager } from '../state/agent-state-manager.js';
import type { HookEventManager } from '../hooks/hook-event-manager.js';
import type { ServerMessage, AgentEvent, AnomalyEvent, TaskGraphData, ToolChainData, PendingPermission } from '@agent-move/shared';

export class Broadcaster {
  private clients = new Set<WebSocket>();
  private boundListeners: Array<{ emitter: { removeListener(e: string, fn: (...args: any[]) => void): void }; event: string; fn: (...args: any[]) => void }> = [];

  constructor(private stateManager: AgentStateManager, hookManager?: HookEventManager) {
    const track = (emitter: any, event: string, fn: (...args: any[]) => void) => {
      emitter.on(event, fn);
      this.boundListeners.push({ emitter, event, fn });
    };

    if (hookManager) {
      track(hookManager, 'permission:request', (permission: PendingPermission) => {
        this.broadcast({
          type: 'permission:request',
          permission,
          timestamp: Date.now(),
        });
      });
      track(hookManager, 'permission:resolved', (payload: { permissionId: string; decision: 'allow' | 'deny' }) => {
        this.broadcast({
          type: 'permission:resolved',
          permissionId: payload.permissionId,
          decision: payload.decision,
          timestamp: Date.now(),
        });
      });
    }
    // Forward all agent events to connected clients
    for (const eventType of ['agent:spawn', 'agent:update', 'agent:idle', 'agent:shutdown'] as const) {
      track(stateManager, eventType, (event: AgentEvent) => {
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

    // Forward anomaly events
    track(stateManager.anomalyDetector, 'anomaly', (anomaly: AnomalyEvent) => {
      this.broadcast({
        type: 'anomaly:alert',
        anomaly,
        timestamp: Date.now(),
      });
    });

    // Forward tool chain changes
    track(stateManager, 'toolchain:changed', (payload: { data: ToolChainData; timestamp: number }) => {
      this.broadcast({
        type: 'toolchain:snapshot',
        data: payload.data,
        timestamp: payload.timestamp,
      });
    });

    // Forward task graph changes
    track(stateManager, 'taskgraph:changed', (payload: { data: TaskGraphData; timestamp: number }) => {
      this.broadcast({
        type: 'taskgraph:snapshot',
        data: payload.data,
        timestamp: payload.timestamp,
      });
    });

    // Forward task completion notifications (hook-sourced)
    track(stateManager, 'task:completed', (payload: { taskId: string; taskSubject: string; agentId: string }) => {
      this.broadcast({
        type: 'task:completed',
        taskId: payload.taskId,
        taskSubject: payload.taskSubject,
        agentId: payload.agentId,
        timestamp: Date.now(),
      });
    });
  }

  addClient(ws: WebSocket) {
    this.clients.add(ws);

    ws.on('close', () => {
      this.clients.delete(ws);
    });
    ws.on('error', () => {
      this.clients.delete(ws);
    });

    // Send full state snapshot on connect
    if (ws.readyState === 1) {
      try {
        const fullState: ServerMessage = {
          type: 'full_state',
          agents: this.stateManager.getAll(),
          timestamp: Date.now(),
        };
        ws.send(JSON.stringify(fullState));

        // Send timeline snapshot for replay
        const timeline: ServerMessage = {
          type: 'timeline:snapshot',
          events: this.stateManager.getTimeline(),
          timestamp: Date.now(),
        };
        ws.send(JSON.stringify(timeline));

        // Send tool chain snapshot
        const toolchain: ServerMessage = {
          type: 'toolchain:snapshot',
          data: this.stateManager.getToolChainSnapshot(),
          timestamp: Date.now(),
        };
        ws.send(JSON.stringify(toolchain));

        // Send task graph snapshot
        const taskgraph: ServerMessage = {
          type: 'taskgraph:snapshot',
          data: this.stateManager.getTaskGraphSnapshot(),
          timestamp: Date.now(),
        };
        ws.send(JSON.stringify(taskgraph));
      } catch {
        this.clients.delete(ws);
      }
    }
  }

  /** Broadcast that hook events are being received */
  broadcastHooksStatus(): void {
    this.broadcast({ type: 'hooks:status', timestamp: Date.now() });
  }

  /** Send a message to a specific client */
  sendToClient(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === 1) {
      try { ws.send(JSON.stringify(message)); } catch { this.clients.delete(ws); }
    }
  }

  dispose(): void {
    for (const { emitter, event, fn } of this.boundListeners) {
      emitter.removeListener(event, fn);
    }
    this.boundListeners = [];
    this.clients.clear();
  }

  private broadcast(message: ServerMessage) {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === 1) { // OPEN
        try {
          client.send(data);
        } catch {
          this.clients.delete(client);
        }
      }
    }
  }
}
