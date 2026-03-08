import { Container, Graphics, Text, TextStyle } from 'pixi.js';

export interface BadgeComponents {
  container: Container;
  bg: Graphics;
  text: Text;
}

export interface BadgeTextOptions {
  label: string;
  fontSize: number;
  letterSpacing?: number;
}

export function createBadge(textOpts: BadgeTextOptions): BadgeComponents {
  const container = new Container();
  const bg = new Graphics();
  container.addChild(bg);

  const text = new Text({
    text: textOpts.label,
    style: new TextStyle({
      fontSize: textOpts.fontSize,
      fontFamily: "'Segoe UI', sans-serif",
      fill: 0xffffff,
      fontWeight: '700',
      ...(textOpts.letterSpacing !== undefined ? { letterSpacing: textOpts.letterSpacing } : {}),
    }),
  });
  text.anchor.set(0.5, 0.5);
  container.addChild(text);

  return { container, bg, text };
}

/** Draw a circle badge with fill + stroke */
export function drawCircleBadge(
  bg: Graphics,
  radius: number,
  fillColor: number,
  strokeColor: number,
  strokeWidth: number,
  fillAlpha = 0.9,
  strokeAlpha = 0.7,
): void {
  bg.clear();
  bg
    .circle(0, 0, radius)
    .fill({ color: fillColor, alpha: fillAlpha })
    .stroke({ color: strokeColor, width: strokeWidth, alpha: strokeAlpha });
}

/** Draw a rounded-rect badge with fill + stroke */
export function drawRoundRectBadge(
  bg: Graphics,
  width: number,
  height: number,
  radius: number,
  fillColor: number,
  strokeColor: number,
  fillAlpha = 0.9,
  strokeAlpha = 0.7,
): void {
  bg.clear();
  bg
    .roundRect(-width / 2, -height / 2, width, height, radius)
    .fill({ color: fillColor, alpha: fillAlpha })
    .stroke({ color: strokeColor, width: 1, alpha: strokeAlpha });
}
