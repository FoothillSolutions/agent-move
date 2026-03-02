import type { ServerMessage } from '@agentflow/shared';
import type { StateStore } from './state-store.js';

const MIN_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 10000;

export class WsClient {
  private ws: WebSocket | null = null;
  private store: StateStore;
  private reconnectMs = MIN_RECONNECT_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(store: StateStore) {
    this.store = store;
  }

  connect(): void {
    if (this.disposed) return;

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/ws`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectMs = MIN_RECONNECT_MS;
      this.store.setConnectionStatus('connected');
    };

    this.ws.onmessage = (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return; // Ignore non-JSON messages (e.g. pong)
      }
      this.store.handleMessage(msg);
    };

    this.ws.onclose = () => {
      this.store.setConnectionStatus('disconnected');
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror, so reconnect is handled there
    };
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectMs);

    // Exponential backoff capped at MAX
    this.reconnectMs = Math.min(this.reconnectMs * 2, MAX_RECONNECT_MS);
  }

  disconnect(): void {
    this.disposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
