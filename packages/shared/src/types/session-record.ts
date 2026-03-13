import type { ZoneId } from './zone.js';
import type { AgentRole } from './agent.js';
import type { ToolChainData } from './tool-chain.js';

/** A persisted recording of a completed coding session */
export interface RecordedSession {
  id: string;
  source: 'claude' | 'opencode';
  rootSessionId: string;
  projectName: string;
  projectPath: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;

  // Aggregate metrics
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  totalToolUses: number;
  agentCount: number;
  model: string | null;

  // Per-agent breakdown
  agents: RecordedAgent[];

  // Tool chain snapshot at end of session
  toolChain: ToolChainData;

  // User-supplied metadata
  label: string | null;
  tags: string[];
}

/** Summary of an agent within a recorded session */
export interface RecordedAgent {
  agentId: string;
  agentName: string | null;
  role: AgentRole;
  model: string | null;
  spawnedAt: number;
  endedAt: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  toolUseCount: number;
  cost: number;
}

/** A single event in the session timeline */
export interface RecordedTimelineEvent {
  timestamp: number;
  agentId: string;
  kind: 'tool' | 'text' | 'zone-change' | 'idle' | 'spawn' | 'shutdown' | 'tokens';
  zone?: ZoneId;
  tool?: string;
  toolArgs?: string;
  text?: string;
  inputTokens?: number;
  outputTokens?: number;
}

/** Lightweight session summary for listing (no timeline) */
export interface SessionSummary {
  id: string;
  source: 'claude' | 'opencode';
  projectName: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  totalCost: number;
  totalToolUses: number;
  agentCount: number;
  model: string | null;
  label: string | null;
  tags: string[];
}

/** A currently in-progress (live) session summary */
export interface LiveSessionSummary {
  rootSessionId: string;
  source: 'claude' | 'opencode';
  projectName: string;
  startedAt: number;
  lastActivityAt: number;
  agentCount: number;
}

/** Two sessions loaded for comparison */
export interface SessionComparison {
  sessionA: RecordedSession & { timeline: RecordedTimelineEvent[] };
  sessionB: RecordedSession & { timeline: RecordedTimelineEvent[] };
}
