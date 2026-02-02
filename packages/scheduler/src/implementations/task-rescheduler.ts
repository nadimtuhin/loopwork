import { TaskRescheduler, ScheduledTask, ScheduleMatcher, TimeSource } from '../interfaces/index.js';

export class SimpleTaskRescheduler implements TaskRescheduler {
  constructor(
    private scheduleMatcher: ScheduleMatcher,
    private timeSource: TimeSource = { now: () => Date.now() }
  ) {}

  reschedule(task: ScheduledTask): ScheduledTask | null {
    if (!this.shouldReschedule(task)) return null;

    const now = this.timeSource.now();
    // Safety check for schedule existence already done in shouldReschedule
    const nextTime = this.scheduleMatcher.getNextExecution(task.schedule!, now);
    
    if (!nextTime) return null;

    return {
        ...task,
        id: `${task.id.split('-')[0]}-${nextTime}`, 
        schedule: {
            ...task.schedule,
            startTime: nextTime
        },
        deadline: undefined, 
        createdAt: now
    };
  }

  shouldReschedule(task: ScheduledTask): boolean {
    return !!(task.schedule && task.schedule.cron);
  }
}
