import { Application, Container } from 'pixi.js';
import { WORLD_WIDTH, WORLD_HEIGHT, ZONE_MAP } from '@agent-move/shared';
import type { ZoneId, ZoneConfig } from '@agent-move/shared';
import { createGrid } from './grid.js';
import { ZoneRenderer } from './zone-renderer.js';
import { Camera } from './camera.js';

/**
 * Layered scene management.
 * Containers ordered: grid -> zones -> agents -> effects -> ui
 */
export class WorldManager {
  public readonly root = new Container();
  public readonly gridLayer = new Container();
  public readonly zoneLayer: Container;
  public readonly agentLayer = new Container();
  public readonly effectLayer = new Container();
  public readonly uiLayer = new Container();

  public readonly zoneRenderer: ZoneRenderer;
  public readonly camera: Camera;

  constructor(app: Application) {
    // Build grid
    const grid = createGrid();
    this.gridLayer.addChild(grid);

    // Build zones
    this.zoneRenderer = new ZoneRenderer();
    this.zoneLayer = this.zoneRenderer.container;

    // Assemble layers in order
    this.root.addChild(this.gridLayer);
    this.root.addChild(this.zoneLayer);
    this.root.addChild(this.agentLayer);
    this.root.addChild(this.effectLayer);
    this.root.addChild(this.uiLayer);

    // Add root to stage
    app.stage.addChild(this.root);

    // Set up camera
    this.camera = new Camera(app, this.root);

    // Auto-fit to viewport
    this.camera.resetView(WORLD_WIDTH, WORLD_HEIGHT);
  }

  /** Reset camera to fit all rooms */
  resetCamera(): void {
    this.camera.resetView(WORLD_WIDTH, WORLD_HEIGHT);
  }

  /** Add an agent to the agent layer (accepts object with .container or a Container directly) */
  addAgent(child: Container | { container: Container }): void {
    const c = child instanceof Container ? child : child.container;
    this.agentLayer.addChild(c);
  }

  /** Remove an agent from the agent layer */
  removeAgent(child: Container | { container: Container }): void {
    const c = child instanceof Container ? child : child.container;
    this.agentLayer.removeChild(c);
  }

  /** Add effect display object */
  addEffect(child: Container): void {
    this.effectLayer.addChild(child);
  }

  /** Remove effect display object */
  removeEffect(child: Container): void {
    this.effectLayer.removeChild(child);
  }

  /** Get the center position of a zone (world coordinates) */
  getZoneCenter(zoneId: ZoneId): { x: number; y: number } {
    const zone = ZONE_MAP.get(zoneId);
    if (!zone) {
      return { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
    }
    return {
      x: zone.x + zone.width / 2,
      y: zone.y + zone.height / 2,
    };
  }

  /** Get zone config by id */
  getZoneConfig(zoneId: ZoneId): ZoneConfig | undefined {
    return ZONE_MAP.get(zoneId);
  }

  /** Update zone glow counts */
  setZoneAgentCount(zoneId: ZoneId, count: number): void {
    this.zoneRenderer.setAgentCount(zoneId, count);
  }

  /** Rebuild all zone visuals from current ZONE_MAP data (used by layout editor) */
  rebuildZones(): void {
    this.zoneRenderer.rebuild();
  }

  /** Per-frame update */
  update(dt: number): void {
    this.zoneRenderer.update(dt);
  }

  get worldWidth(): number { return WORLD_WIDTH; }
  get worldHeight(): number { return WORLD_HEIGHT; }
}
