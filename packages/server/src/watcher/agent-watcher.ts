/**
 * Common interface for all agent watchers (Claude Code, OpenCode, etc.).
 * Each watcher monitors its own data source and feeds activity into
 * AgentStateManager via processMessage() / heartbeat().
 *
 * Adding support for a new agent type:
 *   1. Create a class in watcher/<agent-name>/ that implements AgentWatcher
 *   2. Normalize tool names via normalizeToolName() and input fields via
 *      normalizeToolInput() before emitting ParsedActivity
 *   3. Add the watcher to the array in index.ts
 */
export interface AgentWatcher {
  start(): Promise<void>;
  stop(): void;
}
