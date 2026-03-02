import { Application } from 'pixi.js';
import type { AgentState, ZoneId } from '@agentflow/shared';
import { AGENT_PALETTES, ZONE_MAP } from '@agentflow/shared';
import type { StateStore } from '../connection/state-store.js';
import type { WorldManager } from '../world/world-manager.js';
import { AgentSprite } from './agent-sprite.js';
import { RelationshipLines } from './relationship-lines.js';
import { ParticleManager } from '../effects/particle-manager.js';
import { ZoneGlow } from '../effects/zone-glow.js';

interface ManagedAgent {
  sprite: AgentSprite;
  state: AgentState;
}

const AGENT_SPREAD = 60; // spacing between agents in a zone

export class AgentManager {
  private agents = new Map<string, ManagedAgent>();
  private lines: RelationshipLines;
  private particles: ParticleManager;
  private zoneGlow: ZoneGlow;

  constructor(
    private app: Application,
    private world: WorldManager,
    private store: StateStore,
  ) {
    this.lines = new RelationshipLines();
    this.world.uiLayer.addChild(this.lines.graphics);

    this.particles = new ParticleManager(app.renderer);
    this.world.addEffect(this.particles.container);

    this.zoneGlow = new ZoneGlow();

    this.store.on('agent:spawn', (agent) => this.onSpawn(agent));
    this.store.on('agent:update', (agent) => this.onUpdate(agent));
    this.store.on('agent:idle', (agent) => this.onIdle(agent));
    this.store.on('agent:shutdown', (agentId) => this.onShutdown(agentId));
    this.store.on('state:reset', (agents) => this.onReset(agents));
  }

  private onSpawn(agent: AgentState): void {
    if (this.agents.has(agent.id)) return;

    const palette = AGENT_PALETTES[agent.colorIndex % AGENT_PALETTES.length];
    const sprite = new AgentSprite(agent, palette, this.app.renderer);

    // Place at spawn zone center
    const spawnPos = this.world.getZoneCenter('spawn');
    sprite.container.position.set(spawnPos.x, spawnPos.y);

    this.agents.set(agent.id, { sprite, state: agent });
    this.world.addAgent(sprite.container);

    // Move to the agent's current zone
    const target = this.getZonePosition(agent.currentZone, agent.id);
    sprite.moveTo(target.x, target.y);
  }

  private onUpdate(agent: AgentState): void {
    const managed = this.agents.get(agent.id);
    if (!managed) {
      this.onSpawn(agent);
      return;
    }

    managed.state = agent;

    // Move to new zone with distributed position
    const target = this.getZonePosition(agent.currentZone, agent.id);
    managed.sprite.moveTo(target.x, target.y);

    // Show speech bubble
    if (agent.currentTool) {
      managed.sprite.setSpeech(agent.currentTool);
    } else if (agent.speechText) {
      managed.sprite.setSpeech(agent.speechText);
    } else {
      managed.sprite.setSpeech('');
    }

    managed.sprite.setIdle(false);

    // Emit particles on tool use
    if (agent.currentTool) {
      const palette = AGENT_PALETTES[agent.colorIndex % AGENT_PALETTES.length];
      this.particles.emit(managed.sprite.container.x, managed.sprite.container.y, palette.body);
    }
  }

  private onIdle(agent: AgentState): void {
    const managed = this.agents.get(agent.id);
    if (!managed) return;

    managed.state = agent;
    const target = this.getZonePosition('idle', agent.id);
    managed.sprite.moveTo(target.x, target.y);
    managed.sprite.setIdle(true);
    managed.sprite.setSpeech('');
  }

  private onShutdown(agentId: string): void {
    const managed = this.agents.get(agentId);
    if (!managed) return;

    const spawnPos = this.world.getZoneCenter('spawn');
    managed.sprite.moveTo(spawnPos.x, spawnPos.y);

    managed.sprite.fadeOut().then(() => {
      this.world.removeAgent(managed.sprite.container);
      managed.sprite.destroy();
      this.agents.delete(agentId);
    });
  }

  private onReset(agents: Map<string, AgentState>): void {
    for (const [, managed] of this.agents) {
      this.world.removeAgent(managed.sprite.container);
      managed.sprite.destroy();
    }
    this.agents.clear();

    for (const agent of agents.values()) {
      this.onSpawn(agent);
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

    // Update particles
    this.particles.update(deltaMs);

    // Update relationship lines
    const lineData = new Map<string, { x: number; y: number; parentId: string | null; teamName: string | null; colorIndex: number }>();
    for (const [id, managed] of this.agents) {
      lineData.set(id, {
        x: managed.sprite.container.x,
        y: managed.sprite.container.y,
        parentId: managed.state.parentId,
        teamName: managed.state.teamName,
        colorIndex: managed.state.colorIndex,
      });
    }
    this.lines.update(lineData);

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
}
