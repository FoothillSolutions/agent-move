<div align="center">

# AgentMove

**Watch your AI coding agents come alive.**

A real-time pixel-art visualizer that turns AI coding sessions into a living 2D world. Agents walk between rooms, use tools, chat, and rest — all rendered at 60fps in your browser.

```
npx agent-move
```

<br>

<img src=".github/screenshot.png" alt="AgentMove screenshot showing pixel-art agents in a 2D world with 9 activity zones" width="800">

<br>
<br>

[![npm version](https://img.shields.io/npm/v/agent-move)](https://www.npmjs.com/package/agent-move)
[![license](https://img.shields.io/npm/l/agent-move)](LICENSE)

</div>

---

## What You're Looking At

AgentMove reads AI coding agent session files (`~/.claude/projects/**/*.jsonl`) and maps every tool call to one of **9 activity zones**. Each agent gets a unique pixel-art character that physically walks between zones as it works.

| Zone | What Happens There | Tools |
|------|--------------------|-------|
| **Files** | Reading, writing, editing code | Read, Write, Edit, Glob |
| **Terminal** | Running shell commands | Bash |
| **Search** | Searching code and the web | Grep, WebSearch |
| **Web** | Browsing, fetching, MCP tools | WebFetch, Playwright, MCP `*` |
| **Thinking** | Planning and asking questions | EnterPlanMode, AskUserQuestion |
| **Messaging** | Talking to other agents | SendMessage |
| **Tasks** | Managing work items | TaskCreate, TaskUpdate |
| **Spawn** | Agents arriving and departing | Agent, TeamCreate |
| **Idle** | Resting after 15s of inactivity | — |

## Getting Started

### Prerequisites

- **Node.js 18+**
- **Claude Code** installed and used at least once (so `~/.claude/` exists)

### One Command

```bash
npx agent-move
```

That's it. The server starts, your browser opens, and any active coding session is visualized immediately.

### Options

```bash
npx agent-move --port 4000    # custom port (default: 3333)
```

### From Source (for development)

```bash
git clone https://github.com/AbdullahSAhmad/agent-move.git
cd agent-move
npm install
npm run dev
```

This starts the server on `:3333` and the Vite dev server on `:5173` with hot reload.

## Features

- **Programmatic pixel-art sprites** — 16x16 characters rendered at 3x scale, no external image assets
- **12 color palettes** — each agent gets a distinct look
- **Animations** — idle breathing, walking between zones, working effects
- **Role badges** — MAIN, SUB, LEAD, MEMBER based on session type
- **Speech bubbles** — show the current tool or text output above each agent
- **Relationship lines** — dashed connections between parent/child and team agents
- **Zone glow** — rooms light up when agents are inside
- **Particle effects** — sparkles on tool use
- **Pan & zoom** — scroll and drag to navigate the world
- **Sidebar** — live agent list with zone, current tool, and token counts
- **Auto-reconnect** — WebSocket reconnects with exponential backoff if the connection drops

## How It Works

```
AI agent writes JSONL session files
  → chokidar detects file changes
  → Only new bytes are read (byte-offset tracking)
  → JSONL parsed for tool_use / text / token_usage blocks
  → AgentStateManager updates state machine + emits events
  → Broadcaster pushes over WebSocket
  → Client StateStore receives + emits
  → AgentManager creates/moves/animates sprites
  → Pixi.js renders at 60fps
```

## Architecture

Three-package monorepo (npm workspaces):

```
agent-move/
├── bin/cli.js              # npx entry point
├── packages/
│   ├── shared/             # Types & constants (zero dependencies)
│   │   └── src/
│   │       ├── types/          AgentState, ZoneConfig, ServerMessage, JSONL
│   │       └── constants/      tool→zone map, zone configs, color palettes
│   ├── server/             # Fastify backend
│   │   └── src/
│   │       ├── watcher/        chokidar file watcher, JSONL parser
│   │       ├── state/          agent state machine with idle timers
│   │       ├── ws/             WebSocket broadcaster
│   │       └── routes/         REST API
│   └── client/             # Pixi.js frontend
│       └── src/
│           ├── sprites/        pixel-art data, palette resolver, textures
│           ├── world/          zone renderer, grid, camera
│           ├── agents/         sprite logic, movement, relationships
│           ├── effects/        particles, zone glow
│           ├── connection/     WebSocket client, state store
│           └── ui/             HTML overlay sidebar
```

## API

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check |
| `GET /api/state` | All agent states as JSON |
| `WS /ws` | Real-time agent event stream |

The WebSocket sends a `full_state` snapshot on connect, then incremental events: `agent:spawn`, `agent:update`, `agent:idle`, `agent:shutdown`.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Renderer | [Pixi.js](https://pixijs.com/) v8 (WebGL) |
| Server | [Fastify](https://fastify.dev/) + [@fastify/websocket](https://github.com/fastify/fastify-websocket) |
| File watching | [chokidar](https://github.com/paulmillr/chokidar) v3 |
| Client build | [Vite](https://vite.dev/) |
| Language | TypeScript (strict, ES modules) |

## License

MIT
