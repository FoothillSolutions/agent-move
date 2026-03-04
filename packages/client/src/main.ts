import { createApp } from './app.js';
import { WsClient } from './connection/ws-client.js';
import { StateStore } from './connection/state-store.js';
import { WorldManager } from './world/world-manager.js';
import { AgentManager } from './agents/agent-manager.js';
import { Overlay } from './ui/overlay.js';
import { AgentDetailPanel } from './ui/agent-detail-panel.js';
import { Timeline } from './ui/timeline.js';
import { SoundManager } from './audio/sound-manager.js';
import { NotificationManager } from './audio/notification-manager.js';
import { ZoneHeatmap } from './ui/zone-heatmap.js';
import { CommandPalette } from './ui/command-palette.js';
import { AnalyticsPanel } from './ui/analytics-panel.js';
import { LayoutEditor, applySavedLayout } from './ui/layout-editor.js';
import { StatsHud } from './ui/stats-hud.js';
import { ToastManager } from './ui/toast-manager.js';
import { ShortcutsHelp } from './ui/shortcuts-help.js';
import { SessionExport } from './ui/session-export.js';
import { Onboarding } from './ui/onboarding.js';
import { ZONE_MAP, AGENT_PALETTES } from '@agent-move/shared';

// New feature imports
import { AgentTrails } from './effects/agent-trails.js';
import { Minimap } from './ui/minimap.js';
import { LeaderboardPanel } from './ui/leaderboard-panel.js';
import { AgentCustomizer } from './ui/agent-customizer.js';

import { ThemeManager } from './world/themes/theme-manager.js';

async function main() {
  const appEl = document.getElementById('app')!;

  // Init Pixi application
  const pixiApp = await createApp(appEl);

  // Init state store
  const store = new StateStore();

  // ── Feature 5: Layout Editor ──
  // Apply saved layout BEFORE WorldManager so ZoneRenderer picks up persisted positions
  applySavedLayout();

  // Init world (zones, grid, camera)
  const world = new WorldManager(pixiApp);

  // Init layout editor (after WorldManager so it can trigger redraws)
  const layoutEditor = new LayoutEditor(world);

  // Init agent manager (bridges state -> rendering)
  const agentManager = new AgentManager(pixiApp, world, store);

  // Init audio
  const sound = new SoundManager();
  const notifications = new NotificationManager();
  agentManager.setSoundManager(sound);
  agentManager.setNotificationManager(notifications);

  // Init overlay (HTML sidebar)
  const overlay = new Overlay(store);

  // Init detail panel
  const detailPanel = new AgentDetailPanel(store);
  overlay.setAgentClickHandler((agentId) => {
    detailPanel.open(agentId);
    agentManager.setFocusAgent(agentId);
    focusModeActive = true;
    updateFocusIndicator();
  });

  // ── Feature 1: Agent Click-to-Inspect ──
  agentManager.setClickHandler((agentId) => {
    detailPanel.open(agentId);
    agentManager.setFocusAgent(agentId);
    focusModeActive = true;
    updateFocusIndicator();
  });

  // Init timeline
  const timeline = new Timeline(store);
  timeline.setReplayCallback((agents) => {
    agentManager.rebuildFromState(agents);
  });

  // ── Feature 1: Zone Activity Heatmap ──
  const heatmap = new ZoneHeatmap(store);
  let heatmapVisible = true;

  // ── Feature 3: Analytics Panel ──
  const analytics = new AnalyticsPanel(store);

  // ── Stats HUD ──
  const statsHud = new StatsHud(store);

  // ── Toast Notifications ──
  const toasts = new ToastManager(store);

  // ── Keyboard Shortcuts Help ──
  const shortcutsHelp = new ShortcutsHelp();

  // ── Session Export ──
  const sessionExport = new SessionExport(store);

  // ── Onboarding (first-time users) ──
  const onboarding = new Onboarding();

  // ── Feature 2: Agent Trails ──
  const trails = new AgentTrails();
  world.addEffect(trails.container);

  // ── Feature 4: Mini-map ──
  const minimap = new Minimap(world.camera, (wx, wy) => {
    world.camera.panTo(wx, wy);
  });

  // ── Feature 5: Agent Performance Leaderboard ──
  const leaderboard = new LeaderboardPanel(store);

  // ── Feature 6: Agent Customization ──
  const customizer = new AgentCustomizer();
  const custLookup = (agent: import('@agent-move/shared').AgentState) => customizer.getCustomDisplay(agent);
  agentManager.setCustomizationLookup(custLookup);
  detailPanel.setCustomizationLookup(custLookup);
  overlay.setCustomizationLookup(custLookup);
  leaderboard.setCustomizationLookup(custLookup);
  analytics.setCustomizationLookup(custLookup);
  customizer.setChangeHandler((agentId, data) => {
    agentManager.applyCustomization(agentId, data.displayName, data.colorIndex);
    if (detailPanel.currentAgentId === agentId) {
      detailPanel.refreshHeader(data.displayName);
    }
    // Re-render overlay to reflect name/color change
    overlay.scheduleRender();
  });
  // Wire detail panel "Customize" button to open customizer
  detailPanel.setCustomizeHandler((agent) => {
    customizer.open(agent);
  });
  // Wire right-click on agent sprites to open customizer
  pixiApp.canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault(); // prevent browser context menu on canvas
  });

  // ── Feature 9: Custom Themes ──
  const themeManager = new ThemeManager();
  // Apply initial theme
  world.applyTheme(themeManager.current);

  // Theme cycle button in zoom controls row
  const themeBtn = document.createElement('button');
  themeBtn.id = 'theme-cycle-btn';
  themeBtn.title = `Theme: ${themeManager.current.name} (P)`;
  themeBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-1 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`;
  document.getElementById('zoom-controls')!.appendChild(themeBtn);
  themeBtn.addEventListener('click', () => themeManager.cycleNext());

  themeManager.onChange((theme) => {
    world.applyTheme(theme);
    themeBtn.title = `Theme: ${theme.name} (P)`;
  });

  // ── Focus Mode ──
  let focusModeActive = false;

  // Focus indicator badge
  const focusIndicator = document.createElement('div');
  focusIndicator.id = 'focus-indicator';
  focusIndicator.innerHTML = `<span class="fi-icon">&#127919;</span> Following: <span class="fi-name"></span><span class="fi-hint">F to cycle &middot; Esc to exit</span>`;
  document.getElementById('app')!.appendChild(focusIndicator);

  function updateFocusIndicator(): void {
    if (focusModeActive && agentManager.focusedAgentId) {
      const name = agentManager.getFocusedAgentName() || 'Agent';
      focusIndicator.querySelector('.fi-name')!.textContent = name;
      focusIndicator.classList.add('visible');
    } else {
      focusIndicator.classList.remove('visible');
    }
  }

  // ── Feature 2: Command Palette ──
  const commandPalette = new CommandPalette(store, (action, payload) => {
    switch (action) {
      case 'focus-zone': {
        const zone = ZONE_MAP.get(payload);
        if (zone) {
          world.camera.panTo(
            zone.x + zone.width / 2,
            zone.y + zone.height / 2
          );
        }
        break;
      }
      case 'focus-agent': {
        detailPanel.open(payload);
        agentManager.setFocusAgent(payload);
        focusModeActive = true;
        updateFocusIndicator();
        break;
      }
      case 'reset-camera':
        world.resetCamera();
        break;
      case 'zoom-in':
        world.camera.zoomIn();
        break;
      case 'zoom-out':
        world.camera.zoomOut();
        break;
      case 'toggle-mute':
        sound.init();
        sound.muted = !sound.muted;
        muteBtn.textContent = sound.muted ? '\u{1F507}' : '\u{1F508}';
        muteBtn.classList.toggle('muted', sound.muted);
        break;
      case 'toggle-heatmap':
        heatmapVisible = !heatmapVisible;
        const heatmapEl = document.getElementById('zone-heatmap');
        if (heatmapEl) heatmapEl.style.display = heatmapVisible ? 'block' : 'none';
        break;
      case 'toggle-analytics':
        analytics.toggle();
        break;
      case 'timeline-live':
        // Timeline handles its own live mode
        break;
      case 'toggle-shortcuts':
        shortcutsHelp.toggle();
        break;
      case 'toggle-focus':
        if (focusModeActive) {
          focusModeActive = false;
          agentManager.setFocusAgent(null);
        } else {
          agentManager.cycleNextAgent();
          focusModeActive = !!agentManager.focusedAgentId;
        }
        updateFocusIndicator();
        break;
      case 'session-export':
        sessionExport.toggle();
        break;
      case 'toggle-trails':
        trails.toggle();
        break;
      case 'toggle-daynight':
        world.dayNight.toggle();
        break;
      case 'toggle-minimap':
        minimap.toggle();
        break;
      case 'toggle-leaderboard':
        leaderboard.toggle();
        break;
      case 'toggle-isometric':
        world.toggleIsometric();
        break;
      case 'cycle-theme':
        themeManager.cycleNext();
        break;
    }
  });

  // Wire command palette customization lookup (after commandPalette is created)
  commandPalette.setCustomizationLookup(custLookup);

  // Clean up trails when agents shut down
  store.on('agent:shutdown', (agentId: string) => {
    trails.removeAgent(agentId);
  });

  // Connect WebSocket
  const ws = new WsClient(store);
  ws.connect();

  // Zoom controls
  document.getElementById('zoom-in')!.addEventListener('click', () => world.camera.zoomIn());
  document.getElementById('zoom-out')!.addEventListener('click', () => world.camera.zoomOut());
  document.getElementById('zoom-reset')!.addEventListener('click', () => world.resetCamera());

  // Audio controls
  const muteBtn = document.getElementById('mute-btn')!;
  const volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;
  const volumeLabel = document.getElementById('volume-label')!;

  muteBtn.addEventListener('click', () => {
    sound.init(); // Unlock AudioContext on first user gesture
    sound.muted = !sound.muted;
    muteBtn.textContent = sound.muted ? '\u{1F507}' : '\u{1F508}';
    muteBtn.classList.toggle('muted', sound.muted);
  });

  volumeSlider.addEventListener('input', () => {
    sound.init(); // Unlock AudioContext on first user gesture
    const val = parseInt(volumeSlider.value, 10);
    sound.volume = val / 100;
    volumeLabel.textContent = `${val}%`;
  });

  // Analytics button in sidebar
  const analyticsBtn = document.getElementById('analytics-btn');
  analyticsBtn?.addEventListener('click', () => {
    analytics.toggle();
    analyticsBtn.classList.toggle('active', !analyticsBtn.classList.contains('active'));
  });

  // Leaderboard button in sidebar
  const leaderboardBtn = document.getElementById('leaderboard-btn');
  leaderboardBtn?.addEventListener('click', () => {
    leaderboard.toggle();
    leaderboardBtn.classList.toggle('active', !leaderboardBtn.classList.contains('active'));
  });

  // Command palette hint button
  const cmdHintBtn = document.getElementById('cmd-hint');
  cmdHintBtn?.addEventListener('click', () => {
    commandPalette.toggle();
  });

  // Request notification permission on first interaction
  document.addEventListener('click', () => {
    sound.init();
    notifications.requestPermission();
  }, { once: true });

  // ── Global keyboard shortcuts ──
  document.addEventListener('keydown', (e) => {
    // Skip if typing in an input
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    // Skip if modifier keys (Ctrl+K handled by command palette)
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    switch (e.key) {
      case 'a':
        analytics.toggle();
        analyticsBtn?.classList.toggle('active');
        break;
      case 'h':
        heatmapVisible = !heatmapVisible;
        const heatmapEl = document.getElementById('zone-heatmap');
        if (heatmapEl) heatmapEl.style.display = heatmapVisible ? 'block' : 'none';
        break;
      case 'm':
        sound.init();
        sound.muted = !sound.muted;
        muteBtn.textContent = sound.muted ? '\u{1F507}' : '\u{1F508}';
        muteBtn.classList.toggle('muted', sound.muted);
        break;
      case 'f':
        if (!focusModeActive) {
          agentManager.cycleNextAgent();
          focusModeActive = !!agentManager.focusedAgentId;
        } else {
          const next = agentManager.cycleNextAgent();
          if (!next) {
            focusModeActive = false;
            agentManager.setFocusAgent(null);
          }
        }
        updateFocusIndicator();
        break;
      case 'e':
        sessionExport.toggle();
        break;
      case 'Escape':
        if (focusModeActive) {
          focusModeActive = false;
          agentManager.setFocusAgent(null);
          updateFocusIndicator();
        }
        break;
      // New feature shortcuts
      case 't':
        trails.toggle();
        break;
      case 'n':
        world.dayNight.toggle();
        break;
      case 'Tab':
        e.preventDefault();
        minimap.toggle();
        break;
      case 'l':
        leaderboard.toggle();
        leaderboardBtn?.classList.toggle('active');
        break;
      case 'i':
        world.toggleIsometric();
        break;
      case 'p':
        themeManager.cycleNext();
        break;
    }
  });

  // Game loop
  pixiApp.ticker.add(() => {
    const dt = pixiApp.ticker.deltaMS;
    agentManager.update(dt);
    world.update(dt);

    // Update heatmap overlay position to match camera
    const root = world.root;
    if (heatmapVisible) {
      heatmap.updateTransform(root.x, root.y, root.scale.x);
    }

    // Update layout editor overlay position to match camera
    layoutEditor.updateTransform(root.x, root.y, root.scale.x);

    // Focus mode: smoothly follow agent
    if (focusModeActive) {
      const pos = agentManager.getFocusedAgentPosition();
      if (pos) {
        world.camera.smoothFollow(pos.x, pos.y);
      }
    }

    // Update agent trails
    if (trails.enabled) {
      const colorMap = new Map<string, number>();
      for (const p of agentManager.getAgentPositions()) {
        const palette = AGENT_PALETTES[p.colorIndex % AGENT_PALETTES.length];
        colorMap.set(p.id, palette.body);
        trails.recordPosition(p.id, p.x, p.y, dt, palette.body);
      }
      trails.update(dt, colorMap);
    }

    // Update minimap
    if (minimap.visible) {
      const viewport = world.camera.getViewport();
      const agents = agentManager.getAgentPositions();
      minimap.render(agents, viewport);
    }
  });

  console.log('Claude Code Visualizer started');
}

main().catch(console.error);
