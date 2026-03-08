import type { ZoneId, AgentState } from '@agent-move/shared';
import { ZONE_MAP } from '@agent-move/shared';
import type { WorldManager } from '../world/world-manager.js';

/**
 * Get a distributed position within a zone for an agent.
 * Arranges agents in a grid pattern to avoid overlapping names.
 *
 * @param zoneId       - The target zone.
 * @param agentId      - The agent whose position is being calculated.
 * @param agents       - All currently managed agents (used to count zone occupants).
 * @param world        - WorldManager used to fall back to zone center when zone is unknown.
 */
export function getZonePosition(
  zoneId: ZoneId,
  agentId: string,
  agents: Map<string, { state: AgentState }>,
  world: WorldManager,
): { x: number; y: number } {
  const zone = ZONE_MAP.get(zoneId);
  if (!zone) return world.getZoneCenter(zoneId);

  // Count how many agents are targeting the same zone (including this one)
  const agentsInZone: string[] = [];
  for (const [id, managed] of agents) {
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
