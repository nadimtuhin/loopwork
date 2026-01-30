# Dashboard Core Module

Framework-agnostic core module shared between TUI and Web UI implementations.

## Components

### Types (`types.ts`)
- `Task` - Task entity with status, priority, metadata
- `TaskStats` - Aggregated statistics (total, pending, completed, etc.)
- `DashboardState` - Complete dashboard state snapshot
- `DashboardConfig` - Configuration options

### API Client (`api-client.ts`)
Framework-agnostic HTTP client for dashboard server communication.

**Features:**
- Timeout support (default 5s)
- Works in both browser and Node.js
- Graceful error handling
- Type-safe responses

**Methods:**
- `getTasks()` - Get all tasks
- `getCurrentTask()` - Get current task
- `getNextTask()` - Get next task
- `getPendingTasks()` - Get pending tasks
- `getCompletedTasks()` - Get completed tasks
- `getFailedTasks()` - Get failed tasks
- `getStats()` - Get statistics
- `createTask()` - Create new task
- `updateTask()` - Update existing task
- `deleteTask()` - Delete task
- `ping()` - Health check

### State Manager (`state-manager.ts`)
Observable state management with automatic polling.

**Features:**
- Subscribe/unsubscribe pattern
- Automatic polling with configurable interval
- Parallel API fetching
- Connection state tracking
- Query helpers (by ID, status, priority)

**Usage:**
```typescript
import { DashboardApiClient, DashboardStateManager } from '@loopwork-ai/dashboard/core'

const apiClient = new DashboardApiClient({ baseUrl: 'http://localhost:3333' })
const stateManager = new DashboardStateManager(apiClient, {
  autoRefresh: true,
  refreshInterval: 5000
})

// Subscribe to state changes
const unsubscribe = stateManager.subscribe((state) => {
  console.log('Current task:', state.currentTask)
  console.log('Stats:', state.stats)
})

// Manual refresh
await stateManager.refresh()

// Cleanup
unsubscribe()
stateManager.destroy()
```

## Design Principles

1. **Framework-agnostic** - No React, no DOM, no terminal-specific code
2. **Universal** - Works in browser and Node.js
3. **Type-safe** - Full TypeScript support
4. **Observable** - Reactive state updates via subscriptions
5. **Resilient** - Graceful error handling and connection recovery
