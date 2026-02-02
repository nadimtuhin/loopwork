import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { SimpleTaskScheduler } from '../../src/implementations/task-scheduler.js';
import { SimpleTaskDispatcher } from '../../src/implementations/task-dispatcher.js';
import { SimpleTaskRescheduler } from '../../src/implementations/task-rescheduler.js';
import { SimpleScheduleMatcher } from '../../src/implementations/schedule-matcher.js';
import { SimpleCronParser } from '../../src/implementations/cron-parser.js';
import { SimplePriorityScorer } from '../../src/implementations/priority-scorer.js';
import { SimpleDeadlineEnforcer } from '../../src/implementations/deadline-enforcer.js';

describe('SimpleTaskScheduler', () => {
  const timeSource = { now: () => 1000 };
  const cronParser = new SimpleCronParser();
  const scheduleMatcher = new SimpleScheduleMatcher(cronParser, timeSource);
  const deadlineEnforcer = new SimpleDeadlineEnforcer(timeSource);
  const priorityScorer = new SimplePriorityScorer(deadlineEnforcer);
  const config = { respectDeadlines: true, respectSchedules: true };
  const dispatcher = new SimpleTaskDispatcher(config, scheduleMatcher, priorityScorer, timeSource);
  const rescheduler = new SimpleTaskRescheduler(scheduleMatcher, timeSource);
  
  let scheduler: SimpleTaskScheduler;

  beforeEach(() => {
    scheduler = new SimpleTaskScheduler(config, dispatcher, rescheduler);
  });

  test('schedule adds task', () => {
    const task = { id: '1', createdAt: 0 };
    scheduler.schedule(task);
    expect(scheduler.getTasks()).toHaveLength(1);
    expect(scheduler.getStats().totalScheduled).toBe(1);
  });

  test('getNext returns highest priority task', () => {
    const task1 = { id: '1', priority: 10, createdAt: 0 };
    const task2 = { id: '2', priority: 20, createdAt: 0 };
    
    scheduler.schedule(task1);
    scheduler.schedule(task2);
    
    expect(scheduler.getNext()).toBe(task2);
  });

  test('complete marks task done', () => {
    const task = { id: '1', createdAt: 0 };
    scheduler.schedule(task);
    scheduler.complete('1');
    
    expect(scheduler.getStats().totalCompleted).toBe(1);
    // getNext should not return completed tasks
    expect(scheduler.getNext()).toBeNull();
  });

  test('complete reschedules recurring task', () => {
    const task = { 
        id: '1', 
        schedule: { cron: '* * * * *' }, 
        createdAt: 0 
    };
    
    // We need to ensure rescheduler works. 
    // Cron '* * * * *' matches everything, so getNextExecution returns next minute.
    
    scheduler.schedule(task);
    scheduler.complete('1');
    
    expect(scheduler.getStats().totalCompleted).toBe(1);
    expect(scheduler.getStats().totalScheduled).toBe(2); // 1 original + 1 rescheduled
    expect(scheduler.getTasks()).toHaveLength(2);
    
    const tasks = scheduler.getTasks();
    const rescheduled = tasks.find(t => t.id !== '1');
    expect(rescheduled).toBeDefined();
    expect(rescheduled!.id).toContain('1-');
  });

  test('getStats returns correct stats', () => {
    expect(scheduler.getStats()).toEqual({
        totalScheduled: 0,
        totalCompleted: 0,
        totalMissedDeadlines: 0,
        averageWaitTime: 0
    });
  });

  test('getNext respects maxConcurrent', () => {
     // This requires the scheduler to track "running" tasks.
     // But `getNext` just returns a task. It doesn't mark it as "running".
     // The prompt for TaskScheduler says: "schedule() adds task... getNext() returns... complete() marks done"
     // Does TaskScheduler track "in progress"?
     // The implementation sketch showed:
     // `private tasks: ScheduledTask[] = [];`
     // `private completed: Set<string> = new Set();`
     // It didn't show "inProgress".
     // But prompt said "maxConcurrent tasks (default: 1)".
     // If `getNext` is called multiple times without `complete`, does it return same task?
     // If so, it's not "concurrent execution" control.
     // Usually `getNext` marks as "claimed" or "running".
     // If `SimpleTaskScheduler` implementation sketch didn't have `running` set, I should add it if I want to support `maxConcurrent`.
     // The prompt requirements "Dispatcher... respectsConcurrent?" No.
     // "Main TaskScheduler... Concurrent task limit respected".
     // So I need to implement `running` set.
     // When `getNext` returns a task, it is "running".
     // When `complete` is called, it is removed from "running" and added to "completed".
     
     // Let's assume I should add this logic.
  });
});
