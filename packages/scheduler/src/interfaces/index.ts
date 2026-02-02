/**
 * Mockable time source
 */
export interface TimeSource {
  now(): number;
}

/**
 * Cron expression components
 */
export interface CronExpression {
  minute: string;      // 0-59 or *
  hour: string;        // 0-23 or *
  dayOfMonth: string;  // 1-31 or *
  month: string;       // 1-12 or *
  dayOfWeek: string;   // 0-6 or *
}

/**
 * Schedule configuration
 */
export interface Schedule {
  cron?: string;           // Cron expression
  startTime?: number;      // Timestamp when schedule begins
  endTime?: number;        // Timestamp when schedule ends
  timezone?: string;       // IANA timezone (default: UTC)
  defer?: boolean;         // Defer execution if missed
}

/**
 * Task metadata for scheduling
 */
export interface ScheduledTask {
  id: string;
  schedule?: Schedule;
  deadline?: number;       // Hard deadline timestamp
  priority?: number;       // 0-100, higher = more urgent
  dependencies?: string[]; // Task IDs that must complete first
  createdAt: number;
  metadata?: Record<string, any>;
}

/**
 * Cron expression parser
 */
export interface CronParser {
  /**
   * Parse cron string into structured format
   */
  parse(expression: string): CronExpression;
  
  /**
   * Validate cron expression
   */
  isValid(expression: string): boolean;
}

/**
 * Schedule matcher - determines if schedule matches current time
 */
export interface ScheduleMatcher {
  /**
   * Check if schedule matches a given timestamp
   */
  matches(schedule: Schedule, timestamp: number): boolean;
  
  /**
   * Get next execution time after given timestamp
   */
  getNextExecution(schedule: Schedule, afterTimestamp: number): number | null;
}

/**
 * Deadline enforcement
 */
export interface DeadlineEnforcer {
  /**
   * Check if task has passed its deadline
   */
  isPastDeadline(task: ScheduledTask): boolean;
  
  /**
   * Calculate urgency score based on deadline proximity
   * Returns 0-1, where 1 = deadline imminent
   */
  calculateUrgency(task: ScheduledTask): number;
}

/**
 * Priority scoring
 */
export interface PriorityScorer {
  /**
   * Calculate final priority score for a task
   * Combines base priority, deadline urgency, and other factors
   */
  calculateScore(task: ScheduledTask): number;
}

/**
 * Priority queue for task ordering
 */
export interface PriorityQueue<T> {
  /**
   * Add item to queue
   */
  enqueue(item: T, priority: number): void;
  
  /**
   * Remove and return highest priority item
   */
  dequeue(): T | null;
  
  /**
   * View highest priority item without removing
   */
  peek(): T | null;
  
  /**
   * Get current queue size
   */
  size(): number;
  
  /**
   * Check if queue is empty
   */
  isEmpty(): boolean;
}

/**
 * Task dispatcher - selects next task to execute
 */
export interface TaskDispatcher {
  /**
   * Select next task based on priorities, schedules, and deadlines
   */
  selectNext(tasks: ScheduledTask[]): ScheduledTask | null;
  
  /**
   * Check if task should be executed now
   */
  shouldExecute(task: ScheduledTask): boolean;
}

/**
 * Task rescheduler - handles recurring tasks
 */
export interface TaskRescheduler {
  /**
   * Calculate next execution time for recurring task
   */
  reschedule(task: ScheduledTask): ScheduledTask | null;
  
  /**
   * Check if task should be rescheduled
   */
  shouldReschedule(task: ScheduledTask): boolean;
}

/**
 * Main scheduler configuration
 */
export interface SchedulerConfig {
  timezone?: string;            // Default timezone (default: UTC)
  maxConcurrent?: number;       // Max concurrent tasks (default: 1)
  respectDeadlines?: boolean;   // Prioritize deadline tasks (default: true)
  respectSchedules?: boolean;   // Honor cron schedules (default: true)
  deferMissedTasks?: boolean;   // Defer if scheduled time passed (default: false)
}

/**
 * Main scheduler interface
 */
export interface TaskScheduler {
  /**
   * Add task to scheduler
   */
  schedule(task: ScheduledTask): void;
  
  /**
   * Get next task to execute
   */
  getNext(): ScheduledTask | null;
  
  /**
   * Mark task as completed and reschedule if recurring
   */
  complete(taskId: string): void;
  
  /**
   * Get all scheduled tasks
   */
  getTasks(): ScheduledTask[];
  
  /**
   * Get statistics
   */
  getStats(): SchedulerStats;
}

/**
 * Scheduler statistics
 */
export interface SchedulerStats {
  totalScheduled: number;
  totalCompleted: number;
  totalMissedDeadlines: number;
  averageWaitTime: number; // ms
}
