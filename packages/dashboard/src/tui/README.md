# Terminal UI (TUI) Dashboard

Rich terminal rendering for Loopwork task monitoring using blessed and blessed-contrib.

## Features

- **Full-screen terminal dashboard** with color-coded status indicators
- **Real-time updates** with auto-refresh every 2 seconds (configurable)
- **Current task display** showing active task with progress and duration
- **Task statistics** with completion rate and progress bars
- **Task queue view** highlighting next task and showing pending tasks
- **Completed tasks list** with scrollable history and relative timestamps
- **Connection status bar** showing server connection and last update time
- **Keyboard controls** for navigation and refresh

## Components

### Main Entry Point
- `index.ts` - Main TUI entry point with `startTui()` function

### Renderer
- `renderer.ts` - Terminal renderer using blessed for dashboard layout

### Components
- `CurrentTaskBox.ts` - Shows currently executing task with progress
- `StatsBox.ts` - Shows statistics grid (total, pending, completed, failed)
- `QueueBox.ts` - Shows task queue with next task highlighted
- `CompletedBox.ts` - Scrollable list of completed/failed tasks

### Utilities
- `utils.ts` - Color formatting, progress bars, time formatting

## Usage

```typescript
import { startTui } from '@loopwork-ai/dashboard/tui';

// Start TUI with auto-refresh
await startTui({
  port: 3333,
  host: 'localhost',
  watch: true
});
```

## Keyboard Controls

| Key | Action |
|-----|--------|
| `q` or `Q` | Quit dashboard |
| `Esc` | Quit dashboard |
| `Ctrl+C` | Quit dashboard |
| `r` or `R` | Force refresh |
| `Tab` | Focus next component |
| `Shift+Tab` | Focus previous component |

## Layout

```
┌─ Current Task ────────────────────────────────────────┐
│ ● Task name and status                                 │
│ Duration and other details                             │
└────────────────────────────────────────────────────────┘

┌─ Statistics ──────────┬─ Task Queue ──────────────────┐
│ Total: 10             │ ▶ NEXT                         │
│ Pending: 3            │ Next task title                │
│ Completed: 6          │                                │
│ Failed: 1             │ Remaining: 2                   │
│ Success Rate: 85.7%   │ ○ Pending task 1               │
│ Progress: ████████░░  │ ○ Pending task 2               │
└───────────────────────┴────────────────────────────────┘

┌─ Completed Tasks ─────────────────────────────────────┐
│ ✓ Completed task 1 (45s, 2m ago)                      │
│ ✓ Completed task 2 (1m 30s, 5m ago)                   │
│ ✗ Failed task 1 (2m 15s, 10m ago)                     │
│ (scrollable)                                           │
└────────────────────────────────────────────────────────┘

 ● Connected | Last updated: 14:30:45 | Press 'q' to quit
```

## Status Colors

- 🟢 **Green** - Completed tasks
- 🟡 **Yellow** - Pending tasks
- 🔴 **Red** - Failed tasks
- 🔵 **Blue** - In-progress tasks
- ⚪ **Gray** - Idle/waiting state

## Dependencies

- `blessed` - Terminal UI framework
- `blessed-contrib` - Additional widgets and charts
- `@types/blessed` - TypeScript definitions

## Testing

Run tests with:
```bash
bun test test/tui.test.ts
```

All utility functions are fully tested with 37 test cases.

## Integration

The TUI connects to the dashboard server via HTTP API:
- `GET /api/state` - Fetch current dashboard state

It expects the following response structure:
```typescript
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
