import { describe, test, expect } from 'bun:test';
import { createTaskScheduler } from '../../src/factories/index.js';
import { TimeSource } from '../../src/interfaces/index.js';

class MockTimeSource implements TimeSource {
  currentTime = Date.now();
  now() { return this.currentTime; }
  advance(ms: number) { this.currentTime += ms; }
  set(timestamp: number) { this.currentTime = timestamp; }
}

describe('Scheduler Integration', () => {
  test('full workflow: schedule, execute, reschedule', async () => {
    const mockTime = new MockTimeSource();
    // Set to a specific time: Monday, 2026-02-02 10:00:00 UTC
    // 1738490400000 is approx Feb 2, 2025.
    // Let's use a known midnight
    const midnight = new Date('2026-02-02T00:00:00Z').getTime();
    mockTime.set(midnight);

    const scheduler = createTaskScheduler({
      respectDeadlines: true,
      respectSchedules: true,
    }, mockTime);

    scheduler.schedule({
      id: 'task-1',
      schedule: { cron: '*/15 * * * *' },
      priority: 80,
      createdAt: mockTime.now(),
    });

    const next = scheduler.getNext();
    expect(next).not.toBeNull();
    expect(next?.id).toBe('task-1');

    scheduler.complete('task-1');
    
    let stats = scheduler.getStats();
    expect(stats.totalCompleted).toBe(1);
    expect(stats.totalScheduled).toBe(2);

    const nextAfterComplete = scheduler.getNext();
    expect(nextAfterComplete).toBeNull();

    mockTime.advance(15 * 60 * 1000);
    
    const nextAfterAdvance = scheduler.getNext();
    expect(nextAfterAdvance).not.toBeNull();
    expect(nextAfterAdvance?.id).toMatch(/^task-\d+$/);
  });

  test('deadline prioritization', () => {
    const mockTime = new MockTimeSource();
    const now = mockTime.now();
    const scheduler = createTaskScheduler({ respectDeadlines: true }, mockTime);

    scheduler.schedule({
      id: 'urgent',
      deadline: now + 10000,
      priority: 50,
      createdAt: now,
    });

    scheduler.schedule({
      id: 'normal',
      priority: 60,
      createdAt: now,
    });

    mockTime.advance(9000);

    const next = scheduler.getNext();
    expect(next?.id).toBe('urgent');
  });

  test('priority queue ordering', () => {
    const mockTime = new MockTimeSource();
    const scheduler = createTaskScheduler({}, mockTime);

    scheduler.schedule({ id: 'low', priority: 10, createdAt: mockTime.now() });
    scheduler.schedule({ id: 'high', priority: 90, createdAt: mockTime.now() });
    scheduler.schedule({ id: 'medium', priority: 50, createdAt: mockTime.now() });

    expect(scheduler.getNext()?.id).toBe('high');
    scheduler.complete('high');
    
    expect(scheduler.getNext()?.id).toBe('medium');
    scheduler.complete('medium');
    
    expect(scheduler.getNext()?.id).toBe('low');
  });

  test('dependency management', () => {
    const mockTime = new MockTimeSource();
    const scheduler = createTaskScheduler({}, mockTime);

    scheduler.schedule({ 
      id: 'child', 
      priority: 100, 
      dependencies: ['parent'],
      createdAt: mockTime.now() 
    });
    
    scheduler.schedule({ 
      id: 'parent', 
      priority: 10, 
      createdAt: mockTime.now() 
    });

    const first = scheduler.getNext();
    expect(first?.id).toBe('parent');
    
    scheduler.complete('parent');
    
    const second = scheduler.getNext();
    expect(second?.id).toBe('child');
  });
});
