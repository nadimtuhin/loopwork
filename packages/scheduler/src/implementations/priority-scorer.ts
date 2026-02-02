import { PriorityScorer, ScheduledTask, DeadlineEnforcer } from '../interfaces/index.js';

export class SimplePriorityScorer implements PriorityScorer {
  constructor(private deadlineEnforcer: DeadlineEnforcer) {}

  calculateScore(task: ScheduledTask): number {
    const basePriority = (task.priority ?? 50) / 100;
    const urgency = this.deadlineEnforcer.calculateUrgency(task);
    
    const score = (basePriority * 0.6) + (urgency * 0.4);
    return Math.max(0, Math.min(1, score));
  }
}
