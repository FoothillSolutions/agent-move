import type { ZoneConfig } from '@agent-move/shared';

const MOVE_SPEED = 100; // pixels per second
const ARRIVAL_THRESHOLD = 3; // pixels
const BOB_AMPLITUDE = 1.5; // pixels
const BOB_SPEED = 2; // cycles per second

export interface MovementState {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  isMoving: boolean;
  bobTimer: number;
  baseY: number;
}

/** Create initial movement state for an agent at a given position */
export function createMovementState(x: number, y: number): MovementState {
  return {
    x,
    y,
    targetX: x,
    targetY: y,
    isMoving: false,
    bobTimer: Math.random() * Math.PI * 2, // random phase offset
    baseY: y,
  };
}

/**
 * Set a new target position within a zone.
 * Picks a random offset within zone bounds.
 */
export function setTargetZone(state: MovementState, zone: ZoneConfig): void {
  const padding = 30;
  state.targetX = zone.x + padding + Math.random() * (zone.width - padding * 2);
  state.targetY = zone.y + padding + Math.random() * (zone.height - padding * 2);
  state.isMoving = true;
}

/**
 * Lerp agent position toward target.
 * Returns true while moving, false when arrived.
 */
export function updateMovement(state: MovementState, dtMs: number): boolean {
  if (!state.isMoving) {
    // Idle bobbing
    state.bobTimer += (dtMs / 1000) * BOB_SPEED * Math.PI * 2;
    state.y = state.baseY + Math.sin(state.bobTimer) * BOB_AMPLITUDE;
    return false;
  }

  const dt = dtMs / 1000;
  const dx = state.targetX - state.x;
  const dy = state.targetY - state.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < ARRIVAL_THRESHOLD) {
    // Arrived
    state.x = state.targetX;
    state.y = state.targetY;
    state.baseY = state.y;
    state.isMoving = false;
    return false;
  }

  // Move toward target
  const step = Math.min(MOVE_SPEED * dt, dist);
  state.x += (dx / dist) * step;
  state.y += (dy / dist) * step;

  return true;
}
