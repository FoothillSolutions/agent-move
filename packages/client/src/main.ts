import { createApp } from './app.js';
import { WsClient } from './connection/ws-client.js';
import { StateStore } from './connection/state-store.js';
import { WorldManager } from './world/world-manager.js';
import { AgentManager } from './agents/agent-manager.js';
import { Overlay } from './ui/overlay.js';

async function main() {
  const appEl = document.getElementById('app')!;

  // Init Pixi application
  const pixiApp = await createApp(appEl);

  // Init state store
  const store = new StateStore();

  // Init world (zones, grid, camera)
  const world = new WorldManager(pixiApp);

  // Init agent manager (bridges state -> rendering)
  const agentManager = new AgentManager(pixiApp, world, store);

  // Init overlay (HTML sidebar)
  const overlay = new Overlay(store);

  // Connect WebSocket
  const ws = new WsClient(store);
  ws.connect();

  // Game loop
  pixiApp.ticker.add(() => {
    agentManager.update(pixiApp.ticker.deltaMS);
  });

  console.log('Claude Code Visualizer started');
}

main().catch(console.error);
