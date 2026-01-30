# Dashboard Architecture

This document describes the architecture of the Loopwork Dashboard, which provides both a Terminal UI (TUI) and Web UI for monitoring task execution.

## Overview

The dashboard is designed with a **shared core** architecture, allowing both TUI and Web UI to use the same underlying data layer, types, and API client.

```
┌─────────────────────────────────────────────────────────────┐
│                    Shared Core                              │
│                  src/core/                                  │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  types.ts   │  │ api-client  │  │  state-manager.ts   │ │
│  │             │  │    .ts      │  │                     │ │
│  │ - Task      │  │             │  │ - subscribe()       │ │
│  │ - TaskStats │  │ - getTasks  │  │ - refresh()         │ │
│  │ - Dashboard │  │ - getStats  │  │ - startPolling()    │ │
│  │   State     │  │ - getCurrent│  │ - stopPolling()     │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└───────────────────────────┬─────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
┌───────────────────────┐     ┌───────────────────────┐
│    TUI Dashboard      │     │   Web UI Dashboard    │
│      src/tui/         │     │       web/            │
│                       │     │                       │
│  ┌─────────────────┐  │     │  ┌─────────────────┐  │
│  │   renderer.ts   │  │     │  │   lib/api.ts    │  │
│  │   (blessed)     │  │     │  │   lib/state.ts  │  │
│  └─────────────────┘  │     │  └─────────────────┘  │
│                       │     │                       │
│  ┌─────────────────┐  │     │  ┌─────────────────┐  │
│  │   components/   │  │     │  │   components/   │  │
│  │ - CurrentTask   │  │     │  │ - TaskStats     │  │
│  │ - StatsBox      │  │     │  │ - TaskQueue     │  │
│  │ - QueueBox      │  │     │  │ - TaskCard      │  │
│  │ - CompletedBox  │  │     │  └─────────────────┘  │
│  └─────────────────┘  │     │                       │
└───────────┬───────────┘     └───────────────────────┘
            │
            ▼
┌───────────────────────┐
│     CLI Command       │
│  loopwork dashboard   │
│                       │
│  --tui (default)      │
│  --web                │
│  --watch              │
│  --port <number>      │
└───────────────────────┘
```

## Package Structure

```
packages/dashboard/
├── src/
│   ├── core/                    # Shared core (framework-agnostic)
│   │   ├── types.ts             # TypeScript interfaces
│   │   ├── api-client.ts        # HTTP client for dashboard API
│   │   ├── state-manager.ts     # Observable state management
│   │   └── index.ts             # Barrel exports
│   │
│   ├── tui/                     # Terminal UI
│   │   ├── index.ts             # startTui() entry point
│   │   ├── renderer.ts          # Blessed screen renderer
│   │   ├── utils.ts             # Terminal formatting utilities
│   │   └── components/          # TUI components
│   │       ├── CurrentTaskBox.ts
│   │       ├── StatsBox.ts
│   │       ├── QueueBox.ts
│   │       └── CompletedBox.ts
│   │
│   ├── plugin/                  # Dashboard server plugin
│   │   ├── index.ts             # Plugin factory
│   │   ├── server.ts            # Bun HTTP server
│   │   ├── routes.ts            # API endpoints
│   │   ├── broadcaster.ts       # SSE event broadcaster
│   │   ├── file-watcher.ts      # State file watcher
│   │   └── types.ts             # Plugin types
│   │
│   └── index.ts                 # Main package exports
│
├── web/                         # Next.js Web UI
│   ├── app/                     # Next.js app router
│   │   └── page.tsx             # Main dashboard page
│   ├── components/              # React components
│   │   ├── TaskStatusCard.tsx
│   │   ├── TaskStats.tsx
│   │   ├── TaskQueue.tsx
│   │   ├── TaskCard.tsx
│   │   └── LogViewer.tsx
│   ├── hooks/                   # React hooks
│   │   ├── useDashboardStream.ts
│   │   ├── useTasks.ts
│   │   ├── useCurrentTask.ts
│   │   ├── useTaskQueue.ts
│   │   ├── useTaskStats.ts
│   │   └── useCompletedTasks.ts
│   └── lib/                     # Shared core integration
│       ├── api.ts
│       ├── state.ts
│       └── types.ts
│
├── test/                        # Tests
│   ├── tui.test.ts
│   └── routes.test.ts
│
└── docs/
    └── ARCHITECTURE.md          # This file
```

## Shared Core

The shared core is designed to be **framework-agnostic** - it has no dependencies on React, DOM, or terminal-specific APIs.

### Types (`src/core/types.ts`)

```typescript
interface Task {
  id: string;
  title: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  feature?: string;
  description?: string;
  startedAt?: string;
  completedAt?: string;
}

interface TaskStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  failed: number;
  successRate: number;
}

interface DashboardState {
  currentTask: Task | null;
  nextTask: Task | null;
  pendingTasks: Task[];
  completedTasks: Task[];
  failedTasks: Task[];
  stats: TaskStats;
  isConnected: boolean;
  lastUpdated: Date;
}
```

### API Client (`src/core/api-client.ts`)

```typescript
class DashboardApiClient {
  constructor(config?: { baseUrl?: string; timeout?: number })

  async getTasks(): Promise<Task[]>
  async getCurrentTask(): Promise<Task | null>
  async getNextTask(): Promise<Task | null>
  async getPendingTasks(): Promise<Task[]>
  async getCompletedTasks(): Promise<Task[]>
  async getStats(): Promise<TaskStats>
  async createTask(task: Partial<Task>): Promise<Task>
  async healthCheck(): Promise<boolean>
}
```

### State Manager (`src/core/state-manager.ts`)

```typescript
class DashboardStateManager {
  constructor(apiClient: DashboardApiClient)

  getState(): DashboardState
  async refresh(): Promise<void>
  subscribe(callback: (state: DashboardState) => void): () => void
  startPolling(intervalMs?: number): void
  stopPolling(): void
}
```

## TUI Dashboard

The TUI uses [blessed](https://github.com/chjj/blessed) for terminal rendering.

### Entry Point

```typescript
import { startTui } from '@loopwork-ai/dashboard/tui';

await startTui({
  port: 3333,      // Dashboard server port
  watch: true      // Auto-refresh every 2 seconds
});
```

### Keyboard Controls

| Key | Action |
|-----|--------|
| `q`, `Q`, `Esc` | Quit |
| `r`, `R` | Refresh |
| `Tab` | Navigate between panels |
| Arrow keys | Scroll within panels |

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│                    Current Task                              │
│  [TASK-001] Implement user authentication                   │
│  Status: in-progress  │  Duration: 5m 23s                   │
│  ████████████░░░░░░░░ 60%                                   │
├─────────────────────────────────────────────────────────────┤
│  Statistics                                                  │
│  Total: 15  │  Pending: 8  │  Completed: 5  │  Failed: 2   │
│  Success Rate: 71% ███████░░░                               │
├─────────────────────────────────────────────────────────────┤
│  Task Queue                              │  Completed        │
│  ► [TASK-002] Add login form             │  ✓ TASK-000      │
│    [TASK-003] Setup database             │  ✓ TASK-00A      │
│    [TASK-004] Write tests                │  ✓ TASK-00B      │
├─────────────────────────────────────────────────────────────┤
│  ● Connected  │  Last updated: 2 seconds ago                │
└─────────────────────────────────────────────────────────────┘
```

## Web UI Dashboard

The Web UI is built with [Next.js](https://nextjs.org/) and React.

### Running the Web UI

```bash
# Development
cd packages/dashboard/web
bun run dev

# Production
bun run build
bun run start
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_DASHBOARD_API_URL` | `http://localhost:3333` | Dashboard server URL |

## Dashboard Server (Plugin)

The dashboard server is a Loopwork plugin that provides:

1. **HTTP API** for task data
2. **SSE endpoint** for real-time updates
3. **File watcher** for state file changes

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/events` | GET | SSE stream for real-time updates |
| `/api/tasks` | GET | List all tasks |
| `/api/tasks` | POST | Create new task |
| `/api/tasks/current` | GET | Get current executing task |
| `/api/tasks/next` | GET | Get next task in queue |
| `/api/tasks/pending` | GET | List pending tasks |
| `/api/tasks/completed` | GET | List completed tasks |
| `/api/tasks/stats` | GET | Get task statistics |

### Plugin Configuration

```typescript
import { withDashboard } from '@loopwork-ai/dashboard';

export default compose(
  withDashboard({
    port: 3333,
    enabled: true,
    autoOpen: false
  })
)(defineConfig({ cli: 'claude' }));
```

## CLI Command

The `loopwork dashboard` command provides access to both TUI and Web UI.

```bash
# TUI mode (default)
loopwork dashboard
loopwork dashboard --tui
loopwork dashboard --watch        # Auto-refresh
loopwork dashboard --port 3333    # Custom port

# Web mode
loopwork dashboard --web          # Opens browser
```

## Data Flow

```
┌──────────────────┐
│  Loopwork Core   │
│  (task runner)   │
└────────┬─────────┘
         │ Plugin hooks
         ▼
┌──────────────────┐     File changes     ┌──────────────────┐
│ Dashboard Plugin │◄────────────────────►│  .loopwork/      │
│    (server)      │                      │  state files     │
└────────┬─────────┘                      └──────────────────┘
         │
         │ HTTP API / SSE
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐ ┌───────┐
│  TUI  │ │  Web  │
│       │ │  UI   │
└───────┘ └───────┘
```

## Testing

```bash
# Run all dashboard tests
bun test packages/dashboard/test/

# Run TUI tests only
bun test packages/dashboard/test/tui.test.ts

# Run routes tests only
bun test packages/dashboard/test/routes.test.ts

# Run E2E tests (requires Playwright)
bun run test:e2e
```

## Future Improvements

1. **WebSocket support** - Replace SSE with WebSocket for bidirectional communication
2. **Task filtering** - Filter by status, feature, priority in UI
3. **Task actions** - Start/stop/retry tasks from dashboard
4. **Metrics history** - Store and display historical metrics
5. **Multiple backends** - Support GitHub Issues and other backends
6. **Themes** - Light/dark mode for Web UI, color schemes for TUI
