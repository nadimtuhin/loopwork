import { describe, test, expect } from 'bun:test';
import { SimpleDeadlineEnforcer } from '../../src/implementations/deadline-enforcer.js';

describe('SimpleDeadlineEnforcer', () => {
  const now = 1000;
  const timeSource = { now: () => now };
  const enforcer = new SimpleDeadlineEnforcer(timeSource);

  test('isPastDeadline returns true if deadline passed', () => {
    const task = { id: '1', deadline: now - 1, createdAt: 0 };
    expect(enforcer.isPastDeadline(task)).toBe(true);
  });

  test('isPastDeadline returns false if deadline future', () => {
    const task = { id: '1', deadline: now + 1, createdAt: 0 };
    expect(enforcer.isPastDeadline(task)).toBe(false);
  });

  test('isPastDeadline returns false if no deadline', () => {
    const task = { id: '1', createdAt: 0 };
    expect(enforcer.isPastDeadline(task)).toBe(false);
  });

  test('calculateUrgency returns 1.0 if deadline passed', () => {
    const task = { id: '1', deadline: now - 100, createdAt: 0 };
    expect(enforcer.calculateUrgency(task)).toBe(1.0);
  });

  test('calculateUrgency returns 0.5 if halfway', () => {
    // Created at 0, Now 1000, Deadline 2000. 1000/2000 = 0.5
    const task = { id: '1', deadline: 2000, createdAt: 0 };
    expect(enforcer.calculateUrgency(task)).toBe(0.5);
  });

  test('calculateUrgency returns 0 if far away', () => {
     // Just created: createdAt = now
     const task = { id: '1', deadline: now + 1000, createdAt: now };
     expect(enforcer.calculateUrgency(task)).toBe(0);
  });

  test('calculateUrgency returns 0 if no deadline', () => {
    const task = { id: '1', createdAt: 0 };
    expect(enforcer.calculateUrgency(task)).toBe(0);
  });
});
