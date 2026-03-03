import type { AgentState, ServerMessage, ActivityEntry, TimelineEvent } from '@agent-move/shared';
import type { WsClient } from './ws-client.js';

export type ConnectionStatus = 'connected' | 'disconnected';

export type StoreEventType =
  | 'agent:spawn'
  | 'agent:update'
  | 'agent:idle'
  | 'agent:shutdown'
  | 'agent:history'
  | 'state:reset'
  | 'connection:status'
  | 'timeline:snapshot';

type StoreEventData = {
  'agent:spawn': AgentState;
  'agent:update': AgentState;
  'agent:idle': AgentState;
  'agent:shutdown': string; // agentId
  'agent:history': { agentId: string; entries: ActivityEntry[] };
  'state:reset': Map<string, AgentState>;
  'connection:status': ConnectionStatus;
  'timeline:snapshot': TimelineEvent[];
};

type Listener<T extends StoreEventType> = (data: StoreEventData[T]) => void;

export class StateStore {
  private agents = new Map<string, AgentState>();
  private listeners = new Map<StoreEventType, Set<Listener<any>>>();
  private _connectionStatus: ConnectionStatus = 'disconnected';
  private wsClient: WsClient | null = null;
  private _timeline: TimelineEvent[] = [];

  get connectionStatus(): ConnectionStatus {
    return this._connectionStatus;
  }

  setWsClient(client: WsClient): void {
    this.wsClient = client;
  }

  getAgents(): Map<string, AgentState> {
    return this.agents;
  }

  getAgent(id: string): AgentState | undefined {
    return this.agents.get(id);
  }

  requestHistory(agentId: string): void {
    this.wsClient?.send({ type: 'request:history', agentId });
  }

  getTimeline(): TimelineEvent[] {
    return this._timeline;
  }

  private pushTimelineEvent(type: TimelineEvent['type'], agent: AgentState, timestamp: number): void {
    this._timeline.push({ type, agent: { ...agent }, timestamp });
    // Trim to 30 min
    const cutoff = Date.now() - 30 * 60 * 1000;
    while (this._timeline.length > 0 && this._timeline[0].timestamp < cutoff) {
      this._timeline.shift();
    }
  }

  on<T extends StoreEventType>(event: T, listener: Listener<T>): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
  }

  off<T extends StoreEventType>(event: T, listener: Listener<T>): void {
    const set = this.listeners.get(event);
    if (set) set.delete(listener);
  }

  private emit<T extends StoreEventType>(event: T, data: StoreEventData[T]): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const fn of set) fn(data);
    }
  }

  setConnectionStatus(status: ConnectionStatus): void {
    this._connectionStatus = status;
    this.emit('connection:status', status);
  }

  handleMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'full_state': {
        this.agents.clear();
        for (const agent of msg.agents) {
          this.agents.set(agent.id, agent);
        }
        this.emit('state:reset', this.agents);
        break;
      }

      case 'agent:spawn': {
        this.agents.set(msg.agent.id, msg.agent);
        this.pushTimelineEvent('agent:spawn', msg.agent, msg.timestamp);
        this.emit('agent:spawn', msg.agent);
        break;
      }

      case 'agent:update': {
        this.agents.set(msg.agent.id, msg.agent);
        this.pushTimelineEvent('agent:update', msg.agent, msg.timestamp);
        this.emit('agent:update', msg.agent);
        break;
      }

      case 'agent:idle': {
        this.agents.set(msg.agent.id, msg.agent);
        this.pushTimelineEvent('agent:idle', msg.agent, msg.timestamp);
        this.emit('agent:idle', msg.agent);
        break;
      }

      case 'agent:shutdown': {
        const agent = this.agents.get(msg.agentId);
        if (agent) {
          this.pushTimelineEvent('agent:shutdown', agent, msg.timestamp);
        }
        this.agents.delete(msg.agentId);
        this.emit('agent:shutdown', msg.agentId);
        break;
      }

      case 'agent:history': {
        this.emit('agent:history', { agentId: msg.agentId, entries: msg.entries });
        break;
      }

      case 'timeline:snapshot': {
        this._timeline = msg.events;
        this.emit('timeline:snapshot', msg.events);
        break;
      }
    }
  }
}
