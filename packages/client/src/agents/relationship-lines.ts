import { Graphics } from 'pixi.js';
import { COLORS } from '@agentflow/shared';

const DASH_LENGTH = 6;
const GAP_LENGTH = 4;
const LINE_ALPHA = 0.4;

interface AgentPos {
  x: number;
  y: number;
  parentId: string | null;
  teamName: string | null;
  colorIndex: number;
}

/**
 * Draw dashed relationship lines between agents.
 * - Parent -> child: dim white dashed line
 * - Team members: colored dashed line matching team color
 */
export class RelationshipLines {
  public readonly graphics = new Graphics();

  /** Redraw all lines based on current agent positions */
  update(agents: Map<string, AgentPos>): void {
    this.graphics.clear();

    const agentList = Array.from(agents.entries());

    // Draw parent-child lines
    for (const [, agent] of agentList) {
      if (agent.parentId) {
        const parent = agents.get(agent.parentId);
        if (parent) {
          this.drawDashedLine(
            parent.x, parent.y,
            agent.x, agent.y,
            COLORS.relationshipLine,
            LINE_ALPHA,
          );
        }
      }
    }

    // Draw team lines (connect agents in same team)
    const teams = new Map<string, AgentPos[]>();
    for (const [, agent] of agentList) {
      if (agent.teamName) {
        let team = teams.get(agent.teamName);
        if (!team) {
          team = [];
          teams.set(agent.teamName, team);
        }
        team.push(agent);
      }
    }

    for (const members of teams.values()) {
      if (members.length < 2) continue;
      const color = COLORS.teamLine;
      // Connect each pair
      for (let i = 0; i < members.length - 1; i++) {
        this.drawDashedLine(
          members[i].x, members[i].y,
          members[i + 1].x, members[i + 1].y,
          color,
          LINE_ALPHA * 0.7,
        );
      }
    }
  }

  private drawDashedLine(
    x1: number, y1: number,
    x2: number, y2: number,
    color: number,
    alpha: number,
  ): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return;

    const nx = dx / dist;
    const ny = dy / dist;
    const totalPattern = DASH_LENGTH + GAP_LENGTH;

    let drawn = 0;
    let drawing = true;

    while (drawn < dist) {
      const segLen = drawing ? DASH_LENGTH : GAP_LENGTH;
      const end = Math.min(drawn + segLen, dist);

      if (drawing) {
        const sx = x1 + nx * drawn;
        const sy = y1 + ny * drawn;
        const ex = x1 + nx * end;
        const ey = y1 + ny * end;
        this.graphics.moveTo(sx, sy).lineTo(ex, ey).stroke({ color, width: 1, alpha });
      }

      drawn = end;
      drawing = !drawing;
    }
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
