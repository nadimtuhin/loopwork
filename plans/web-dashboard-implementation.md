# Web UI Dashboard Implementation Plan

## Overview

Restructure Loopwork into a **monorepo architecture** with all plugins as separate packages, and add a modern web-based dashboard.

**Architecture**: Monorepo with Bun workspaces
**Packages**:
- `loopwork` - Core CLI and framework
- `@loopwork-ai/dashboard` - Web UI dashboard plugin
- `@loopwork-ai/telegram` - Telegram notifications & bot
- `@loopwork-ai/discord` - Discord webhook notifications
- `@loopwork-ai/asana` - Asana integration
- `@loopwork-ai/everhour` - Time tracking integration
- `@loopwork-ai/todoist` - Todoist task sync
- `@loopwork-ai/cost-tracking` - Token usage & cost monitoring

**Benefits**:
- Independent versioning per plugin
- Opt-in dependencies (install only what you need)
- Easier community contributions (focused PRs)
- Clearer separation of concerns
- Smaller core package size

---

## Architecture

### High-Level Design

```
Browser (http://localhost:3333)
    ↓ HTTP + SSE
Web Dashboard Plugin (Bun HTTP Server)
    ├─ REST API (/api/*)
    ├─ SSE Broadcaster (/api/events)
    └─ File Watchers (state + logs)
    ↓
Existing Loopwork Architecture
    ├─ Plugin Lifecycle Hooks
    ├─ TaskBackend (JSON/GitHub)
    └─ StateManager (file-based)
```

### Why SSE (Server-Sent Events)?

- **Simpler than WebSocket**: One-way server→client streaming (perfect for status updates)
- **Auto-reconnect**: Browser handles reconnection automatically
- **Bun-optimized**: Excellent SSE performance in Bun runtime
- **No authentication complexity**: Local-first (localhost only for MVP)

---

## Phased Implementation

### Phase 1: MVP - Real-Time Task Monitoring (Week 1-2)

**Goal**: Prove the concept with minimal viable dashboard

**Features**:
- Task list view with real-time status updates
- Basic stats (pending/in-progress/completed/failed counts)
- SSE event stream for live updates
- Namespace selector (for multi-loop support)

**Components**:
1. **Backend Plugin** (`src/plugins/web-dashboard/`)
   - Bun HTTP server on port 3333
   - SSE broadcaster for real-time events
   - File watcher for `.loopwork-state*` files
   - Plugin lifecycle integration

2. **API Endpoints** (Read-only)
   - `GET /api/status` - Server health
   - `GET /api/namespaces` - List active namespaces
   - `GET /api/namespaces/:ns/tasks` - Get tasks + stats
   - `GET /api/events` - SSE stream (task updates)

3. **Frontend App** (`web/`)
   - Next.js 14 App Router
   - Task list with auto-refresh via SSE
   - Stats panel (counts + progress bar)
   - Namespace switcher

**Deliverables**:
- Working dashboard at localhost:3333
- Real-time task status updates
- Multi-namespace support
- Mobile-responsive design

---

### Phase 2: Task Controls (Week 3)

**Goal**: Enable manual task management from web UI

**Features**:
- Mark task complete button
- Retry failed tasks
- Mark task as failed
- Confirmation dialogs for destructive actions

**New Components**:
1. **API Endpoints** (Write operations)
   - `POST /api/tasks/:id/mark-complete`
   - `POST /api/tasks/:id/mark-failed`
   - `POST /api/tasks/:id/retry` (reset to pending)

2. **Frontend Components**
   - Task action buttons
   - Confirmation modals
   - Optimistic UI updates

---

### Phase 3: Live Log Streaming (Week 4)

**Goal**: Watch AI execution logs in real-time

**Features**:
- Live log viewer with auto-scroll
- Log filtering by level (info/error/warn)
- Log search
- Download logs as file

**New Components**:
1. **API Endpoints**
   - `GET /api/logs/:namespace` - Recent logs (last 1000 lines)
   - `GET /api/logs/:namespace/stream` - SSE log stream
   - `GET /api/logs/:namespace/download` - Download full log

2. **Frontend Components**
   - LiveLogs component with virtual scrolling
   - Log level filter dropdown
   - Search bar
   - Auto-scroll toggle

3. **Backend Enhancement**
   - File watcher for `loopwork-runs/*/monitor-logs/*.log`
   - Log parser for structured output
   - Broadcast log updates via SSE

---

### Phase 4: Cost & Time Analytics (Week 5)

**Goal**: Visualize spending and performance trends

**Features**:
- Daily cost breakdown chart
- Task completion time histogram
- Cost per task analysis
- Budget alerts

**New Components**:
1. **API Endpoints**
   - `GET /api/costs/:namespace` - Cost tracking data
   - `GET /api/analytics/:namespace` - Time metrics

2. **Frontend Components**
   - Cost chart (Recharts area chart)
   - Time distribution chart
   - Budget progress bar
   - Cost analytics dashboard page

3. **Integration**
   - Read from existing `.loopwork-cost-tracking*.json` files
   - Parse task duration from logs

---

## Monorepo Structure

```
loopwork/                              # MONOREPO ROOT
├── packages/
│   ├── loopwork/                      # Core package
│   │   ├── src/
│   │   │   ├── commands/              # CLI commands
│   │   │   ├── core/                  # Core logic (cli, state, config)
│   │   │   ├── backends/              # JSON & GitHub backends
│   │   │   ├── monitor/               # Background process manager
│   │   │   ├── dashboard/             # TUI dashboard (keep in core)
│   │   │   ├── mcp/                   # MCP server
│   │   │   ├── contracts/             # Exported interfaces
│   │   │   │   ├── plugin.ts
│   │   │   │   ├── backend.ts
│   │   │   │   ├── task.ts
│   │   │   │   └── config.ts
│   │   │   └── index.ts
│   │   ├── bin/
│   │   ├── test/
│   │   ├── package.json               # name: "loopwork"
│   │   └── README.md
│   │
│   ├── dashboard/                     # Web UI Dashboard
│   │   ├── src/
│   │   │   ├── plugin/
│   │   │   │   ├── index.ts           # Plugin implementation
│   │   │   │   ├── server.ts          # Bun HTTP server
│   │   │   │   ├── routes.ts          # API handlers
│   │   │   │   ├── broadcaster.ts     # SSE broadcaster
│   │   │   │   ├── file-watcher.ts    # File watching
│   │   │   │   └── types.ts           # TypeScript types
│   │   │   └── index.ts               # Package entry
│   │   │
│   │   ├── web/                       # Next.js app
│   │   │   ├── app/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx
│   │   │   │   ├── namespaces/[id]/page.tsx
│   │   │   │   ├── tasks/[id]/page.tsx
│   │   │   │   ├── costs/page.tsx
│   │   │   │   └── logs/page.tsx
│   │   │   ├── components/
│   │   │   │   ├── TaskList.tsx
│   │   │   │   ├── TaskCard.tsx
│   │   │   │   ├── StatsPanel.tsx
│   │   │   │   ├── NamespaceSelector.tsx
│   │   │   │   ├── EventStream.tsx
│   │   │   │   ├── TaskActions.tsx
│   │   │   │   ├── LiveLogs.tsx
│   │   │   │   └── CostChart.tsx
│   │   │   ├── lib/
│   │   │   │   ├── api.ts
│   │   │   │   ├── sse.ts
│   │   │   │   ├── store.ts
│   │   │   │   └── types.ts
│   │   │   ├── package.json
│   │   │   └── next.config.js
│   │   │
│   │   ├── dist/                      # Compiled output
│   │   ├── package.json               # name: "@loopwork-ai/dashboard"
│   │   ├── tsconfig.json
│   │   └── README.md
│   │
│   ├── telegram/                      # Telegram notifications & bot
│   │   ├── src/
│   │   │   ├── notifications.ts       # Notification plugin
│   │   │   ├── bot.ts                 # Interactive bot
│   │   │   ├── index.ts               # Package entry
│   │   │   └── types.ts               # Shared types
│   │   ├── dist/
│   │   ├── package.json               # name: "@loopwork-ai/telegram"
│   │   ├── tsconfig.json
│   │   └── README.md
│   │
│   ├── discord/                       # Discord webhook notifications
│   │   ├── src/
│   │   │   ├── index.ts               # Main plugin + client
│   │   │   └── types.ts               # TypeScript types
│   │   ├── dist/
│   │   ├── package.json               # name: "@loopwork-ai/discord"
│   │   ├── tsconfig.json
│   │   └── README.md
│   │
│   ├── asana/                         # Asana integration
│   │   ├── src/
│   │   │   ├── index.ts               # Main plugin + client
│   │   │   └── types.ts               # TypeScript types
│   │   ├── dist/
│   │   ├── package.json               # name: "@loopwork-ai/asana"
│   │   ├── tsconfig.json
│   │   └── README.md
│   │
│   ├── everhour/                      # Time tracking integration
│   │   ├── src/
│   │   │   ├── index.ts               # Main plugin + client
│   │   │   └── types.ts               # TypeScript types
│   │   ├── dist/
│   │   ├── package.json               # name: "@loopwork-ai/everhour"
│   │   ├── tsconfig.json
│   │   └── README.md
│   │
│   ├── todoist/                       # Todoist task sync
│   │   ├── src/
│   │   │   ├── index.ts               # Main plugin + client
│   │   │   └── types.ts               # TypeScript types
│   │   ├── dist/
│   │   ├── package.json               # name: "@loopwork-ai/todoist"
│   │   ├── tsconfig.json
│   │   └── README.md
│   │
│   ├── cost-tracking/                 # Token usage & cost monitoring
│   │   ├── src/
│   │   │   ├── index.ts               # Main plugin + tracker
│   │   │   └── types.ts               # TypeScript types
│   │   ├── dist/
│   │   ├── package.json               # name: "@loopwork-ai/cost-tracking"
│   │   ├── tsconfig.json
│   │   └── README.md
│
├── examples/                          # Shared examples (existing)
├── docs/                              # Shared documentation
├── package.json                       # Root workspace config
├── bun.lockb                          # Lockfile for all packages
├── tsconfig.base.json                 # Shared TypeScript config
├── .gitignore
└── README.md                          # Main README
```

---

## Critical Files to Create/Modify

### Monorepo Root (New/Modified)

**New Files**:
1. `package.json` - Workspace configuration
2. `tsconfig.base.json` - Shared TypeScript config
3. `packages/` - Directory for all packages

**Modified Files**:
- `README.md` - Update for monorepo structure
- `.gitignore` - Add workspace-specific ignores

### Extracted Packages (From src/plugins/)

**New Packages**:
1. `packages/telegram/` - Move from `src/plugins/telegram/`
   - `src/notifications.ts` - Notification plugin
   - `src/bot.ts` - Interactive bot
   - `src/index.ts` - Package entry (NEW - exports both)
   - `src/types.ts` - Shared types (NEW)
   - `package.json` - Package metadata (NEW)
   - `tsconfig.json` - TypeScript config (NEW)
   - `README.md` - Plugin documentation (NEW)

2. `packages/discord/` - Move from `src/plugins/discord.ts`
   - `src/index.ts` - Renamed from discord.ts
   - `package.json` - Package metadata (NEW)
   - `tsconfig.json` - TypeScript config (NEW)
   - `README.md` - Plugin documentation (NEW)

3. `packages/asana/` - Move from `src/plugins/asana.ts`
   - `src/index.ts` - Renamed from asana.ts
   - `package.json` - Package metadata (NEW)
   - `tsconfig.json` - TypeScript config (NEW)
   - `README.md` - Plugin documentation (NEW)

4. `packages/everhour/` - Move from `src/plugins/everhour.ts`
   - `src/index.ts` - Renamed from everhour.ts
   - `package.json` - Package metadata (NEW)
   - `tsconfig.json` - TypeScript config (NEW)
   - `README.md` - Plugin documentation (NEW)

5. `packages/todoist/` - Move from `src/plugins/todoist.ts`
   - `src/index.ts` - Renamed from todoist.ts
   - `package.json` - Package metadata (NEW)
   - `tsconfig.json` - TypeScript config (NEW)
   - `README.md` - Plugin documentation (NEW)

6. `packages/cost-tracking/` - Move from `src/plugins/cost-tracking.ts`
   - `src/index.ts` - Renamed from cost-tracking.ts
   - `package.json` - Package metadata (NEW)
   - `tsconfig.json` - TypeScript config (NEW)
   - `README.md` - Plugin documentation (NEW)

### New Package: `packages/dashboard/`

**Phase 1 (MVP) - All New Files**:

1. **Plugin Core** (`src/plugin/`):
   - `index.ts` - Main plugin implementing LoopworkPlugin
   - `server.ts` - Bun HTTP server
   - `routes.ts` - API handlers
   - `broadcaster.ts` - SSE broadcaster
   - `file-watcher.ts` - File watching
   - `types.ts` - TypeScript types

2. **Package Entry** (`src/index.ts`):
   - Exports plugin creation function
   - Exports types for consumers

3. **Frontend App** (`web/`):
   - Complete Next.js application
   - All components, pages, utilities

4. **Build Config**:
   - `package.json` - Package metadata
   - `tsconfig.json` - Extends base config
   - `README.md` - Dashboard docs

### Existing Package: `packages/loopwork/` (Significant Changes)

**Files to Modify**:

1. **`src/plugins/index.ts`** (Major cleanup)
   - **Remove**: All plugin config wrappers (`withTelegram`, `withDiscord`, `withAsana`, `withEverhour`, `withTodoist`, `withCostTracking`)
   - **Keep**: Core helpers only
     - `defineConfig`, `defineConfigAsync`
     - `compose`, `withPlugin`
     - `PluginRegistry` class
     - Backend wrappers (`withGitHub`, `withJSON`)
   - **Update**: Remove plugin imports at top of file

2. **`src/contracts/config.ts`**
   - **Remove**: Plugin-specific config type definitions (these move to individual packages)
     - `TelegramConfig`, `DiscordConfig`, `AsanaConfig`, `EverhourConfig`, `TodoistConfig`, `CostTrackingConfig`
   - **Keep**: Core config types only
     - `LoopworkConfig`, `BackendConfig`, `PluginConfig`

3. **`src/contracts/index.ts`**
   - **Add**: Export plugin/backend interfaces for use by plugins
   - **Update**: Remove plugin-specific config types

4. **`package.json`**
   - **Update**: Exports field to include contracts
   - **Update**: Remove any plugin-specific dependencies

5. **`README.md`**
   - **Update**: Add links to all plugin packages
   - **Update**: Installation instructions to show opt-in plugin installation
   - **Add**: Migration guide for existing users

**Example of cleaned `src/plugins/index.ts`:**

```typescript
/**
 * Plugin System (Core Only)
 *
 * Plugin implementations moved to separate packages:
 * - @loopwork-ai/telegram
 * - @loopwork-ai/discord
 * - @loopwork-ai/asana
 * - @loopwork-ai/everhour
 * - @loopwork-ai/todoist
 * - @loopwork-ai/cost-tracking
 * - @loopwork-ai/dashboard
 */

import type {
  LoopworkConfig,
  LoopworkPlugin,
  ConfigWrapper,
} from '../contracts'
import { DEFAULT_CONFIG } from '../contracts'

// ============================================================================
// Config Helpers
// ============================================================================

export function defineConfig(config: LoopworkConfig): LoopworkConfig {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    plugins: config.plugins || [],
  }
}

export function defineConfigAsync(
  fn: () => Promise<LoopworkConfig> | LoopworkConfig
): () => Promise<LoopworkConfig> {
  return async () => {
    const config = await fn()
    return defineConfig(config)
  }
}

export function compose(...wrappers: ConfigWrapper[]): ConfigWrapper {
  return (config) => wrappers.reduce((cfg, wrapper) => wrapper(cfg), config)
}

// ============================================================================
// Plugin Wrappers
// ============================================================================

export function withPlugin(plugin: LoopworkPlugin): ConfigWrapper {
  return (config) => ({
    ...config,
    plugins: [...(config.plugins || []), plugin],
  })
}

// ============================================================================
// Backend Wrappers (stay in core)
// ============================================================================

export function withGitHub(options: { repo?: string } = {}): ConfigWrapper {
  return (config) => ({
    ...config,
    backend: {
      type: 'github',
      repo: options.repo,
    },
  })
}

export function withJSON(options: { tasksFile?: string; tasksDir?: string } = {}): ConfigWrapper {
  return (config) => ({
    ...config,
    backend: {
      type: 'json',
      tasksFile: options.tasksFile || '.specs/tasks/tasks.json',
      tasksDir: options.tasksDir,
    },
  })
}

// ============================================================================
// Plugin Registry
// ============================================================================

class PluginRegistry {
  // ... (unchanged)
}

export const plugins = new PluginRegistry()

// ============================================================================
// Re-exports
// ============================================================================

export type { LoopworkPlugin, ConfigWrapper } from '../contracts'
export { DEFAULT_CONFIG as defaults } from '../contracts'
```

---

## API Design

### REST Endpoints (Phase 1)

**GET /api/status**
```json
{
  "ok": true,
  "version": "0.3.0",
  "namespaces": ["default", "feature-auth"],
  "activeLoops": 2
}
```

**GET /api/namespaces**
```json
{
  "namespaces": [
    {
      "id": "default",
      "isActive": true,
      "lastActivity": "2026-01-25T12:00:00Z",
      "stats": {
        "pending": 5,
        "inProgress": 1,
        "completed": 10,
        "failed": 2
      }
    }
  ]
}
```

**GET /api/namespaces/:ns/tasks**
```json
{
  "namespace": "default",
  "tasks": [
    {
      "id": "TASK-001",
      "title": "Implement user authentication",
      "status": "in-progress",
      "priority": "high",
      "feature": "auth",
      "startedAt": "2026-01-25T12:00:00Z"
    }
  ],
  "stats": {
    "pending": 5,
    "inProgress": 1,
    "completed": 10,
    "failed": 2
  }
}
```

### SSE Event Stream

**GET /api/events**

Event types:
- `loop_start` - Loop execution started
- `task_start` - Task execution began
- `task_complete` - Task succeeded
- `task_failed` - Task failed
- `loop_end` - Loop finished
- `state_update` - State file changed

Example events:
```
event: task_start
data: {"namespace":"default","task":{"id":"TASK-001","title":"Implement auth"}}

event: task_complete
data: {"namespace":"default","task":{"id":"TASK-001"},"duration":45.2}

event: state_update
data: {"namespace":"default","state":{"lastIssue":1,"lastIteration":3}}
```

---

## Integration with Existing Code

### Plugin System Integration

**No changes to core plugin interface** - Web dashboard implements existing `LoopworkPlugin`:

```typescript
// src/plugins/web-dashboard.ts
export function createWebDashboardPlugin(config?: {
  port?: number
  host?: string
  enabled?: boolean
}): LoopworkPlugin {
  const server = new DashboardServer(config)

  return {
    name: 'web-dashboard',

    async onConfigLoad(loopworkConfig) {
      if (config?.enabled !== false) {
        await server.start()
      }
      return loopworkConfig
    },

    async onLoopStart(namespace) {
      server.broadcast({ type: 'loop_start', namespace })
    },

    async onTaskStart(task) {
      server.broadcast({ type: 'task_start', data: task })
    },

    async onTaskComplete(task, result) {
      server.broadcast({ type: 'task_complete', data: { task, result } })
    },

    async onTaskFailed(task, error) {
      server.broadcast({ type: 'task_failed', data: { task, error } })
    },

    async onLoopEnd(stats) {
      server.broadcast({ type: 'loop_end', data: stats })
      await server.stop()
    }
  }
}
```

**Installation & Usage**:

```bash
# Install core
bun add loopwork

# Install plugins you need (opt-in)
bun add @loopwork-ai/dashboard
bun add @loopwork-ai/telegram
bun add @loopwork-ai/cost-tracking
```

```typescript
// loopwork.config.ts
import { compose, defineConfig } from 'loopwork'
import { withJSONBackend } from 'loopwork'
import { withDashboard } from '@loopwork-ai/dashboard'
import { withTelegram } from '@loopwork-ai/telegram'
import { withCostTracking } from '@loopwork-ai/cost-tracking'

export default compose(
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),
  withDashboard({ port: 3333 }),
  withTelegram({
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID
  }),
  withCostTracking({ dailyBudget: 10.00 })
)(defineConfig({
  cli: 'claude',
  maxIterations: 50
}))
```

### Backend Abstraction

Web API uses loopwork's exported `TaskBackend` interface:

```typescript
// loopwork-dashboard/src/plugin/routes.ts
import type { TaskBackend } from 'loopwork'  // Import from main package

async function getTasks(backend: TaskBackend, namespace: string) {
  const tasks = await backend.listPendingTasks()
  const stats = await backend.countPending()
  return { tasks, stats }
}
```

**Dependency**: `loopwork-dashboard` has `loopwork` as a peer dependency, importing only types and contracts.

---

## Configuration

### Environment Variables

```bash
# Enable web dashboard
LOOPWORK_DASHBOARD_ENABLED=true

# Server settings
LOOPWORK_DASHBOARD_PORT=3333
LOOPWORK_DASHBOARD_HOST=localhost  # Change to 0.0.0.0 for network access

# Auto-open browser on start
LOOPWORK_DASHBOARD_AUTO_OPEN=true
```

### Config File

```typescript
// loopwork.config.ts
export default {
  // ... existing config ...

  dashboard: {
    enabled: true,
    port: 3333,
    host: 'localhost',
    autoOpen: true,
  }
}
```

---

## Development Workflow

### Setup

```bash
# Install dependencies
bun install

# Setup web dashboard
cd web
bun install
cd ..

# Start development servers (in parallel)
bun run dev:all  # Runs loopwork + web dev server
```

### Scripts to Add

```json
// package.json
{
  "scripts": {
    "dev:web": "cd web && bun run dev",
    "dev:loopwork": "bun run src/index.ts",
    "dev:all": "concurrently \"bun run dev:loopwork\" \"bun run dev:web\"",
    "build:web": "cd web && bun run build",
    "start:web": "cd web && bun run start"
  }
}
```

---

## Verification & Testing

### Phase 1 Testing

**Manual Verification**:
1. Start loopwork with dashboard enabled: `bun run src/index.ts`
2. Open browser to `http://localhost:3333`
3. Verify task list loads
4. Start a task manually via CLI
5. Verify real-time update appears in dashboard
6. Switch namespaces in UI
7. Verify stats update correctly

**Automated Tests**:
1. **Unit Tests** (`src/plugins/web-dashboard/*.test.ts`):
   - SSE broadcaster add/remove clients
   - File watcher triggers events
   - API route handlers return correct data

2. **Integration Tests** (`test/web-dashboard.test.ts`):
   - Plugin lifecycle hooks fire events
   - Backend integration (read tasks)
   - State file watching

3. **E2E Tests** (`web/e2e/dashboard.spec.ts` with Playwright):
   - Dashboard loads at localhost:3333
   - Task list renders
   - SSE connection establishes
   - Real-time updates appear
   - Namespace switcher works

### Performance Targets

- **Initial page load**: < 1 second
- **SSE connection time**: < 200ms
- **Event latency**: < 100ms (file write → UI update)
- **Concurrent clients**: Support 100+ simultaneous connections
- **Memory usage**: < 100MB for web server

---

## Security Considerations

### Phase 1 (MVP - Local Only)
- Bind to `localhost` only (no external access)
- No authentication required
- CORS disabled (same-origin only)
- Read-only API (write endpoints in Phase 2)

### Future Phases
- Token-based authentication (Phase 2+)
- HTTPS support (Phase 3+)
- Rate limiting on write endpoints
- Audit logging for task actions

---

## Migration & Rollback

### Enabling Dashboard

**Option 1: Config file**
```typescript
// loopwork.config.ts
export default compose(
  withWebDashboard({ enabled: true })
)(defineConfig({ ... }))
```

**Option 2: Environment variable**
```bash
LOOPWORK_DASHBOARD_ENABLED=true bun run src/index.ts
```

**Option 3: CLI flag**
```bash
bun run src/index.ts --dashboard
```

### Disabling Dashboard

Set `enabled: false` or remove plugin from config - existing functionality unaffected.

### No Breaking Changes

- Dashboard is opt-in via plugin
- Zero impact on existing CLI workflows
- Can run with or without dashboard
- TUI dashboard continues to work independently

---

## Success Metrics

### MVP (Phase 1)
- [ ] Dashboard loads in < 1 second
- [ ] Real-time updates within 100ms
- [ ] All task statuses visible
- [ ] Multi-namespace support works
- [ ] Mobile-responsive design

### Phase 2 (Task Controls)
- [ ] Actions execute successfully
- [ ] Optimistic UI updates
- [ ] Error handling with user feedback
- [ ] Undo functionality for mistakes

### Phase 3 (Logs)
- [ ] Logs stream in real-time
- [ ] Log search works correctly
- [ ] Virtual scrolling for 10,000+ lines
- [ ] Download logs feature

### Phase 4 (Analytics)
- [ ] Cost charts render accurately
- [ ] Time metrics calculated correctly
- [ ] Budget alerts trigger appropriately
- [ ] Export data to CSV

---

## Timeline Estimate

| Phase | Duration | Features | Status |
|-------|----------|----------|--------|
| Phase 1 | 2 weeks | MVP - Real-time task monitoring | Ready to implement |
| Phase 2 | 1 week | Task controls | After Phase 1 |
| Phase 3 | 1 week | Live log streaming | After Phase 2 |
| Phase 4 | 1 week | Cost & time analytics | After Phase 3 |
| **Total** | **5 weeks** | **Full dashboard** | Phased rollout |

---

## Package Configuration

### Root package.json (Workspace Manager)

```json
{
  "name": "loopwork-monorepo",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "build": "bun run --filter './packages/*' build",
    "test": "bun run --filter './packages/*' test",
    "dev:loopwork": "bun --cwd packages/loopwork run dev",
    "dev:dashboard": "bun --cwd packages/dashboard run dev",
    "dev:web": "bun --cwd packages/dashboard run dev:web",
    "publish:all": "bun run build && bun run --filter './packages/*' publish"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  }
}
```

### packages/dashboard/package.json

```json
{
  "name": "@loopwork-ai/dashboard",
  "version": "0.1.0",
  "description": "Web UI dashboard plugin for Loopwork",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": [
    "dist/",
    "web/",
    "README.md"
  ],
  "scripts": {
    "build": "tsup src/index.ts --format esm,cjs --dts",
    "dev": "tsup src/index.ts --format esm,cjs --dts --watch",
    "dev:web": "cd web && bun run dev",
    "build:web": "cd web && bun run build",
    "prepublishOnly": "bun run build && bun run build:web"
  },
  "peerDependencies": {
    "loopwork": "workspace:*"
  },
  "dependencies": {
    "chokidar": "^3.5.3"
  },
  "devDependencies": {
    "loopwork": "workspace:*",
    "tsup": "^8.0.0"
  },
  "keywords": [
    "loopwork",
    "dashboard",
    "plugin",
    "ui",
    "monitoring"
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/nadimtuhin/loopwork.git",
    "directory": "packages/dashboard"
  }
}
```

### packages/loopwork/package.json (Modified)

```json
{
  "name": "loopwork",
  "version": "0.3.0",
  "exports": {
    ".": "./dist/index.js",
    "./contracts": "./dist/contracts/index.js"
  }
}
```

### packages/telegram/package.json

```json
{
  "name": "@loopwork-ai/telegram",
  "version": "0.1.0",
  "description": "Telegram notifications & bot plugin for Loopwork",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist/", "README.md"],
  "scripts": {
    "build": "tsup src/index.ts --format esm,cjs --dts",
    "dev": "tsup src/index.ts --format esm,cjs --dts --watch"
  },
  "peerDependencies": {
    "loopwork": "workspace:*"
  },
  "devDependencies": {
    "loopwork": "workspace:*",
    "tsup": "^8.0.0"
  },
  "keywords": ["loopwork", "telegram", "notifications", "bot", "plugin"]
}
```

### packages/discord/package.json

```json
{
  "name": "@loopwork-ai/discord",
  "version": "0.1.0",
  "description": "Discord webhook notifications plugin for Loopwork",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist/", "README.md"],
  "scripts": {
    "build": "tsup src/index.ts --format esm,cjs --dts",
    "dev": "tsup src/index.ts --format esm,cjs --dts --watch"
  },
  "peerDependencies": {
    "loopwork": "workspace:*"
  },
  "devDependencies": {
    "loopwork": "workspace:*",
    "tsup": "^8.0.0"
  },
  "keywords": ["loopwork", "discord", "notifications", "webhooks", "plugin"]
}
```

### packages/asana/package.json

```json
{
  "name": "@loopwork-ai/asana",
  "version": "0.1.0",
  "description": "Asana integration plugin for Loopwork",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist/", "README.md"],
  "scripts": {
    "build": "tsup src/index.ts --format esm,cjs --dts",
    "dev": "tsup src/index.ts --format esm,cjs --dts --watch"
  },
  "peerDependencies": {
    "loopwork": "workspace:*"
  },
  "devDependencies": {
    "loopwork": "workspace:*",
    "tsup": "^8.0.0"
  },
  "keywords": ["loopwork", "asana", "tasks", "integration", "plugin"]
}
```

### packages/everhour/package.json

```json
{
  "name": "@loopwork-ai/everhour",
  "version": "0.1.0",
  "description": "Everhour time tracking plugin for Loopwork",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist/", "README.md"],
  "scripts": {
    "build": "tsup src/index.ts --format esm,cjs --dts",
    "dev": "tsup src/index.ts --format esm,cjs --dts --watch"
  },
  "peerDependencies": {
    "loopwork": "workspace:*"
  },
  "devDependencies": {
    "loopwork": "workspace:*",
    "tsup": "^8.0.0"
  },
  "keywords": ["loopwork", "everhour", "time-tracking", "integration", "plugin"]
}
```

### packages/todoist/package.json

```json
{
  "name": "@loopwork-ai/todoist",
  "version": "0.1.0",
  "description": "Todoist task sync plugin for Loopwork",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist/", "README.md"],
  "scripts": {
    "build": "tsup src/index.ts --format esm,cjs --dts",
    "dev": "tsup src/index.ts --format esm,cjs --dts --watch"
  },
  "peerDependencies": {
    "loopwork": "workspace:*"
  },
  "devDependencies": {
    "loopwork": "workspace:*",
    "tsup": "^8.0.0"
  },
  "keywords": ["loopwork", "todoist", "tasks", "sync", "plugin"]
}
```

### packages/cost-tracking/package.json

```json
{
  "name": "@loopwork-ai/cost-tracking",
  "version": "0.1.0",
  "description": "Token usage & cost monitoring plugin for Loopwork",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist/", "README.md"],
  "scripts": {
    "build": "tsup src/index.ts --format esm,cjs --dts",
    "dev": "tsup src/index.ts --format esm,cjs --dts --watch"
  },
  "peerDependencies": {
    "loopwork": "workspace:*"
  },
  "devDependencies": {
    "loopwork": "workspace:*",
    "tsup": "^8.0.0"
  },
  "keywords": ["loopwork", "cost-tracking", "tokens", "monitoring", "plugin"]
}
```

### Package Exports

```typescript
// packages/dashboard/src/index.ts
export { createDashboardPlugin, withDashboard } from './plugin'
export type { DashboardConfig, DashboardEvent } from './plugin/types'

// packages/telegram/src/index.ts
export { createTelegramPlugin, createTelegramHookPlugin, withTelegram } from './notifications'
export { TelegramTaskBot } from './bot'
export type { TelegramConfig, NotificationPayload } from './notifications'

// packages/discord/src/index.ts
export { createDiscordPlugin, withDiscord, DiscordClient } from './discord'
export type { DiscordConfig } from './discord'

// packages/asana/src/index.ts
export { createAsanaPlugin, withAsana, AsanaClient } from './asana'
export type { AsanaConfig } from './asana'

// packages/everhour/src/index.ts
export { createEverhourPlugin, withEverhour, EverhourClient, asanaToEverhour } from './everhour'
export type { EverhourConfig } from './everhour'

// packages/todoist/src/index.ts
export { createTodoistPlugin, withTodoist, TodoistClient } from './todoist'
export type { TodoistConfig } from './todoist'

// packages/cost-tracking/src/index.ts
export {
  createCostTrackingPlugin,
  CostTracker,
  MODEL_PRICING,
  formatCost,
  formatTokens
} from './cost-tracking'
export type {
  CostTrackingConfig,
  TokenUsage,
  UsageEntry,
  UsageSummary
} from './cost-tracking'
```

---

## Monorepo Migration Steps

### 1. Restructure Existing Repository

```bash
# In loopwork root
mkdir -p packages
git mv src packages/loopwork/src
git mv test packages/loopwork/test
git mv package.json packages/loopwork/package.json
# ... move other loopwork files
```

### 2. Create Workspace Configuration

```bash
# Create root package.json with workspaces
cat > package.json << 'EOF'
{
  "name": "loopwork-monorepo",
  "private": true,
  "workspaces": ["packages/*"]
}
EOF
```

### 3. Extract Plugin Packages

```bash
# Create plugin package directories
mkdir -p packages/telegram/src
mkdir -p packages/discord/src
mkdir -p packages/asana/src
mkdir -p packages/everhour/src
mkdir -p packages/todoist/src
mkdir -p packages/cost-tracking/src

# Move telegram plugin (directory structure)
git mv src/plugins/telegram packages/telegram/src/
# Flatten structure: move notifications.ts and bot.ts to src/
mv packages/telegram/src/telegram/notifications.ts packages/telegram/src/
mv packages/telegram/src/telegram/bot.ts packages/telegram/src/
rmdir packages/telegram/src/telegram

# Move other plugins (single files)
git mv src/plugins/discord.ts packages/discord/src/index.ts
git mv src/plugins/asana.ts packages/asana/src/index.ts
git mv src/plugins/everhour.ts packages/everhour/src/index.ts
git mv src/plugins/todoist.ts packages/todoist/src/index.ts
git mv src/plugins/cost-tracking.ts packages/cost-tracking/src/index.ts

# Create package.json for each plugin
# (Use templates from Package Configuration section above)
```

**What to extract from src/plugins/index.ts:**
- Remove plugin config wrappers (`withTelegram`, `withDiscord`, etc.) - these move to individual packages
- Keep only core helpers: `defineConfig`, `defineConfigAsync`, `compose`, `withPlugin`, `PluginRegistry`
- Backends (`withGitHub`, `withJSON`) stay in core

### 4. Create Dashboard Package

```bash
mkdir -p packages/dashboard/src/plugin
mkdir -p packages/dashboard/web
```

### 5. Install Dependencies

```bash
# Root level (installs all workspace dependencies)
bun install

# Add plugin-specific deps (all plugins use tsup)
cd packages/dashboard && bun add chokidar && bun add -D tsup
cd ../telegram && bun add -D tsup
cd ../discord && bun add -D tsup
cd ../asana && bun add -D tsup
cd ../everhour && bun add -D tsup
cd ../todoist && bun add -D tsup
cd ../cost-tracking && bun add -D tsup
cd ../..
```

### 6. Setup Shared TypeScript Config

```bash
# Create tsconfig.base.json at root
cat > tsconfig.base.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  }
}
EOF
```

### 7. Create Plugin Entry Points

For each plugin package, create `src/index.ts` that exports all public APIs (see "Package Exports" section above).

For telegram, also create `src/types.ts` for shared types between notifications and bot.

### 8. Update Import Paths

After extracting plugins, update any files that import from the old paths:

```typescript
// OLD (monolithic)
import { withTelegram } from '../plugins'
import { withDiscord } from '../plugins'

// NEW (monorepo)
import { withTelegram } from '@loopwork-ai/telegram'
import { withDiscord } from '@loopwork-ai/discord'
```

**Files to update:**
- `packages/loopwork/src/plugins/index.ts` - Remove extracted plugin wrappers
- `packages/loopwork/src/contracts/config.ts` - May reference plugin types
- Example configs and tests

### 9. Create Plugin Core (Dashboard)

1. `packages/dashboard/src/plugin/index.ts`
2. `packages/dashboard/src/plugin/server.ts`
3. `packages/dashboard/src/plugin/broadcaster.ts`
4. `packages/dashboard/src/plugin/routes.ts`
5. `packages/dashboard/src/plugin/types.ts`

### 10. Setup Next.js App

```bash
cd packages/dashboard/web
bunx create-next-app@latest . --typescript --tailwind --app --no-src-dir
```

### 11. Build & Test

```bash
# From repo root
bun run build              # Builds all packages
bun run dev:loopwork       # Run loopwork
bun run dev:dashboard      # Run dashboard plugin dev
bun run dev:web            # Run Next.js dev server

# Test individual plugins
cd packages/telegram && bun run build
cd packages/discord && bun run build
# ... etc
```

### 12. Publish to npm

```bash
# Publish core first
cd packages/loopwork
npm publish

# Publish plugins
cd ../telegram && npm publish --access public
cd ../discord && npm publish --access public
cd ../asana && npm publish --access public
cd ../everhour && npm publish --access public
cd ../todoist && npm publish --access public
cd ../cost-tracking && npm publish --access public
cd ../dashboard && npm publish --access public
```

---

## Monorepo Setup Checklist

### Phase 1: Restructure
- [ ] Create `packages/` directory
- [ ] Move existing code to `packages/loopwork/`
- [ ] Create root `package.json` with workspaces
- [ ] Create `tsconfig.base.json`
- [ ] Update `.gitignore` for monorepo
- [ ] Test that existing `loopwork` still works

### Phase 2: Extract Plugin Packages
- [ ] Create plugin package directories (telegram, discord, asana, everhour, todoist, cost-tracking)
- [ ] Move `src/plugins/telegram/` to `packages/telegram/src/`
- [ ] Move `src/plugins/discord.ts` to `packages/discord/src/index.ts`
- [ ] Move `src/plugins/asana.ts` to `packages/asana/src/index.ts`
- [ ] Move `src/plugins/everhour.ts` to `packages/everhour/src/index.ts`
- [ ] Move `src/plugins/todoist.ts` to `packages/todoist/src/index.ts`
- [ ] Move `src/plugins/cost-tracking.ts` to `packages/cost-tracking/src/index.ts`
- [ ] Create `package.json` for each plugin package
- [ ] Create entry point `index.ts` for each plugin
- [ ] Update import paths in `packages/loopwork/src/plugins/index.ts`
- [ ] Remove plugin wrappers from core (keep only compose, defineConfig, etc.)
- [ ] Update contract types in `packages/loopwork/src/contracts/`
- [ ] Test that plugins still work locally

### Phase 3: Dashboard Package
- [ ] Create `packages/dashboard/` structure
- [ ] Setup package.json with workspace dependency
- [ ] Create plugin core (`src/plugin/`)
- [ ] Setup Next.js app (`web/`)
- [ ] Configure build scripts
- [ ] Write README

### Phase 4: Integration
- [ ] Export contracts from `loopwork` package
- [ ] Import contracts in all plugin packages
- [ ] Test local workspace linking for all packages
- [ ] Write integration tests
- [ ] Update main README
- [ ] Update example configs to use new import paths

### Phase 5: Build & Verify
- [ ] Build all packages successfully
- [ ] Test each plugin package individually
- [ ] Test dashboard package
- [ ] Verify all peer dependencies resolve correctly
- [ ] Run existing tests with new structure
- [ ] Update tests to import from new paths

### Phase 6: CI/CD
- [ ] Update GitHub Actions for monorepo
- [ ] Setup changesets or similar for versioning
- [ ] Configure separate publish workflows
- [ ] Test publishing all packages to npm
- [ ] Setup dependency update automation (Dependabot)

### Phase 7: Documentation
- [ ] Update main README for monorepo
- [ ] Document development workflow
- [ ] Add examples using plugin packages
- [ ] Create migration guide for users
- [ ] Document publishing process
- [ ] Add contributing guidelines for plugins
