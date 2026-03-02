export type ZoneId =
  | 'files'
  | 'terminal'
  | 'search'
  | 'web'
  | 'thinking'
  | 'messaging'
  | 'tasks'
  | 'idle'
  | 'spawn';

export interface ZoneConfig {
  id: ZoneId;
  label: string;
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: number;
  icon: string;
}
