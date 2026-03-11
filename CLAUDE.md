# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Start server (:3333) + client (:5173) concurrently
npm run build            # Build shared → server → client in dependency order
npm run typecheck        # Full monorepo type check (tsc -b)
```

Single-package commands:
```bash
npm run dev -w @agent-move/server     # tsx watch (live reload)
npm run dev -w @agent-move/client     # vite dev server
npm run build -w @agent-move/shared   # tsc (types/constants only)
```

## Architecture

Three-package monorepo (npm workspaces) with strict TypeScript, ES modules throughout.

**@agent-move/shared** — Zero-dependency types and constants consumed by both server and client. Key exports: `AgentState`, `AgentType`, `ZoneId`, `ServerMessage`, `TOOL_ZONE_MAP`, `ZONES`, `AGENT_PALETTES`, `getZoneForTool()`, `normalizeToolName()`, `normalizeToolInput()`.

**@agent-move/server** — Fastify backend with multi-CLI watchers. Each watcher implements the `AgentWatcher` interface (`start()`/`stop()`). All watchers feed parsed activities into a shared `AgentStateManager` which maintains agent state with 30s idle timeout and broadcasts changes over WebSocket.

**@agent-move/client** — Pixi.js v8 WebGL frontend. Connects to server via auto-reconnecting WebSocket. Renders 9 activity zones in a 3x3 grid (280px each). Agents are programmatic 16x16 pixel-art sprites rendered at 3x scale with idle/walk/working animations. `AgentManager` bridges the `StateStore` (event emitter) to `AgentSprite` instances.

## Supported CLIs

| CLI | AgentType | Watcher | Session Format | Session Path |
|-----|-----------|---------|----------------|--------------|
| Claude Code | `claude` | `claude/claude-watcher.ts` | JSONL (byte-offset) | `~/.claude/projects/**/*.jsonl` |
| OpenCode | `opencode` | `opencode/opencode-watcher.ts` | SQLite WAL (500ms poll) | `~/.opencode/` |
| Codex CLI | `codex` | `codex/codex-watcher.ts` | JSONL (recursive scan) | `~/.codex/sessions/YYYY/MM/DD/*.jsonl` |
| pi | `pi` | `pi/pi-watcher.ts` | JSONL | `~/.pi-agent/sessions/` |

Each watcher has its own parser that normalizes tool names and input to canonical form via `normalizeToolName()` / `normalizeToolInput()` in shared, so downstream code (activity-processor, zone mapping, task graph) has no CLI-specific branches.

## Data Flow

```
Claude JSONL ──→ ClaudeWatcher ──┐
OpenCode SQLite → OpenCodeWatcher ┤
Codex JSONL ───→ CodexWatcher ───┤→ AgentStateManager → Broadcaster → WebSocket → Client
pi JSONL ──────→ PiWatcher ──────┘
                                      ↑
Claude Hooks (POST /hook) ───────────┘
```

## Key Patterns

- **Tool name normalization**: `normalizeToolName()` in `shared/src/constants/tools.ts` maps CLI-specific names (e.g., `shell_command`, `exec_command`) to canonical PascalCase (`Bash`). `TOOL_NAME_MAP` has ~50 mappings across all CLIs.
- **Tool-to-zone mapping**: `getZoneForTool()` maps canonical tool names to ZoneIds. All `mcp__*` tools default to `web` zone. Unknown tools default to `thinking`.
- **Task graph**: `TaskGraphManager` tracks tasks from `TaskCreate`/`TaskUpdate` (Claude), `TodoWrite` with `{todos}` (OpenCode), and `update_plan` with `{plan}` (Codex). Tasks are scoped per root session to prevent cross-team ID collisions.
- **Sprite textures**: Generated programmatically from pixel arrays in `sprite-data.ts` using palette colors, cached by key in `sprite-factory.ts`. Uses `renderer.generateTexture({ target: g })` (Pixi v8 API — renderer param typed as `any` because the concrete type doesn't expose this method).
- **Agent positioning**: `AgentManager.getZonePosition()` distributes multiple agents within a zone using a grid layout to prevent name label overlap.
- **Session detection**: Each watcher extracts session IDs with a CLI prefix (`claude:`, `codex:`, `opencode:`, `pi:`) to prevent cross-CLI collisions. Subagent detection is CLI-specific (path depth for Claude, `spawn_agent` calls for Codex, parent session refs for others).
- **WebSocket protocol**: Server sends `full_state` on connect, then incremental `agent:spawn/update/idle/shutdown` events. Client auto-reconnects with exponential backoff (1s–10s).
- **Windows compatibility**: Codex watcher uses polling (500ms) on Windows since `fs.watch` doesn't reliably detect changes in deeply nested directories.

## Extending

- **New CLI watcher**: Create a folder under `server/src/watcher/<name>/`, implement `AgentWatcher` interface, add a parser that emits `ParsedActivity`, add tool name mappings to `TOOL_NAME_MAP`, add `AgentType` to `shared/src/types/agent.ts`, add CLI badge in `client/src/utils/formatting.ts`, wire in `server/src/index.ts` with a feature flag in `config.ts`.
- **New zone**: Add entry to `ZONES` array in `shared/src/constants/zones.ts`, add tool mappings in `tools.ts`.
- **New tool mapping**: Add to `TOOL_NAME_MAP` (CLI-specific name → canonical) and/or `TOOL_ZONE_MAP` (canonical → zone) in `shared/src/constants/tools.ts`.
- **New sprite animation**: Add pixel frame to `sprite-data.ts`, reference in `AgentSprite`.
- **New server event**: Emit from `AgentStateManager`, forward in `Broadcaster`, add to `ServerMessage` union type, handle in client `StateStore`.
