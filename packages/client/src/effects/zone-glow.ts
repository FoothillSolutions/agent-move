import type { ZoneId } from '@agent-move/shared';

/**
 * Track per-zone agent counts to drive zone glow effects.
 * The actual glow rendering is handled by ZoneRenderer.
 */
export class ZoneGlow {
  private zoneCounts = new Map<ZoneId, number>();

  /** Recalculate zone counts from a set of agent zone assignments */
  updateFromAgents(agentZones: Iterable<ZoneId>): Map<ZoneId, number> {
    this.zoneCounts.clear();

    for (const zoneId of agentZones) {
      this.zoneCounts.set(zoneId, (this.zoneCounts.get(zoneId) ?? 0) + 1);
    }

    return this.zoneCounts;
  }

  /** Get count for a specific zone */
  getCount(zoneId: ZoneId): number {
    return this.zoneCounts.get(zoneId) ?? 0;
  }

  /** Get all zone counts */
  getCounts(): Map<ZoneId, number> {
    return this.zoneCounts;
  }
}
