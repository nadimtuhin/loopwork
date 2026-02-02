# @loopwork-ai/task-scheduler

Advanced task scheduling for Loopwork with cron expressions, deadlines, and smart priority management.

## Overview

The `@loopwork-ai/task-scheduler` package provides a robust scheduling engine designed for the Loopwork task automation framework. It enables complex task orchestration by combining time-based scheduling (Cron), hard deadlines, and dynamic priority scoring.

## Features

- **Cron Scheduling**: Standard 5-part cron expression support for recurring tasks.
- **Deadline Enforcement**: Hard deadlines that automatically boost task priority as they approach.
- **Dynamic Prioritization**: Intelligent scoring that balances base priority, deadline urgency, and wait time.
- **Dependency Management**: Task-level dependencies to ensure correct execution order.
- **Timezone Support**: Support for IANA timezones (default: UTC).
- **Mockable Time**: Injectable `TimeSource` for reliable testing and deterministic scheduling.
- **Loopwork Plugin**: Ready-to-use plugin for the Loopwork core framework.

## Installation

```bash
bun add @loopwork-ai/task-scheduler
```

## Quick Start

### Basic Scheduling

```typescript
import { createTaskScheduler } from '@loopwork-ai/task-scheduler';

const scheduler = createTaskScheduler({
  respectDeadlines: true,
  respectSchedules: true,
});

// Schedule a one-time task
scheduler.schedule({
  id: 'task-1',
  priority: 50,
  createdAt: Date.now(),
});

// Schedule a recurring task (every 15 minutes)
scheduler.schedule({
  id: 'recurring-task',
  schedule: { cron: '*/15 * * * *' },
  priority: 80,
  createdAt: Date.now(),
});

// Get next task to execute
const next = scheduler.getNext();

if (next) {
  console.log(`Executing task: ${next.id}`);
  
  // Complete task (and reschedule if recurring)
  scheduler.complete(next.id);
}
```

### Deadline Prioritization

Tasks with approaching deadlines are automatically prioritized even if they have a lower base priority.

```typescript
const now = Date.now();

scheduler.schedule({
  id: 'urgent',
  deadline: now + 5000, // 5 seconds from now
  priority: 10,         // Low base priority
  createdAt: now,
});

scheduler.schedule({
  id: 'normal',
  priority: 90,         // High base priority
  createdAt: now,
});

// 'urgent' will be selected first because of the imminent deadline
const next = scheduler.getNext(); // { id: 'urgent' }
```

## API Reference

### Factories

- `createTaskScheduler(config: SchedulerConfig, timeSource?: TimeSource): TaskScheduler`
- `createCronParser(): CronParser`
- `createScheduleMatcher(timeSource?: TimeSource): ScheduleMatcher`

### TaskScheduler Interface

- `schedule(task: ScheduledTask): void`: Adds a task to the scheduler.
- `getNext(): ScheduledTask | null`: Returns the highest priority task ready for execution.
- `complete(taskId: string): void`: Marks a task as finished and handles rescheduling for cron tasks.
- `getTasks(): ScheduledTask[]`: Returns all currently managed tasks.
- `getStats(): SchedulerStats`: Returns execution statistics.

### Configuration

```typescript
interface SchedulerConfig {
  timezone?: string;            // Default timezone (default: UTC)
  maxConcurrent?: number;       // Max concurrent tasks (default: 1)
  respectDeadlines?: boolean;   // Prioritize deadline tasks (default: true)
  respectSchedules?: boolean;   // Honor cron schedules (default: true)
  deferMissedTasks?: boolean;   // Defer if scheduled time passed (default: false)
}
```

### ScheduledTask

```typescript
interface ScheduledTask {
  id: string;
  schedule?: Schedule;      // Cron and timing config
  deadline?: number;       // Hard deadline timestamp
  priority?: number;       // 0-100, higher = more urgent
  dependencies?: string[]; // IDs of tasks that must complete first
  createdAt: number;
  metadata?: Record<string, any>;
}
```

## Cron Expression Examples

| Expression | Description |
|------------|-------------|
| `* * * * *` | Every minute |
| `0 * * * *` | Every hour at minute 0 |
| `0 0 * * *` | Every day at midnight |
| `*/15 * * * *` | Every 15 minutes |
| `0 9-17 * * 1-5` | Every hour from 9 AM to 5 PM, Monday to Friday |

## Loopwork Integration

Add the scheduler to your `loopwork.config.ts`:

```typescript
import { compose, defineConfig } from '@loopwork-ai/loopwork';
import { withScheduler } from '@loopwork-ai/task-scheduler';

export default compose(
  withScheduler({
    respectDeadlines: true,
    maxConcurrent: 2,
  })
)(defineConfig({
  // ... core config
}));
```

## Architecture

The scheduler is built using a modular architecture with clean separation of concerns:

- **CronParser**: Standardized parsing of cron strings.
- **ScheduleMatcher**: Determines if a task is ready based on its schedule.
- **PriorityScorer**: Calculates dynamic scores based on priority, deadlines, and age.
- **DeadlineEnforcer**: Monitors task deadlines and triggers urgency boosts.
- **TaskRescheduler**: Calculates the next run time for recurring tasks.

## Advanced Usage

### Custom Time Source

For testing or simulation, you can provide a custom time source:

```typescript
const mockTime = {
  currentTime: Date.now(),
  now() { return this.currentTime; },
  advance(ms: number) { this.currentTime += ms; }
};

const scheduler = createTaskScheduler(config, mockTime);
```

## License

MIT
