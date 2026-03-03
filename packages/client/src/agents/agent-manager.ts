import { Application } from 'pixi.js';
import type { AgentState, ZoneId } from '@agent-move/shared';
import { AGENT_PALETTES, ZONE_MAP } from '@agent-move/shared';
import type { StateStore } from '../connection/state-store.js';
import type { WorldManager } from '../world/world-manager.js';
import { AgentSprite, type SpeechMessage } from './agent-sprite.js';
import { RelationshipLines } from './relationship-lines.js';
import { ParticleManager } from '../effects/particle-manager.js';
import { MessageFlow } from '../effects/message-flow.js';
import { ZoneGlow } from '../effects/zone-glow.js';
import type { SoundManager } from '../audio/sound-manager.js';
import type { NotificationManager } from '../audio/notification-manager.js';

interface ManagedAgent {
  sprite: AgentSprite;
  state: AgentState;
}

/** Tool name -> icon mapping for speech bubbles */
const TOOL_ICONS: Record<string, string> = {
  Read: '\u{1F4D6}',       // open book
  Write: '\u{270F}\uFE0F', // pencil
  Edit: '\u{1F527}',       // wrench
  Bash: '\u{1F4BB}',       // terminal
  Glob: '\u{1F50D}',       // search
  Grep: '\u{1F50E}',       // search right
  WebSearch: '\u{1F310}',  // globe
  WebFetch: '\u{1F310}',   // globe
  Agent: '\u{1F916}',      // robot
  TeamCreate: '\u{1F465}', // people
  SendMessage: '\u{1F4AC}',// speech
  TaskCreate: '\u{1F4CB}', // clipboard
  TaskUpdate: '\u{2705}',  // check
  AskUserQuestion: '\u{2753}', // question
  EnterPlanMode: '\u{1F4DD}',  // memo
  ExitPlanMode: '\u{1F4DD}',   // memo
};

const AGENT_SPREAD = 60; // spacing between agents in a zone

export class AgentManager {
  private agents = new Map<string, ManagedAgent>();
  private lines: RelationshipLines;
  private particles: ParticleManager;
  private messageFlow: MessageFlow;
  private zoneGlow: ZoneGlow;
  private sound: SoundManager | null = null;
  private notifications: NotificationManager | null = null;
  private _focusedAgentId: string | null = null;

  setSoundManager(sound: SoundManager): void {
    this.sound = sound;
  }

  setNotificationManager(notifications: NotificationManager): void {
    this.notifications = notifications;
  }

  constructor(
    private app: Application,
    private world: WorldManager,
    private store: StateStore,
  ) {
    this.lines = new RelationshipLines();
    this.world.uiLayer.addChild(this.lines.graphics);

    this.particles = new ParticleManager(app.renderer);
    this.world.addEffect(this.particles.container);

    this.messageFlow = new MessageFlow();
    this.world.addEffect(this.messageFlow.container);

    this.zoneGlow = new ZoneGlow();

    this.store.on('agent:spawn', (agent) => this.onSpawn(agent));
    this.store.on('agent:update', (agent) => this.onUpdate(agent));
    this.store.on('agent:idle', (agent) => this.onIdle(agent));
    this.store.on('agent:shutdown', (agentId) => this.onShutdown(agentId));
    this.store.on('state:reset', (agents) => this.onReset(agents));
  }

  /** Build rich speech messages from agent state */
  private buildSpeechMessages(agent: AgentState): SpeechMessage[] {
    const messages: SpeechMessage[] = [];

    // Input-needed check
    if (agent.currentTool === 'AskUserQuestion') {
      messages.push({
        text: 'Waiting for input...',
        type: 'input-needed',
        icon: '\u{23F3}',
      });
      return messages;
    }

    // Tool message with details
    if (agent.currentTool) {
      const icon = TOOL_ICONS[agent.currentTool] || '\u{2699}\uFE0F';
      let detail = agent.currentTool;

      // Add file path or command info
      if (agent.currentActivity) {
        const activity = agent.currentActivity;
        // Extract meaningful short form
        if (activity.length <= 50) {
          detail = `${agent.currentTool}: ${activity}`;
        } else {
          // Try to extract just filename from path
          const parts = activity.replace(/\\/g, '/').split('/');
          const shortPath = parts.length > 2
            ? `.../${parts.slice(-2).join('/')}`
            : activity.slice(0, 45);
          detail = `${agent.currentTool}: ${shortPath}`;
        }
      }

      messages.push({ text: detail, type: 'tool', icon });
    }

    // Planning mode indicator (shown alongside tool usage)
    if (agent.isPlanning && agent.currentTool !== 'EnterPlanMode' && agent.currentTool !== 'ExitPlanMode') {
      messages.push({
        text: 'Planning...',
        type: 'tool',
        icon: '\u{1F4DD}',
      });
    }

    // Text/speech message
    if (agent.speechText) {
      messages.push({
        text: agent.speechText,
        type: 'text',
        icon: '\u{1F4AD}',
      });
    }

    return messages;
  }

  /** Count children for each agent and update badges */
  private updateChildBadges(): void {
    const childCounts = new Map<string, number>();
    for (const [, managed] of this.agents) {
      if (managed.state.parentId) {
        childCounts.set(managed.state.parentId, (childCounts.get(managed.state.parentId) ?? 0) + 1);
      }
    }
    for (const [id, managed] of this.agents) {
      managed.sprite.setChildCount(childCounts.get(id) ?? 0);
    }
  }

  private onSpawn(agent: AgentState): void {
    if (this.agents.has(agent.id)) return;

    const palette = AGENT_PALETTES[agent.colorIndex % AGENT_PALETTES.length];
    const sprite = new AgentSprite(agent, palette, this.app.renderer);

    // If agent has a parent, start at parent's position for visual emergence
    const parentManaged = agent.parentId ? this.agents.get(agent.parentId) : null;
    if (parentManaged) {
      sprite.container.position.set(
        parentManaged.sprite.container.x,
        parentManaged.sprite.container.y,
      );
    } else {
      const spawnPos = this.world.getZoneCenter('spawn');
      sprite.container.position.set(spawnPos.x, spawnPos.y);
    }

    this.agents.set(agent.id, { sprite, state: agent });
    this.world.addAgent(sprite.container);

    // Move to the agent's current zone
    const target = this.getZonePosition(agent.currentZone, agent.id);
    sprite.moveTo(target.x, target.y);

    this.updateChildBadges();
    this.sound?.play('spawn');
    this.notifications?.notifySpawn(agent.agentName || agent.projectName || agent.id.slice(0, 8));
  }

  private onUpdate(agent: AgentState): void {
    const managed = this.agents.get(agent.id);
    if (!managed) {
      this.onSpawn(agent);
      return;
    }

    const prevZone = managed.state.currentZone;
    managed.state = agent;

    // Update name label if agentName was discovered
    managed.sprite.updateName(agent);

    // Move to new zone with distributed position
    const target = this.getZonePosition(agent.currentZone, agent.id);
    managed.sprite.moveTo(target.x, target.y);

    // Build and show rich speech messages
    const messages = this.buildSpeechMessages(agent);
    if (messages.length > 0) {
      managed.sprite.setSpeech(messages);
    } else {
      managed.sprite.clearSpeech();
    }

    managed.sprite.setIdle(false);
    managed.sprite.setPlanning(agent.isPlanning);

    // Done agents get checkmark badge, sparkles, and slight dim
    if (agent.isDone) {
      managed.sprite.setDone(true);
      managed.sprite.setIdle(true);
      managed.sprite.clearSpeech();
      managed.sprite.container.alpha = 0.65;
      return;
    }

    managed.sprite.setDone(false);
    managed.sprite.container.alpha = 1;

    // Emit particles on tool use
    if (agent.currentTool) {
      const palette = AGENT_PALETTES[agent.colorIndex % AGENT_PALETTES.length];
      this.particles.emit(managed.sprite.container.x, managed.sprite.container.y, palette.body);
      this.sound?.play('tool-use');

      // Message flow animation for SendMessage
      if (agent.currentTool === 'SendMessage') {
        let targetAgent: { sprite: { container: { x: number; y: number } } } | undefined;

        // First: try to find target by messageTarget name within same session (peer-to-peer)
        if (agent.messageTarget) {
          for (const [, other] of this.agents) {
            if ((other.state.agentName === agent.messageTarget || other.state.id === agent.messageTarget)
                && other.state.rootSessionId === agent.rootSessionId) {
              targetAgent = other;
              break;
            }
          }
        }

        // Fallback: parent -> child or child -> parent
        if (!targetAgent && agent.parentId) {
          targetAgent = this.agents.get(agent.parentId);
        }
        if (!targetAgent) {
          for (const [, other] of this.agents) {
            if (other.state.parentId === agent.id) {
              targetAgent = other;
              break;
            }
          }
        }

        if (targetAgent) {
          this.messageFlow.send(
            managed.sprite.container.x, managed.sprite.container.y,
            targetAgent.sprite.container.x, targetAgent.sprite.container.y,
            palette.body,
          );
        }
      }

      // Update activity ring
      managed.sprite.bumpActivity();
    }

    // Play zone change sound if zone changed
    if (prevZone !== agent.currentZone) {
      this.sound?.play('zone-change');
    }
  }

  private onIdle(agent: AgentState): void {
    const managed = this.agents.get(agent.id);
    if (!managed) return;

    managed.state = agent;
    const target = this.getZonePosition('idle', agent.id);
    managed.sprite.moveTo(target.x, target.y);
    managed.sprite.setIdle(true);
    managed.sprite.clearSpeech();

    this.sound?.play('idle');
    this.notifications?.notifyIdle(agent.agentName || agent.projectName || agent.id.slice(0, 8));
  }

  private onShutdown(agentId: string): void {
    const managed = this.agents.get(agentId);
    if (!managed) return;

    this.sound?.play('shutdown');
    this.notifications?.notifyShutdown(managed.state.agentName || managed.state.projectName || agentId.slice(0, 8));

    const spawnPos = this.world.getZoneCenter('spawn');
    managed.sprite.moveTo(spawnPos.x, spawnPos.y);

    managed.sprite.fadeOut().then(() => {
      this.world.removeAgent(managed.sprite.container);
      managed.sprite.destroy();
      this.agents.delete(agentId);
      this.updateChildBadges();
    });
  }

  private onReset(agents: Map<string, AgentState>): void {
    this.rebuildFromState(agents);
  }

  /**
   * Replace all rendered agents with a new state map.
   * Used by both state:reset (live) and timeline replay.
   */
  rebuildFromState(agents: Map<string, AgentState>): void {
    // Destroy existing sprites
    for (const [, managed] of this.agents) {
      this.world.removeAgent(managed.sprite.container);
      managed.sprite.destroy();
    }
    this.agents.clear();

    // Spawn all agents from state
    for (const agent of agents.values()) {
      this.onSpawn(agent);
      // Position immediately (skip walking from spawn)
      const managed = this.agents.get(agent.id);
      if (managed) {
        const target = this.getZonePosition(agent.currentZone, agent.id);
        managed.sprite.container.position.set(target.x, target.y);
        managed.sprite.setIdle(agent.isIdle);
        if (agent.isDone) {
          managed.sprite.setDone(true);
          managed.sprite.container.alpha = 0.65;
        }
      }
    }
  }

  /**
   * Get a distributed position within a zone for an agent.
   * Arranges agents in a grid pattern to avoid overlapping names.
   */
  private getZonePosition(zoneId: ZoneId, agentId: string): { x: number; y: number } {
    const zone = ZONE_MAP.get(zoneId);
    if (!zone) return this.world.getZoneCenter(zoneId);

    // Count how many agents are targeting the same zone (including this one)
    const agentsInZone: string[] = [];
    for (const [id, managed] of this.agents) {
      if (managed.state.currentZone === zoneId || (managed.state.isIdle && zoneId === 'idle')) {
        agentsInZone.push(id);
      }
    }
    // Add self if not yet tracked
    if (!agentsInZone.includes(agentId)) {
      agentsInZone.push(agentId);
    }
    agentsInZone.sort(); // deterministic order

    const index = agentsInZone.indexOf(agentId);
    const count = agentsInZone.length;

    // Use zone interior (offset from edges for labels at top)
    const usableX = zone.width - 40;   // 20px padding each side
    const usableY = zone.height - 70;  // 50px top for label, 20px bottom
    const startX = zone.x + 20;
    const startY = zone.y + 50;

    if (count === 1) {
      return { x: startX + usableX / 2, y: startY + usableY / 2 };
    }

    // Grid layout: fit agents into rows
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    const col = index % cols;
    const row = Math.floor(index / cols);

    const cellW = usableX / cols;
    const cellH = usableY / rows;

    return {
      x: startX + cellW * col + cellW / 2,
      y: startY + cellH * row + cellH / 2,
    };
  }

  /** Called each frame from the game loop */
  update(deltaMs: number): void {
    for (const managed of this.agents.values()) {
      managed.sprite.update(deltaMs);
    }

    // Update particles & message flow
    this.particles.update(deltaMs);
    this.messageFlow.update(deltaMs);

    // Update relationship lines
    const lineData = new Map<string, { x: number; y: number; parentId: string | null; teamName: string | null; rootSessionId: string; colorIndex: number }>();
    for (const [id, managed] of this.agents) {
      lineData.set(id, {
        x: managed.sprite.container.x,
        y: managed.sprite.container.y,
        parentId: managed.state.parentId,
        teamName: managed.state.teamName,
        rootSessionId: managed.state.rootSessionId,
        colorIndex: managed.state.colorIndex,
      });
    }
    this.lines.update(lineData, deltaMs);

    // Update zone glow counts
    const agentZones = Array.from(this.agents.values()).map((m) => m.state.currentZone as ZoneId);
    const zoneCounts = this.zoneGlow.updateFromAgents(agentZones);
    for (const [zoneId, count] of zoneCounts) {
      this.world.setZoneAgentCount(zoneId, count);
    }
    for (const zone of ZONE_MAP.keys()) {
      if (!zoneCounts.has(zone)) {
        this.world.setZoneAgentCount(zone, 0);
      }
    }

    this.world.update(deltaMs);
  }

  /** Set or clear the focused agent for camera follow mode */
  setFocusAgent(agentId: string | null): void {
    this._focusedAgentId = agentId;
  }

  get focusedAgentId(): string | null {
    return this._focusedAgentId;
  }

  /** Get display name of the focused agent */
  getFocusedAgentName(): string | null {
    if (!this._focusedAgentId) return null;
    const managed = this.agents.get(this._focusedAgentId);
    if (!managed) return null;
    return managed.state.agentName || managed.state.projectName || managed.state.sessionId.slice(0, 10);
  }

  /** Get ordered list of active (non-idle, non-done) agent IDs */
  getActiveAgentIds(): string[] {
    const ids: string[] = [];
    for (const [id, managed] of this.agents) {
      if (!managed.state.isIdle && !managed.state.isDone) ids.push(id);
    }
    // If no active agents, include idle ones
    if (ids.length === 0) {
      for (const [id] of this.agents) ids.push(id);
    }
    return ids.sort();
  }

  /**
   * Cycle focus to the next agent. If none focused, picks the first active agent.
   * Returns the newly focused agent ID, or null if no agents exist.
   */
  cycleNextAgent(): string | null {
    const ids = this.getActiveAgentIds();
    if (ids.length === 0) return null;

    if (!this._focusedAgentId || !ids.includes(this._focusedAgentId)) {
      this._focusedAgentId = ids[0];
    } else {
      const idx = ids.indexOf(this._focusedAgentId);
      this._focusedAgentId = ids[(idx + 1) % ids.length];
    }
    return this._focusedAgentId;
  }

  /** Get world position of the focused agent (if any) */
  getFocusedAgentPosition(): { x: number; y: number } | null {
    if (!this._focusedAgentId) return null;
    const managed = this.agents.get(this._focusedAgentId);
    if (!managed) {
      this._focusedAgentId = null;
      return null;
    }
    return {
      x: managed.sprite.container.x,
      y: managed.sprite.container.y,
    };
  }
}
