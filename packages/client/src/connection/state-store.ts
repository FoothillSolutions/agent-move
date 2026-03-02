import type { AgentState, ServerMessage } from '@agentflow/shared';

export type ConnectionStatus = 'connected' | 'disconnected';

export type StoreEventType =
  | 'agent:spawn'
  | 'agent:update'
  | 'agent:idle'
  | 'agent:shutdown'
  | 'state:reset'
  | 'connection:status';

type StoreEventData = {
  'agent:spawn': AgentState;
  'agent:update': AgentState;
  'agent:idle': AgentState;
  'agent:shutdown': string; // agentId
  'state:reset': Map<string, AgentState>;
  'connection:status': ConnectionStatus;
};

type Listener<T extends StoreEventType> = (data: StoreEventData[T]) => void;

export class StateStore {
  private agents = new Map<string, AgentState>();
  private listeners = new Map<StoreEventType, Set<Listener<any>>>();
  private _connectionStatus: ConnectionStatus = 'disconnected';

  get connectionStatus(): ConnectionStatus {
    return this._connectionStatus;
  }

  getAgents(): Map<string, AgentState> {
    return this.agents;
  }

  getAgent(id: string): AgentState | undefined {
    return this.agents.get(id);
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
        this.emit('agent:spawn', msg.agent);
        break;
      }

      case 'agent:update': {
        this.agents.set(msg.agent.id, msg.agent);
        this.emit('agent:update', msg.agent);
        break;
      }

      case 'agent:idle': {
        this.agents.set(msg.agent.id, msg.agent);
        this.emit('agent:idle', msg.agent);
        break;
      }

      case 'agent:shutdown': {
        this.agents.delete(msg.agentId);
        this.emit('agent:shutdown', msg.agentId);
        break;
      }
    }
  }
}
