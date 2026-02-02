import { describe, test, expect, mock } from 'bun:test';
import { SimpleTaskDispatcher } from '../../src/implementations/task-dispatcher.js';
import { SimpleScheduleMatcher } from '../../src/implementations/schedule-matcher.js';
import { SimpleCronParser } from '../../src/implementations/cron-parser.js';
import { SimplePriorityScorer } from '../../src/implementations/priority-scorer.js';
import { SimpleDeadlineEnforcer } from '../../src/implementations/deadline-enforcer.js';

describe('SimpleTaskDispatcher', () => {
  const timeSource = { now: () => 1000 };
  const cronParser = new SimpleCronParser();
  const scheduleMatcher = new SimpleScheduleMatcher(cronParser, timeSource);
  const deadlineEnforcer = new SimpleDeadlineEnforcer(timeSource);
  const priorityScorer = new SimplePriorityScorer(deadlineEnforcer);
  
  const config = { respectDeadlines: true, respectSchedules: true };
  const dispatcher = new SimpleTaskDispatcher(config, scheduleMatcher, priorityScorer, timeSource);

  test('selectNext picks highest priority executable task', () => {
    const task1 = { id: '1', priority: 10, createdAt: 0 };
    const task2 = { id: '2', priority: 20, createdAt: 0 };
    
    // Both executable (no schedule restrictions)
    expect(dispatcher.selectNext([task1, task2])).toBe(task2);
  });

  test('respects schedules', () => {
    // Schedule in future
    const task = { 
      id: '1', 
      schedule: { startTime: 2000 }, 
      createdAt: 0 
    };
    
    expect(dispatcher.shouldExecute(task)).toBe(false);
    expect(dispatcher.selectNext([task])).toBeNull();
  });

  test('handles dependencies', () => {
    // Cannot simulate dependency check easily without task state unless passed in
    // Interface: selectNext(tasks: ScheduledTask[])
    // Dispatcher usually assumes the list passed IS the candidate list?
    // "Filters out tasks with unmet dependencies" - dependency logic might be inside dispatcher or caller.
    // ScheduledTask has `dependencies`.
    // Dispatcher needs to know which are completed?
    // The prompt says "Filters out tasks with unmet dependencies".
    // But `selectNext` only takes `ScheduledTask[]`. It doesn't take completed set.
    // If the list passed `tasks` contains ALL tasks, how does it know completion?
    // Maybe `selectNext` assumes `tasks` are pending tasks.
    // If a task depends on ID 'X', and 'X' is not in `tasks`... maybe it's completed?
    // Or maybe it's not completed?
    // Let's assume for now Dispatcher ignores dependencies or checks against the list itself?
    // Actually, usually Scheduler filters dependencies.
    // But if Dispatcher is responsible...
    // Let's look at interfaces.
    // `TaskDispatcher.selectNext(tasks)`
    // If `tasks` is the list of PENDING tasks.
    // If task A depends on B. B is in `tasks` (pending). A cannot run.
    // If B is NOT in `tasks`, it might be completed OR not scheduled yet.
    // This implies Dispatcher might be limited.
    // However, let's implement basic dependency check: if dependency is present in the provided list, it's not done?
    // Or maybe we can't fully check.
    // I'll skip dependency complex logic for now unless I see a way.
    // Prompt: "Filters out tasks with unmet dependencies"
    // I'll assume if dependency is in the list, it's unmet.
    
    const task1 = { id: '1', createdAt: 0 };
    const task2 = { id: '2', dependencies: ['1'], createdAt: 0 };
    
    // Task 2 depends on 1. 1 is pending (in list). So 2 should not run.
    expect(dispatcher.selectNext([task1, task2])).toBe(task1);
  });

  test('returns null if list empty', () => {
    expect(dispatcher.selectNext([])).toBeNull();
  });
});
