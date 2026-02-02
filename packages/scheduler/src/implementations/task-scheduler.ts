import { TaskScheduler, ScheduledTask, SchedulerConfig, TaskDispatcher, TaskRescheduler, SchedulerStats, TimeSource } from '../interfaces/index.js';

export class SimpleTaskScheduler implements TaskScheduler {
  private tasks: ScheduledTask[] = [];
  private completed: Set<string> = new Set();
  private running: Set<string> = new Set();
  private stats: SchedulerStats = { 
    totalScheduled: 0, 
    totalCompleted: 0, 
    totalMissedDeadlines: 0, 
    averageWaitTime: 0 
  };

  constructor(
    private config: SchedulerConfig,
    private dispatcher: TaskDispatcher,
    private rescheduler: TaskRescheduler,
    private timeSource: TimeSource = { now: () => Date.now() }
  ) {}

  schedule(task: ScheduledTask): void {
    this.tasks.push(task);
    this.stats.totalScheduled++;
  }

  getNext(): ScheduledTask | null {
    const maxConcurrent = this.config.maxConcurrent ?? 1;
    if (this.running.size >= maxConcurrent) {
        return null;
    }

    // Filter out completed AND running tasks
    const availableTasks = this.tasks.filter(t => !this.completed.has(t.id) && !this.running.has(t.id));
    
    const next = this.dispatcher.selectNext(availableTasks);
    
    if (next) {
        this.running.add(next.id);
    }
    
    return next;
  }

  complete(taskId: string): void {
    if (this.completed.has(taskId)) return;
    
    this.running.delete(taskId);
    this.completed.add(taskId);
    this.stats.totalCompleted++;
    
    const task = this.tasks.find(t => t.id === taskId);
    if (task) {
      if (task.deadline && this.timeSource.now() > task.deadline) {
          this.stats.totalMissedDeadlines++;
      }

      if (this.rescheduler.shouldReschedule(task)) {
        const next = this.rescheduler.reschedule(task);
        if (next) this.schedule(next);
      }
    }
  }

  getTasks(): ScheduledTask[] {
    return [...this.tasks];
  }

  getStats(): SchedulerStats {
    return { ...this.stats };
  }
}
