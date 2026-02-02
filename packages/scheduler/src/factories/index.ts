import { SimpleCronParser } from '../implementations/cron-parser.js';
import { SimpleScheduleMatcher } from '../implementations/schedule-matcher.js';
import { SimpleDeadlineEnforcer } from '../implementations/deadline-enforcer.js';
import { SimplePriorityScorer } from '../implementations/priority-scorer.js';
import { HeapPriorityQueue } from '../implementations/priority-queue.js';
import { SimpleTaskDispatcher } from '../implementations/task-dispatcher.js';
import { SimpleTaskRescheduler } from '../implementations/task-rescheduler.js';
import { SimpleTaskScheduler } from '../implementations/task-scheduler.js';
import { 
  CronParser, 
  ScheduleMatcher, 
  DeadlineEnforcer, 
  PriorityScorer, 
  PriorityQueue, 
  TaskDispatcher, 
  TaskRescheduler, 
  TaskScheduler,
  TimeSource,
  SchedulerConfig
} from '../interfaces/index.js';

export function createCronParser(): CronParser {
  return new SimpleCronParser();
}

export function createScheduleMatcher(timeSource?: TimeSource): ScheduleMatcher {
  return new SimpleScheduleMatcher(createCronParser(), timeSource);
}

export function createDeadlineEnforcer(timeSource?: TimeSource): DeadlineEnforcer {
  return new SimpleDeadlineEnforcer(timeSource);
}

export function createPriorityScorer(timeSource?: TimeSource): PriorityScorer {
  return new SimplePriorityScorer(createDeadlineEnforcer(timeSource));
}

export function createPriorityQueue<T>(): PriorityQueue<T> {
  return new HeapPriorityQueue<T>();
}

export function createTaskDispatcher(config: SchedulerConfig, timeSource?: TimeSource): TaskDispatcher {
  return new SimpleTaskDispatcher(
    config,
    createScheduleMatcher(timeSource),
    createPriorityScorer(timeSource),
    timeSource
  );
}

export function createTaskRescheduler(timeSource?: TimeSource): TaskRescheduler {
  return new SimpleTaskRescheduler(createScheduleMatcher(timeSource), timeSource);
}

export function createTaskScheduler(config: SchedulerConfig, timeSource?: TimeSource): TaskScheduler {
  return new SimpleTaskScheduler(
    config,
    createTaskDispatcher(config, timeSource),
    createTaskRescheduler(timeSource),
    timeSource
  );
}
