import { describe, test, expect, mock } from 'bun:test';
import { SimplePriorityScorer } from '../../src/implementations/priority-scorer.js';
import { SimpleDeadlineEnforcer } from '../../src/implementations/deadline-enforcer.js';

describe('SimplePriorityScorer', () => {
  const timeSource = { now: () => 1000 };
  const deadlineEnforcer = new SimpleDeadlineEnforcer(timeSource);
  const scorer = new SimplePriorityScorer(deadlineEnforcer);

  test('calculates base priority only', () => {
    // No deadline urgency (0)
    // Priority 50 => 0.5
    // Score = (0.5 * 0.6) + (0 * 0.4) = 0.3
    const task = { id: '1', priority: 50, createdAt: 0 };
    expect(scorer.calculateScore(task)).toBeCloseTo(0.3);
  });

  test('combines priority and urgency', () => {
    // Priority 50 => 0.5
    // Deadline passed => Urgency 1.0
    // Score = (0.5 * 0.6) + (1.0 * 0.4) = 0.3 + 0.4 = 0.7
    const task = { id: '1', priority: 50, deadline: 0, createdAt: 0 };
    expect(scorer.calculateScore(task)).toBeCloseTo(0.7);
  });

  test('defaults to 0.5 priority if missing', () => {
    // Priority default 50 => 0.5
    const task = { id: '1', createdAt: 0 };
    expect(scorer.calculateScore(task)).toBeCloseTo(0.3);
  });

  test('deadline urgency boosts score', () => {
    const taskLow = { id: '1', priority: 10, createdAt: 0 };
    const taskUrgent = { id: '2', priority: 10, deadline: 0, createdAt: 0 }; // Passed deadline
    
    expect(scorer.calculateScore(taskUrgent)).toBeGreaterThan(scorer.calculateScore(taskLow));
  });

  test('score clamped to 0-1', () => {
    // Even with max priority and max urgency, should be 1
    const task = { id: '1', priority: 1000, deadline: 0, createdAt: 0 };
    expect(scorer.calculateScore(task)).toBe(1);
  });
});
