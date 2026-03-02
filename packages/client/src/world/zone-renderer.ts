import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { ZONES } from '@agentflow/shared';
import type { ZoneConfig, ZoneId } from '@agentflow/shared';

interface ZoneDisplay {
  container: Container;
  background: Graphics;
  border: Graphics;
  config: ZoneConfig;
  agentCount: number;
  currentGlow: number;
}

const BORDER_RADIUS = 8;
const BG_ALPHA = 0.15;
const BORDER_WIDTH = 2;
const BORDER_ALPHA_NORMAL = 0.4;
const BORDER_ALPHA_GLOW = 0.9;

/** Renders and manages all activity zones */
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

    // Background fill
    const background = new Graphics();
    background
      .roundRect(0, 0, config.width, config.height, BORDER_RADIUS)
      .fill({ color: config.color, alpha: BG_ALPHA });
    container.addChild(background);

    // Border
    const border = new Graphics();
    border
      .roundRect(0, 0, config.width, config.height, BORDER_RADIUS)
      .stroke({ color: config.color, width: BORDER_WIDTH, alpha: BORDER_ALPHA_NORMAL });
    container.addChild(border);

    // Icon + Label
    const labelStyle = new TextStyle({
      fontSize: 16,
      fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
      fill: 0xffffff,
      fontWeight: 'bold',
    });
    const label = new Text({ text: `${config.icon} ${config.label}`, style: labelStyle });
    label.position.set(10, 10);
    container.addChild(label);

    // Description
    const descStyle = new TextStyle({
      fontSize: 12,
      fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
      fill: 0x999999,
    });
    const desc = new Text({ text: config.description, style: descStyle });
    desc.position.set(10, 32);
    container.addChild(desc);

    return { container, background, border, config, agentCount: 0, currentGlow: 0 };
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
      const speed = 3; // transition speed
      zone.currentGlow += (targetGlow - zone.currentGlow) * Math.min(1, speed * dt / 1000);

      const alpha = BORDER_ALPHA_NORMAL + (BORDER_ALPHA_GLOW - BORDER_ALPHA_NORMAL) * zone.currentGlow;
      const borderWidth = BORDER_WIDTH + zone.currentGlow * 1.5;

      zone.border.clear();
      zone.border
        .roundRect(0, 0, zone.config.width, zone.config.height, BORDER_RADIUS)
        .stroke({ color: zone.config.color, width: borderWidth, alpha });

      // Brighten background slightly when active
      const bgAlpha = BG_ALPHA + zone.currentGlow * 0.08;
      zone.background.clear();
      zone.background
        .roundRect(0, 0, zone.config.width, zone.config.height, BORDER_RADIUS)
        .fill({ color: zone.config.color, alpha: bgAlpha });
    }
  }

  /** Get zone config for positioning */
  getZoneConfig(zoneId: ZoneId): ZoneConfig | undefined {
    return this.zones.get(zoneId)?.config;
  }
}
