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

**@agent-move/shared** — Zero-dependency types and constants consumed by both server and client. Key exports: `AgentState`, `ZoneId`, `ServerMessage`, `TOOL_ZONE_MAP`, `ZONES`, `AGENT_PALETTES`, `getZoneForTool()`.

**@agent-move/server** — Fastify backend that watches `~/.claude/projects/**/*.jsonl` via chokidar. Uses byte-offset tracking to read only new content from session files. Parses JSONL lines for `tool_use`, `text`, and `token_usage` blocks from assistant messages. Maintains agent state machine (`AgentStateManager`) with 30s idle timeout. Broadcasts state changes over WebSocket to all connected clients.

**@agent-move/client** — Pixi.js v8 WebGL frontend. Connects to server via auto-reconnecting WebSocket. Renders 9 activity zones in a 3x3 grid (280px each). Agents are programmatic 16x16 pixel-art sprites rendered at 3x scale with idle/walk/working animations. `AgentManager` bridges the `StateStore` (event emitter) to `AgentSprite` instances, handling zone positioning, speech bubbles, particles, and relationship lines.

## Data Flow

```
JSONL file change → FileWatcher (byte-offset delta read) → JsonlParser
→ AgentStateManager (EventEmitter: spawn/update/idle/shutdown)
→ Broadcaster (WebSocket JSON) → WsClient → StateStore (EventEmitter)
→ AgentManager → AgentSprite (Pixi.js 60fps render)
```

## Key Patterns

- **Tool-to-zone mapping**: `getZoneForTool()` in `shared/src/constants/tools.ts` maps tool names to ZoneIds. All `mcp__*` tools default to `web` zone. Unknown tools default to `thinking`.
- **Sprite textures**: Generated programmatically from pixel arrays in `sprite-data.ts` using palette colors, cached by key in `sprite-factory.ts`. Uses `renderer.generateTexture({ target: g })` (Pixi v8 API — renderer param typed as `any` because the concrete type doesn't expose this method).
- **Agent positioning**: `AgentManager.getZonePosition()` distributes multiple agents within a zone using a grid layout to prevent name label overlap.
- **Session detection**: `claude-paths.ts` decodes encoded project directory names from `~/.claude/projects/` and detects subagents by path depth.
- **WebSocket protocol**: Server sends `full_state` on connect, then incremental `agent:spawn/update/idle/shutdown` events. Client auto-reconnects with exponential backoff (1s–10s).

## Extending

- **New zone**: Add entry to `ZONES` array in `shared/src/constants/zones.ts`, add tool mappings in `tools.ts`
- **New tool mapping**: Add to `TOOL_ZONE_MAP` in `shared/src/constants/tools.ts`
- **New sprite animation**: Add pixel frame to `sprite-data.ts`, reference in `AgentSprite`
- **New server event**: Emit from `AgentStateManager`, forward in `Broadcaster`, add to `ServerMessage` union type, handle in client `StateStore`
