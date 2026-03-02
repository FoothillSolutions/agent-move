import type { ZoneConfig } from '../types/zone.js';

const ZONE_SIZE = 340;
const GAP = 16;
const COLS = 3;

function zonePos(index: number): { x: number; y: number } {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  return {
    x: col * (ZONE_SIZE + GAP) + GAP,
    y: row * (ZONE_SIZE + GAP) + GAP,
  };
}

export const ZONES: ZoneConfig[] = [
  {
    id: 'files',
    label: 'Files',
    description: 'Read, Write, Edit, Glob',
    icon: '📁',
    color: 0x3b82f6,
    width: ZONE_SIZE,
    height: ZONE_SIZE,
    ...zonePos(0),
  },
  {
    id: 'terminal',
    label: 'Terminal',
    description: 'Bash commands',
    icon: '💻',
    color: 0x22c55e,
    width: ZONE_SIZE,
    height: ZONE_SIZE,
    ...zonePos(1),
  },
  {
    id: 'search',
    label: 'Search',
    description: 'Grep, WebSearch',
    icon: '🔍',
    color: 0xeab308,
    width: ZONE_SIZE,
    height: ZONE_SIZE,
    ...zonePos(2),
  },
  {
    id: 'web',
    label: 'Web',
    description: 'WebFetch, Browser',
    icon: '🌐',
    color: 0x8b5cf6,
    width: ZONE_SIZE,
    height: ZONE_SIZE,
    ...zonePos(3),
  },
  {
    id: 'thinking',
    label: 'Thinking',
    description: 'Planning, Questions',
    icon: '💭',
    color: 0xf97316,
    width: ZONE_SIZE,
    height: ZONE_SIZE,
    ...zonePos(4),
  },
  {
    id: 'messaging',
    label: 'Messaging',
    description: 'SendMessage, Teams',
    icon: '💬',
    color: 0xec4899,
    width: ZONE_SIZE,
    height: ZONE_SIZE,
    ...zonePos(5),
  },
  {
    id: 'tasks',
    label: 'Tasks',
    description: 'TaskCreate, TaskUpdate',
    icon: '📋',
    color: 0x14b8a6,
    width: ZONE_SIZE,
    height: ZONE_SIZE,
    ...zonePos(6),
  },
  {
    id: 'idle',
    label: 'Rest Area',
    description: 'Idle agents rest here',
    icon: '😴',
    color: 0x6b7280,
    width: ZONE_SIZE,
    height: ZONE_SIZE,
    ...zonePos(7),
  },
  {
    id: 'spawn',
    label: 'Portal',
    description: 'Agent spawn/despawn',
    icon: '🌀',
    color: 0xa855f7,
    width: ZONE_SIZE,
    height: ZONE_SIZE,
    ...zonePos(8),
  },
];

export const ZONE_MAP = new Map(ZONES.map((z) => [z.id, z]));

export const WORLD_WIDTH = COLS * (ZONE_SIZE + GAP) + GAP;
export const WORLD_HEIGHT = Math.ceil(ZONES.length / COLS) * (ZONE_SIZE + GAP) + GAP;
