import { TaskDispatcher, ScheduledTask, ScheduleMatcher, PriorityScorer, TimeSource, SchedulerConfig } from '../interfaces/index.js';

export class SimpleTaskDispatcher implements TaskDispatcher {
  constructor(
    private config: SchedulerConfig,
    private scheduleMatcher: ScheduleMatcher,
    private priorityScorer: PriorityScorer,
    private timeSource: TimeSource = { now: () => Date.now() }
  ) {}

  selectNext(tasks: ScheduledTask[]): ScheduledTask | null {
    if (!tasks || tasks.length === 0) return null;

    // Filter tasks blocked by dependencies (if dependency is in the pending list)
    const taskIds = new Set(tasks.map(t => t.id));
    const readyTasks = tasks.filter(task => {
        if (task.dependencies && task.dependencies.length > 0) {
            // If any dependency is still in the pending list, it's blocked
            const hasPendingDependency = task.dependencies.some(depId => taskIds.has(depId));
            if (hasPendingDependency) return false;
        }
        return true;
    });

    // Filter executable tasks based on schedule
    const executable = readyTasks.filter(t => this.shouldExecute(t));
    if (executable.length === 0) return null;

    // Sort by priority/score
    executable.sort((a, b) => {
      const scoreA = this.priorityScorer.calculateScore(a);
      const scoreB = this.priorityScorer.calculateScore(b);
      return scoreB - scoreA;
    });

    return executable[0];
  }

  shouldExecute(task: ScheduledTask): boolean {
    const now = this.timeSource.now();
    
    if (this.config.respectSchedules && task.schedule) {
        if (task.schedule.startTime && now < task.schedule.startTime) return false;
        
        if (task.schedule.cron) {
            if (!this.scheduleMatcher.matches(task.schedule, now)) {
                return false;
            }
        }
    }
    
    return true;
  }
}
