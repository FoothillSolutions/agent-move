import type { ToolChainData, ToolTransition } from '@agent-move/shared';

const MAX_DURATION_SAMPLES = 50;

export class ToolChainTracker {
  private lastTool = new Map<string, string>();
  private transitions = new Map<string, number>();
  private toolCounts = new Map<string, number>();

  // Hook-sourced outcome tracking
  private toolSuccesses = new Map<string, number>();
  private toolFailures = new Map<string, number>();
  private toolDurationSamples = new Map<string, number[]>();
  /** Per-agent pending tool start: agentId → {tool, startTime} */
  private pendingStart = new Map<string, { tool: string; startTime: number }>();

  recordToolUse(agentId: string, toolName: string): void {
    this.toolCounts.set(toolName, (this.toolCounts.get(toolName) ?? 0) + 1);
    const prev = this.lastTool.get(agentId);
    this.lastTool.set(agentId, toolName);

    if (prev && prev !== toolName) {
      const key = `${prev}\u2192${toolName}`;
      this.transitions.set(key, (this.transitions.get(key) ?? 0) + 1);
    }
  }

  /** Called from hookPreToolUse — records when a tool started for duration tracking */
  recordToolStart(agentId: string, toolName: string): void {
    this.pendingStart.set(agentId, { tool: toolName, startTime: Date.now() });
  }

  /** Called from hookPostToolUse — records outcome and duration */
  recordToolOutcome(agentId: string, success: boolean): void {
    const pending = this.pendingStart.get(agentId);
    if (!pending) return;
    this.pendingStart.delete(agentId);

    const { tool, startTime } = pending;
    const duration = Date.now() - startTime;

    if (success) {
      this.toolSuccesses.set(tool, (this.toolSuccesses.get(tool) ?? 0) + 1);
    } else {
      this.toolFailures.set(tool, (this.toolFailures.get(tool) ?? 0) + 1);
    }

    // Keep a rolling window of duration samples
    let samples = this.toolDurationSamples.get(tool);
    if (!samples) { samples = []; this.toolDurationSamples.set(tool, samples); }
    samples.push(duration);
    if (samples.length > MAX_DURATION_SAMPLES) samples.shift();
  }

  resetAgent(agentId: string): void {
    this.lastTool.delete(agentId);
    this.pendingStart.delete(agentId);
  }

  /** Migrate per-agent state from an old ID to a new canonical ID (used on agent merge). */
  migrateAgent(fromId: string, toId: string): void {
    const last = this.lastTool.get(fromId);
    if (last !== undefined) {
      if (!this.lastTool.has(toId)) this.lastTool.set(toId, last);
      this.lastTool.delete(fromId);
    }
    const pending = this.pendingStart.get(fromId);
    if (pending !== undefined) {
      if (!this.pendingStart.has(toId)) this.pendingStart.set(toId, pending);
      this.pendingStart.delete(fromId);
    }
  }

  reset(): void {
    this.lastTool.clear();
    this.transitions.clear();
    this.toolCounts.clear();
    this.toolSuccesses.clear();
    this.toolFailures.clear();
    this.toolDurationSamples.clear();
    this.pendingStart.clear();
  }

  hasActiveAgents(): boolean {
    return this.lastTool.size > 0;
  }

  getSnapshot(): ToolChainData {
    const transitions: ToolTransition[] = [];
    for (const [key, count] of this.transitions) {
      const [from, to] = key.split('\u2192');
      transitions.push({ from, to, count });
    }
    transitions.sort((a, b) => b.count - a.count);

    const toolCounts: Record<string, number> = {};
    for (const [tool, count] of this.toolCounts) toolCounts[tool] = count;

    const toolSuccesses: Record<string, number> = {};
    for (const [tool, count] of this.toolSuccesses) toolSuccesses[tool] = count;

    const toolFailures: Record<string, number> = {};
    for (const [tool, count] of this.toolFailures) toolFailures[tool] = count;

    const toolAvgDuration: Record<string, number> = {};
    for (const [tool, samples] of this.toolDurationSamples) {
      if (samples.length > 0) {
        toolAvgDuration[tool] = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
      }
    }

    return {
      transitions,
      tools: Array.from(this.toolCounts.keys()).sort(),
      toolCounts,
      toolSuccesses,
      toolFailures,
      toolAvgDuration,
    };
  }
}
