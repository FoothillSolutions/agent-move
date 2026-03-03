import { Graphics } from 'pixi.js';

const DASH_LENGTH = 6;
const GAP_LENGTH = 4;
const FLOW_SPEED = 0.04; // pixels of dash offset per ms
const GLOW_WIDTH = 3;
const GLOW_ALPHA = 0.15;
const CORE_WIDTH = 1;
const CORE_ALPHA = 0.5;
const ARROW_SIZE = 6;
const PULSE_DURATION = 400; // ms

const PARENT_CHILD_COLOR = 0x4a90d9;
const TEAM_COLOR = 0x44ff44;

interface AgentPos {
  x: number;
  y: number;
  parentId: string | null;
  teamName: string | null;
  rootSessionId: string;
  colorIndex: number;
}

/**
 * Draw animated glowing relationship lines between agents.
 * - Parent -> child: blue-tinted glow with directional arrow
 * - Team members: green-tinted glow
 * Supports pulse effects when a child receives a new task.
 */
export class RelationshipLines {
  public readonly graphics = new Graphics();

  /** Accumulated time in ms for dash animation */
  private time = 0;

  /** Active pulse timers keyed by "parentId->childId" */
  private pulseTimers = new Map<string, number>();

  /** Trigger a brief bright flash along a specific parent->child connection */
  pulseConnection(parentId: string, childId: string): void {
    this.pulseTimers.set(`${parentId}->${childId}`, PULSE_DURATION);
  }

  /** Redraw all lines based on current agent positions */
  update(agents: Map<string, AgentPos>, dt: number): void {
    this.time += dt;
    this.graphics.clear();

    // Decrement pulse timers
    for (const [key, remaining] of this.pulseTimers) {
      const next = remaining - dt;
      if (next <= 0) {
        this.pulseTimers.delete(key);
      } else {
        this.pulseTimers.set(key, next);
      }
    }

    const agentList = Array.from(agents.entries());

    // Draw parent-child lines
    for (const [childId, agent] of agentList) {
      if (agent.parentId) {
        const parent = agents.get(agent.parentId);
        if (parent) {
          const pulseKey = `${agent.parentId}->${childId}`;
          const pulseRemaining = this.pulseTimers.get(pulseKey) ?? 0;
          const isPulsing = pulseRemaining > 0;
          const pulseIntensity = isPulsing ? pulseRemaining / PULSE_DURATION : 0;

          this.drawGlowingDashedLine(
            parent.x, parent.y,
            agent.x, agent.y,
            PARENT_CHILD_COLOR,
            pulseIntensity,
          );

          // Draw directional arrow at midpoint
          this.drawArrow(
            parent.x, parent.y,
            agent.x, agent.y,
            PARENT_CHILD_COLOR,
            pulseIntensity,
          );
        }
      }
    }

    // Draw team lines (connect agents in same team within same session)
    const teams = new Map<string, AgentPos[]>();
    for (const [, agent] of agentList) {
      if (agent.teamName) {
        // Scope by rootSessionId so teams from different terminal sessions don't connect
        const key = `${agent.rootSessionId}:${agent.teamName}`;
        let team = teams.get(key);
        if (!team) {
          team = [];
          teams.set(key, team);
        }
        team.push(agent);
      }
    }

    for (const members of teams.values()) {
      if (members.length < 2) continue;
      for (let i = 0; i < members.length - 1; i++) {
        this.drawGlowingDashedLine(
          members[i].x, members[i].y,
          members[i + 1].x, members[i + 1].y,
          TEAM_COLOR,
          0, // no pulse for team lines
        );
      }
    }
  }

  /**
   * Draw a dashed line with glow effect and animated dash scrolling.
   * Draws twice: once thick at low alpha (glow), once thin at higher alpha (core).
   */
  private drawGlowingDashedLine(
    x1: number, y1: number,
    x2: number, y2: number,
    color: number,
    pulseIntensity: number,
  ): void {
    const dashOffset = this.time * FLOW_SPEED;

    // Pulse brightens both glow and core
    const glowAlpha = GLOW_ALPHA + pulseIntensity * 0.35;
    const coreAlpha = CORE_ALPHA + pulseIntensity * 0.4;
    const glowW = GLOW_WIDTH + pulseIntensity * 2;

    // Glow pass (thicker, dimmer)
    this.drawDashedLine(x1, y1, x2, y2, color, glowAlpha, glowW, dashOffset);
    // Core pass (thinner, brighter)
    this.drawDashedLine(x1, y1, x2, y2, color, coreAlpha, CORE_WIDTH, dashOffset);
  }

  /**
   * Draw animated dashed line with a scrolling dash offset.
   */
  private drawDashedLine(
    x1: number, y1: number,
    x2: number, y2: number,
    color: number,
    alpha: number,
    width: number,
    dashOffset: number,
  ): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return;

    const nx = dx / dist;
    const ny = dy / dist;
    const totalPattern = DASH_LENGTH + GAP_LENGTH;

    // Start position offset by animated dashOffset, wrapped to pattern length
    const offset = ((dashOffset % totalPattern) + totalPattern) % totalPattern;
    let drawn = -offset; // start before 0 to fill first partial dash
    let drawing = true;

    while (drawn < dist) {
      const segLen = drawing ? DASH_LENGTH : GAP_LENGTH;
      const segEnd = drawn + segLen;

      if (drawing) {
        // Clamp to visible range [0, dist]
        const clampStart = Math.max(drawn, 0);
        const clampEnd = Math.min(segEnd, dist);
        if (clampEnd > clampStart) {
          const sx = x1 + nx * clampStart;
          const sy = y1 + ny * clampStart;
          const ex = x1 + nx * clampEnd;
          const ey = y1 + ny * clampEnd;
          this.graphics.moveTo(sx, sy).lineTo(ex, ey).stroke({ color, width, alpha });
        }
      }

      drawn = segEnd;
      drawing = !drawing;
    }
  }

  /**
   * Draw a small filled triangle arrow at the midpoint of a line,
   * pointing from (x1,y1) toward (x2,y2).
   */
  private drawArrow(
    x1: number, y1: number,
    x2: number, y2: number,
    color: number,
    pulseIntensity: number,
  ): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < ARROW_SIZE * 3) return; // too short for an arrow

    // Direction unit vector (parent -> child)
    const nx = dx / dist;
    const ny = dy / dist;

    // Midpoint
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;

    // Perpendicular
    const px = -ny;
    const py = nx;

    const half = ARROW_SIZE / 2;
    const alpha = CORE_ALPHA + pulseIntensity * 0.4;

    // Triangle: tip at midpoint + half forward, two base corners at midpoint - half backward +/- perpendicular
    const tipX = mx + nx * half;
    const tipY = my + ny * half;
    const baseLeftX = mx - nx * half + px * half;
    const baseLeftY = my - ny * half + py * half;
    const baseRightX = mx - nx * half - px * half;
    const baseRightY = my - ny * half - py * half;

    this.graphics
      .moveTo(tipX, tipY)
      .lineTo(baseLeftX, baseLeftY)
      .lineTo(baseRightX, baseRightY)
      .closePath()
      .fill({ color, alpha });
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
