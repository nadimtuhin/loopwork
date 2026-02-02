import { describe, test, expect, mock } from 'bun:test';
import { SimpleTaskRescheduler } from '../../src/implementations/task-rescheduler.js';
import { SimpleScheduleMatcher } from '../../src/implementations/schedule-matcher.js';
import { SimpleCronParser } from '../../src/implementations/cron-parser.js';

describe('SimpleTaskRescheduler', () => {
  const timeSource = { now: () => 1000 };
  const cronParser = new SimpleCronParser();
  const scheduleMatcher = new SimpleScheduleMatcher(cronParser, timeSource);
  const rescheduler = new SimpleTaskRescheduler(scheduleMatcher, timeSource);

  test('shouldReschedule true if has cron', () => {
    const task = { id: '1', schedule: { cron: '* * * * *' }, createdAt: 0 };
    expect(rescheduler.shouldReschedule(task)).toBe(true);
  });

  test('shouldReschedule false if no schedule', () => {
    const task = { id: '1', createdAt: 0 };
    expect(rescheduler.shouldReschedule(task)).toBe(false);
  });

  test('reschedule creates new task', () => {
    const task = { 
      id: '1', 
      schedule: { cron: '* * * * *' }, 
      createdAt: 0,
      metadata: { foo: 'bar' }
    };
    
    // We need to mock scheduleMatcher.getNextExecution?
    // Or rely on SimpleScheduleMatcher logic.
    // SimpleScheduleMatcher.getNextExecution works.
    
    const next = rescheduler.reschedule(task);
    expect(next).not.toBeNull();
    expect(next!.id).not.toBe(task.id);
    expect(next!.metadata).toEqual(task.metadata);
  });

  test('updates task ID for new instance', () => {
    const task = { id: '1', schedule: { cron: '* * * * *' }, createdAt: 0 };
    const next = rescheduler.reschedule(task);
    expect(next!.id).toContain('1-'); // Should probably append iteration or timestamp
  });
});
