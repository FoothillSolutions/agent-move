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
import { TopBar } from './ui/top-bar.js';
import type { NavTab } from './ui/top-bar.js';
import { Sidebar } from './ui/sidebar.js';
import { ToastManager } from './ui/toast-manager.js';
import { ShortcutsHelp } from './ui/shortcuts-help.js';
import { SessionExport } from './ui/session-export.js';
import { Onboarding } from './ui/onboarding.js';
import { ZONE_MAP, AGENT_PALETTES } from '@agent-move/shared';

import { AgentTrails } from './effects/agent-trails.js';
import { Minimap } from './ui/minimap.js';
import { LeaderboardPanel } from './ui/leaderboard-panel.js';
import { AgentCustomizer } from './ui/agent-customizer.js';

import { ThemeManager } from './world/themes/theme-manager.js';
import { ZoneAnnotations } from './ui/zone-annotations.js';
import { ToolChainPanel } from './ui/tool-chain-panel.js';
import { TaskGraphPanel } from './ui/task-graph-panel.js';
import { PermissionPanel } from './ui/permission-panel.js';
import { NotificationPanel } from './ui/notification-panel.js';
import { ActivityFeed } from './ui/activity-feed.js';
import { WaterfallPanel } from './ui/waterfall-panel.js';
import { RelationshipGraph } from './ui/relationship-graph.js';
import { AgentHoverBar } from './ui/agent-hover-bar.js';

async function main() {
  const appEl = document.getElementById('app')!;

  // Init Pixi application
  const pixiApp = await createApp(appEl);

  // Init state store
  const store = new StateStore();

  // Apply saved layout BEFORE WorldManager
  applySavedLayout();

  // Init world (zones, grid, camera)
  const world = new WorldManager(pixiApp);

  // Init layout editor
  const layoutEditor = new LayoutEditor(world);

  // Init agent manager
  const agentManager = new AgentManager(pixiApp, world, store);

  // Init audio
  const sound = new SoundManager();
  const notifications = new NotificationManager();
  agentManager.setSoundManager(sound);
  agentManager.setNotificationManager(notifications);

  // ── Top Bar ──
  const topBar = new TopBar(store);

  // ── Sidebar Navigation ──
  const sidebar = new Sidebar();

  // ── Right Panel: Overlay (agent list) ──
  const overlay = new Overlay(store);

  // ── Detail Panel (renders inside right panel) ──
  const detailPanel = new AgentDetailPanel(store);

  // Wire agent click from overlay -> detail panel
  overlay.setAgentClickHandler((agentId) => {
    detailPanel.open(agentId);
    agentManager.setFocusAgent(agentId);
    focusModeActive = true;
    updateFocusIndicator();
  });

  // Wire agent click from canvas -> detail panel
  agentManager.setClickHandler((agentId) => {
    detailPanel.open(agentId);
    agentManager.setFocusAgent(agentId);
    focusModeActive = true;
    updateFocusIndicator();
  });

  // ── Agent Hover Bar (quick actions on sprite hover) ──
  const hoverBar = new AgentHoverBar(store);
  hoverBar.setFocusHandler((agentId) => {
    agentManager.setFocusAgent(agentId);
    focusModeActive = true;
    updateFocusIndicator();
  });
  hoverBar.setDetailHandler((agentId) => {
    detailPanel.open(agentId);
    agentManager.setFocusAgent(agentId);
    focusModeActive = true;
    updateFocusIndicator();
  });
  agentManager.setHoverHandler((agentId, x, y) => {
    if (agentId) {
      // Convert world coords to screen coords
      const root = world.root;
      const screenX = x * root.scale.x + root.x;
      const screenY = y * root.scale.y + root.y;
      hoverBar.show(agentId, screenX, screenY);
    } else {
      hoverBar.hide();
    }
  });

  // Init timeline
  const timeline = new Timeline(store);
  timeline.setReplayCallback((agents) => {
    agentManager.rebuildFromState(agents);
  });

  // Zone heatmap
  const heatmap = new ZoneHeatmap(store);
  let heatmapVisible = true;

  // ── Right Panel: Analytics & Leaderboard (swap with agent list) ──
  const rightPanelContent = document.getElementById('right-panel-content')!;
  const overlayEl = document.getElementById('overlay')!;
  const rightPanelTitle = document.getElementById('right-panel-title')!;

  const analytics = new AnalyticsPanel(store, rightPanelContent);
  const leaderboard = new LeaderboardPanel(store, rightPanelContent);
  const toolChainPanel = new ToolChainPanel(store, rightPanelContent);
  const taskGraphPanel = new TaskGraphPanel(store, rightPanelContent);

  // ── Zone Annotations ──
  const zoneAnnotations = new ZoneAnnotations();

  // ── Activity Feed (in right panel) ──
  const activityFeed = new ActivityFeed(store, rightPanelContent);

  // ── Waterfall Trace View (in right panel) ──
  const waterfallPanel = new WaterfallPanel(store, rightPanelContent);

  // ── Agent Relationship Graph (in right panel) ──
  const relationshipGraph = new RelationshipGraph(store, rightPanelContent);

  // ── Permission Panel (floating) ──
  const permissionPanel = new PermissionPanel(store);

  // ── Notification Panel ──
  const notificationPanel = new NotificationPanel(store);

  // ── Toast Notifications ──
  const toasts = new ToastManager(store);

  // ── Keyboard Shortcuts Help ──
  const shortcutsHelp = new ShortcutsHelp();

  // ── Session Export ──
  const sessionExport = new SessionExport(store);

  // ── Onboarding ──
  const onboarding = new Onboarding();

  // ── Agent Trails ──
  const trails = new AgentTrails();
  world.addEffect(trails.container);

  // ── Mini-map ──
  const minimap = new Minimap(world.camera, (wx, wy) => {
    world.camera.panTo(wx, wy);
  });

  // ── Agent Customization ──
  const customizer = new AgentCustomizer();
  const custLookup = (agent: import('@agent-move/shared').AgentState) => customizer.getCustomDisplay(agent);
  agentManager.setCustomizationLookup(custLookup);
  detailPanel.setCustomizationLookup(custLookup);
  overlay.setCustomizationLookup(custLookup);
  leaderboard.setCustomizationLookup(custLookup);
  analytics.setCustomizationLookup(custLookup);
  waterfallPanel.setCustomizationLookup(custLookup);
  relationshipGraph.setCustomizationLookup(custLookup);
  activityFeed.setCustomizationLookup(custLookup);
  customizer.setChangeHandler((agentId, data) => {
    agentManager.applyCustomization(agentId, data.displayName, data.colorIndex);
    if (detailPanel.currentAgentId === agentId) {
      detailPanel.refreshHeader(data.displayName);
    }
    overlay.scheduleRender();
  });
  detailPanel.setCustomizeHandler((agent) => {
    customizer.open(agent);
  });
  pixiApp.canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  // Double-click on canvas to add zone annotation
  pixiApp.canvas.addEventListener('dblclick', (e) => {
    const rect = pixiApp.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    zoneAnnotations.addAnnotationFromScreen(screenX, screenY);
  });

  // ── Theme Manager ──
  const themeManager = new ThemeManager();
  world.applyTheme(themeManager.current);

  const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
  themeSelect.value = themeManager.current.id;
  themeSelect.addEventListener('change', () => themeManager.setTheme(themeSelect.value));
  themeManager.onChange((theme) => {
    world.applyTheme(theme);
    themeSelect.value = theme.id;
  });

  // ── Focus Mode ──
  let focusModeActive = false;

  function updateFocusIndicator(): void {
    if (focusModeActive && agentManager.focusedAgentId) {
      const name = agentManager.getFocusedAgentName() || 'Agent';
      topBar.showFocus(name);
    } else {
      topBar.hideFocus();
    }
  }

  // Stop following button
  document.getElementById('focus-stop')!.addEventListener('click', () => {
    focusModeActive = false;
    agentManager.setFocusAgent(null);
    updateFocusIndicator();
  });

  // ── Panel State Management ──
  let currentTab: NavTab = 'monitor';

  function switchRightPanel(tab: NavTab): void {
    // Hide previous content
    if (currentTab === 'analytics') analytics.hide();
    if (currentTab === 'leaderboard') leaderboard.hide();
    if (currentTab === 'toolchain') toolChainPanel.hide();
    if (currentTab === 'taskgraph') taskGraphPanel.hide();
    if (currentTab === 'activity') activityFeed.hide();
    if (currentTab === 'waterfall') waterfallPanel.hide();
    if (currentTab === 'graph') relationshipGraph.hide();

    currentTab = tab;

    if (tab === 'monitor') {
      // Show agent list, hide content area
      overlayEl.style.display = '';
      rightPanelContent.style.display = 'none';
      rightPanelTitle.textContent = 'Agents';
    } else {
      // Close detail panel if open, hide agent list, show content area
      if (detailPanel.isOpen()) detailPanel.close();
      overlayEl.style.display = 'none';
      rightPanelContent.style.display = '';

      const titles: Record<string, string> = {
        analytics: 'Analytics',
        leaderboard: 'Leaderboard',
        toolchain: 'Tool Chains',
        taskgraph: 'Task Graph',
        activity: 'Activity Feed',
        waterfall: 'Waterfall',
        graph: 'Agent Graph',
      };
      rightPanelTitle.textContent = titles[tab] ?? tab;

      if (tab === 'analytics') analytics.show();
      else if (tab === 'leaderboard') leaderboard.show();
      else if (tab === 'toolchain') toolChainPanel.show();
      else if (tab === 'taskgraph') taskGraphPanel.show();
      else if (tab === 'activity') activityFeed.show();
      else if (tab === 'waterfall') waterfallPanel.show();
      else if (tab === 'graph') relationshipGraph.show();
    }
  }

  // Tab switching (sidebar is primary nav, topBar still manages stats)
  sidebar.setTabChangeHandler((tab: NavTab) => {
    switchRightPanel(tab);
  });

  const rightPanel = document.getElementById('right-panel')!;

  // ── Command Palette ──
  const commandPalette = new CommandPalette(store, (action, payload) => {
    switch (action) {
      case 'focus-zone': {
        const zone = ZONE_MAP.get(payload);
        if (zone) {
          world.camera.panTo(zone.x + zone.width / 2, zone.y + zone.height / 2);
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
        updateMuteIcon();
        break;
      case 'toggle-heatmap':
        heatmapVisible = !heatmapVisible;
        const heatmapEl = document.getElementById('zone-heatmap');
        if (heatmapEl) heatmapEl.style.display = heatmapVisible ? 'block' : 'none';
        break;
      case 'toggle-analytics':
        if (currentTab === 'analytics') {
          sidebar.setActiveTab('monitor');
        } else {
          sidebar.setActiveTab('analytics');
        }
        break;
      case 'timeline-live':
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
        if (currentTab === 'leaderboard') {
          sidebar.setActiveTab('monitor');
        } else {
          sidebar.setActiveTab('leaderboard');
        }
        break;
      case 'cycle-theme':
        themeManager.cycleNext();
        break;
      case 'toggle-annotations':
        zoneAnnotations.toggle();
        break;
      case 'toggle-toolchain':
        if (currentTab === 'toolchain') {
          sidebar.setActiveTab('monitor');
        } else {
          sidebar.setActiveTab('toolchain');
        }
        break;
      case 'toggle-taskgraph':
        if (currentTab === 'taskgraph') {
          sidebar.setActiveTab('monitor');
        } else {
          sidebar.setActiveTab('taskgraph');
        }
        break;
      case 'toggle-activity':
        if (currentTab === 'activity') {
          sidebar.setActiveTab('monitor');
        } else {
          sidebar.setActiveTab('activity');
        }
        break;
      case 'toggle-waterfall':
        if (currentTab === 'waterfall') {
          sidebar.setActiveTab('monitor');
        } else {
          sidebar.setActiveTab('waterfall');
        }
        break;
      case 'toggle-graph':
        if (currentTab === 'graph') {
          sidebar.setActiveTab('monitor');
        } else {
          sidebar.setActiveTab('graph');
        }
        break;
    }
  });

  commandPalette.setCustomizationLookup(custLookup);

  // Clean up trails on agent shutdown
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

  // Audio controls (mute button + volume slider in top bar)
  const muteBtn = document.getElementById('mute-btn')!;
  const volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;

  function updateMuteIcon(): void {
    muteBtn.textContent = sound.muted || sound.volume === 0 ? '\u{1F507}' : '\u{1F508}';
    muteBtn.classList.toggle('muted', sound.muted || sound.volume === 0);
  }

  muteBtn.addEventListener('click', () => {
    sound.init();
    sound.muted = !sound.muted;
    updateMuteIcon();
  });

  volumeSlider.addEventListener('input', () => {
    sound.init();
    sound.volume = Number(volumeSlider.value) / 100;
    if (sound.muted && sound.volume > 0) {
      sound.muted = false;
    }
    updateMuteIcon();
  });

  // Notification button
  const notifBtn = document.getElementById('notif-btn')!;
  notifBtn.appendChild(notificationPanel.getBadgeElement());
  notifBtn.addEventListener('click', () => {
    notificationPanel.toggle();
  });

  // Shortcuts button
  document.getElementById('shortcuts-btn')!.addEventListener('click', () => {
    shortcutsHelp.toggle();
  });

  // Command palette hint button
  document.getElementById('cmd-hint')!.addEventListener('click', () => {
    commandPalette.toggle();
  });

  // Request notification permission on first interaction
  document.addEventListener('click', () => {
    sound.init();
    notifications.requestPermission();
  }, { once: true });

  // ── Global keyboard shortcuts ──
  document.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    switch (e.key) {
      case 'a':
        if (currentTab === 'analytics') {
          sidebar.setActiveTab('monitor');
        } else {
          sidebar.setActiveTab('analytics');
        }
        break;
      case 'h':
        heatmapVisible = !heatmapVisible;
        const heatmapEl = document.getElementById('zone-heatmap');
        if (heatmapEl) heatmapEl.style.display = heatmapVisible ? 'block' : 'none';
        break;
      case 'm':
        sound.init();
        sound.muted = !sound.muted;
        updateMuteIcon();
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
      case 't':
        trails.toggle();
        break;
      case 'n':
        world.dayNight.toggle();
        break;
      case '`':
        minimap.toggle();
        break;
      case 'l':
        if (currentTab === 'leaderboard') {
          sidebar.setActiveTab('monitor');
        } else {
          sidebar.setActiveTab('leaderboard');
        }
        break;
      case 'p':
        themeManager.cycleNext();
        break;
      case 'o':
        zoneAnnotations.toggle();
        break;
      case 'c':
        if (currentTab === 'toolchain') {
          sidebar.setActiveTab('monitor');
        } else {
          sidebar.setActiveTab('toolchain');
        }
        break;
      case 'g':
        if (currentTab === 'taskgraph') {
          sidebar.setActiveTab('monitor');
        } else {
          sidebar.setActiveTab('taskgraph');
        }
        break;
      case 'v':
        if (currentTab === 'activity') {
          sidebar.setActiveTab('monitor');
        } else {
          sidebar.setActiveTab('activity');
        }
        break;
      case 'w':
        if (currentTab === 'waterfall') {
          sidebar.setActiveTab('monitor');
        } else {
          sidebar.setActiveTab('waterfall');
        }
        break;
      case 'r':
        if (currentTab === 'graph') {
          sidebar.setActiveTab('monitor');
        } else {
          sidebar.setActiveTab('graph');
        }
        break;
      case '[':
        sidebar.toggle();
        break;
    }
  });

  // Cleanup on page unload — release resources and stop timers
  window.addEventListener('beforeunload', () => {
    ws.disconnect();
    agentManager.dispose();
    overlay.dispose();
    detailPanel.dispose();
    timeline.dispose();
    analytics.dispose();
    leaderboard.dispose();
    topBar.dispose();
    toasts.dispose();
    notificationPanel.dispose();
    permissionPanel.dispose();
    waterfallPanel.destroy();
    activityFeed.destroy();
    minimap.dispose();
    store.dispose();
  });

  // Game loop
  pixiApp.ticker.add(() => {
    const dt = pixiApp.ticker.deltaMS;
    agentManager.update(dt);
    world.update(dt);

    const root = world.root;
    if (heatmapVisible) {
      heatmap.updateTransform(root.x, root.y, root.scale.x);
    }

    layoutEditor.updateTransform(root.x, root.y, root.scale.x);
    zoneAnnotations.updateTransform(root.x, root.y, root.scale.x);

    if (focusModeActive) {
      const pos = agentManager.getFocusedAgentPosition();
      if (pos) {
        world.camera.smoothFollow(pos.x, pos.y);
      }
    }

    if (trails.enabled) {
      const colorMap = new Map<string, number>();
      for (const p of agentManager.getAgentPositions()) {
        const palette = AGENT_PALETTES[p.colorIndex % AGENT_PALETTES.length];
        colorMap.set(p.id, palette.body);
        trails.recordPosition(p.id, p.x, p.y, dt, palette.body);
      }
      trails.update(dt, colorMap);
    }

    if (minimap.visible) {
      const viewport = world.camera.getViewport();
      const agents = agentManager.getAgentPositions();
      minimap.render(agents, viewport);
    }
  });

  console.log('AgentMove started');
}

main().catch(console.error);
