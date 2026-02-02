import { DeadlineEnforcer, ScheduledTask, TimeSource } from '../interfaces/index.js';

export class SimpleDeadlineEnforcer implements DeadlineEnforcer {
  constructor(private timeSource: TimeSource = { now: () => Date.now() }) {}

  isPastDeadline(task: ScheduledTask): boolean {
    if (task.deadline === undefined || task.deadline === null) return false;
    return this.timeSource.now() >= task.deadline;
  }

  calculateUrgency(task: ScheduledTask): number {
    if (task.deadline === undefined || task.deadline === null) return 0;
    const now = this.timeSource.now();
    
    // Past deadline
    if (now >= task.deadline) return 1.0;
    
    // Calculate progress
    const totalDuration = task.deadline - task.createdAt;
    
    // Avoid division by zero
    if (totalDuration <= 0) return 1.0; 

    const elapsed = now - task.createdAt;
    
    // If not started yet (future createdAt), urgency is 0?
    if (elapsed < 0) return 0;

    const urgency = elapsed / totalDuration;
    return Math.max(0, Math.min(1, urgency));
  }
}
