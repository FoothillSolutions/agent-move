import { Application } from 'pixi.js';
import { COLORS } from '@agent-move/shared';

export async function createApp(container: HTMLElement): Promise<Application> {
  const app = new Application();

  await app.init({
    background: COLORS.background,
    resizeTo: container,
    antialias: false,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  container.appendChild(app.canvas);

  return app;
}
