import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { ZONES } from '@agent-move/shared';
import type { ZoneConfig, ZoneId } from '@agent-move/shared';
import { ZONE_DECORATORS } from './furniture.js';

interface ZoneDisplay {
  container: Container;
  staticBg: Graphics;
  glowBorder: Graphics;
  config: ZoneConfig;
  agentCount: number;
  currentGlow: number;
}

const BORDER_RADIUS = 4;
const GLOW_ALPHA_NORMAL = 0;
const GLOW_ALPHA_ACTIVE = 0.6;
const GLOW_WIDTH_NORMAL = 0;
const GLOW_WIDTH_ACTIVE = 3;

/** Renders pixel-art office rooms for each activity zone */
export class ZoneRenderer {
  private zones = new Map<ZoneId, ZoneDisplay>();
  public readonly container = new Container();

  constructor() {
    for (const zone of ZONES) {
      const zoneDisplay = this.createZone(zone);
      this.zones.set(zone.id, zoneDisplay);
      this.container.addChild(zoneDisplay.container);
    }
  }

  private createZone(config: ZoneConfig): ZoneDisplay {
    const container = new Container();
    container.position.set(config.x, config.y);

    // Static background — room interior drawn once
    const staticBg = new Graphics();
    this.drawRoom(staticBg, config);
    container.addChild(staticBg);

    // Dynamic glow border (updated per frame when agents present)
    const glowBorder = new Graphics();
    container.addChild(glowBorder);

    // Zone label — top-left corner badge
    const labelStyle = new TextStyle({
      fontSize: 11,
      fontFamily: "'Courier New', 'Consolas', monospace",
      fill: 0xffffff,
      fontWeight: 'bold',
      letterSpacing: 1,
      dropShadow: {
        alpha: 1,
        blur: 3,
        color: 0x000000,
        distance: 1,
      },
    });
    const label = new Text({ text: `${config.icon} ${config.label}`, style: labelStyle });
    label.position.set(8, 6);
    container.addChild(label);

    return { container, staticBg, glowBorder, config, agentCount: 0, currentGlow: 0 };
  }

  /** Draw the pixel-art room interior */
  private drawRoom(g: Graphics, config: ZoneConfig): void {
    const decorator = ZONE_DECORATORS[config.id];
    if (decorator) {
      decorator(g, 0, 0, config.width, config.height);
    } else {
      // Fallback: simple colored fill
      g.roundRect(0, 0, config.width, config.height, BORDER_RADIUS)
        .fill({ color: config.color, alpha: 0.15 });
    }
  }

  /** Update zone glow based on how many agents are present */
  setAgentCount(zoneId: ZoneId, count: number): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    zone.agentCount = count;
  }

  /** Smoothly transition zone glow each frame */
  update(dt: number): void {
    for (const zone of this.zones.values()) {
      const targetGlow = zone.agentCount > 0 ? 1 : 0;
      const speed = 3;
      zone.currentGlow += (targetGlow - zone.currentGlow) * Math.min(1, speed * dt / 1000);

      // Only redraw glow border if it's visible
      const alpha = GLOW_ALPHA_NORMAL + (GLOW_ALPHA_ACTIVE - GLOW_ALPHA_NORMAL) * zone.currentGlow;
      const borderWidth = GLOW_WIDTH_NORMAL + (GLOW_WIDTH_ACTIVE - GLOW_WIDTH_NORMAL) * zone.currentGlow;

      zone.glowBorder.clear();
      if (zone.currentGlow > 0.01) {
        zone.glowBorder
          .roundRect(-1, -1, zone.config.width + 2, zone.config.height + 2, BORDER_RADIUS + 1)
          .stroke({ color: zone.config.color, width: borderWidth, alpha });
      }
    }
  }

  /**
   * Destroy and re-create all zone visuals from current ZONES / ZONE_MAP data.
   * Called by the layout editor after zone positions or sizes change.
   */
  rebuild(): void {
    // Preserve agent counts so glow survives a rebuild
    const counts = new Map<ZoneId, number>();
    for (const [id, z] of this.zones) {
      counts.set(id, z.agentCount);
    }

    // Tear down existing
    this.container.removeChildren();
    this.zones.clear();

    // Recreate from (potentially mutated) ZONES array
    for (const zone of ZONES) {
      const zoneDisplay = this.createZone(zone);
      this.zones.set(zone.id, zoneDisplay);
      this.container.addChild(zoneDisplay.container);
      // Restore agent count
      zoneDisplay.agentCount = counts.get(zone.id) ?? 0;
    }
  }

  /** Get zone config for positioning */
  getZoneConfig(zoneId: ZoneId): ZoneConfig | undefined {
    return this.zones.get(zoneId)?.config;
  }
}
