# Web UI Dashboard Implementation Plan

## Overview

Build a modern web-based dashboard for Loopwork as a **separate package in a monorepo** using a **phased approach** - starting with an MVP for quick validation, then iteratively adding features based on user feedback.

**Architecture**: Monorepo with Bun workspaces
**Packages**:
- `loopwork` - Core CLI and framework (existing)
- `@loopwork/dashboard` - Web UI dashboard plugin (new)
**Tech Stack**: Next.js 14 + Bun HTTP Server + Server-Sent Events (SSE) + TailwindCSS
**Installation**: `bun add @loopwork/dashboard`
**Deployment Model**: Dashboard runs as a plugin, accessible at `http://localhost:3333`

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
│   ├── loopwork/                      # Core package (existing, moved)
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   ├── core/
│   │   │   ├── backends/
│   │   │   ├── plugins/
│   │   │   ├── contracts/             # Exported for dashboard
│   │   │   │   ├── plugin.ts
│   │   │   │   ├── backend.ts
│   │   │   │   └── task.ts
│   │   │   └── index.ts
│   │   ├── bin/
│   │   ├── test/
│   │   ├── package.json               # name: "loopwork"
│   │   ├── tsconfig.json
│   │   └── README.md
│   │
│   └── dashboard/                     # NEW PACKAGE
│       ├── src/
│       │   ├── plugin/
│       │   │   ├── index.ts           # Plugin implementation
│       │   │   ├── server.ts          # Bun HTTP server
│       │   │   ├── routes.ts          # API handlers
│       │   │   ├── broadcaster.ts     # SSE broadcaster
│       │   │   ├── file-watcher.ts    # File watching
│       │   │   └── types.ts           # TypeScript types
│       │   └── index.ts               # Package entry
│       │
│       ├── web/                       # Next.js app
│       │   ├── app/
│       │   │   ├── layout.tsx
│       │   │   ├── page.tsx
│       │   │   ├── namespaces/[id]/page.tsx
│       │   │   ├── tasks/[id]/page.tsx
│       │   │   ├── costs/page.tsx
│       │   │   └── logs/page.tsx
│       │   ├── components/
│       │   │   ├── TaskList.tsx
│       │   │   ├── TaskCard.tsx
│       │   │   ├── StatsPanel.tsx
│       │   │   ├── NamespaceSelector.tsx
│       │   │   ├── EventStream.tsx
│       │   │   ├── TaskActions.tsx
│       │   │   ├── LiveLogs.tsx
│       │   │   └── CostChart.tsx
│       │   ├── lib/
│       │   │   ├── api.ts
│       │   │   ├── sse.ts
│       │   │   ├── store.ts
│       │   │   └── types.ts
│       │   ├── package.json
│       │   └── next.config.js
│       │
│       ├── dist/                      # Compiled output
│       ├── package.json               # name: "@loopwork/dashboard"
│       ├── tsconfig.json
│       └── README.md
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

### Existing Package: `packages/loopwork/` (Minor Changes)

**Modified Files**:
- `src/contracts/index.ts` - Export plugin/backend interfaces
- `package.json` - May need to update exports
- `README.md` - Link to dashboard package

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
# Install both packages
bun add loopwork @loopwork/dashboard
```

```typescript
// loopwork.config.ts
import { compose, defineConfig } from 'loopwork'
import { withJSONBackend } from 'loopwork'
import { withDashboard } from '@loopwork/dashboard'  // ← Separate package in monorepo

export default compose(
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),
  withDashboard({ port: 3333, enabled: true })
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
  "name": "@loopwork/dashboard",
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

### Exports

```typescript
// packages/dashboard/src/index.ts
export { createDashboardPlugin, withDashboard } from './plugin'
export type { DashboardConfig, DashboardEvent } from './plugin/types'
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

### 3. Create Dashboard Package

```bash
mkdir -p packages/dashboard/src/plugin
mkdir -p packages/dashboard/web
```

### 4. Install Dependencies

```bash
# Root level (installs all workspace dependencies)
bun install

# Add dashboard-specific deps
cd packages/dashboard
bun add chokidar
bun add -D tsup
```

### 5. Setup Shared TypeScript Config

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

### 6. Create Plugin Core

1. `packages/dashboard/src/plugin/index.ts`
2. `packages/dashboard/src/plugin/server.ts`
3. `packages/dashboard/src/plugin/broadcaster.ts`
4. `packages/dashboard/src/plugin/routes.ts`
5. `packages/dashboard/src/plugin/types.ts`

### 7. Setup Next.js App

```bash
cd packages/dashboard/web
bunx create-next-app@latest . --typescript --tailwind --app --no-src-dir
```

### 8. Build & Test

```bash
# From repo root
bun run build              # Builds all packages
bun run dev:loopwork       # Run loopwork
bun run dev:dashboard      # Run dashboard plugin dev
bun run dev:web            # Run Next.js dev server
```

### 9. Publish to npm

```bash
# Publish individual packages
cd packages/loopwork
npm publish

cd ../dashboard
npm publish --access public  # For scoped @loopwork/dashboard
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

### Phase 2: Dashboard Package
- [ ] Create `packages/dashboard/` structure
- [ ] Setup package.json with workspace dependency
- [ ] Create plugin core (`src/plugin/`)
- [ ] Setup Next.js app (`web/`)
- [ ] Configure build scripts
- [ ] Write README

### Phase 3: Integration
- [ ] Export contracts from `loopwork` package
- [ ] Import contracts in dashboard
- [ ] Test local workspace linking
- [ ] Write integration tests
- [ ] Update main README

### Phase 4: CI/CD
- [ ] Update GitHub Actions for monorepo
- [ ] Setup changesets or similar for versioning
- [ ] Configure separate publish workflows
- [ ] Test publishing both packages

### Phase 5: Documentation
- [ ] Update main README for monorepo
- [ ] Document development workflow
- [ ] Add examples using both packages
- [ ] Create migration guide for users
