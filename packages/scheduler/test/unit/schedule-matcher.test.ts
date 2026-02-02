import { describe, test, expect, mock } from 'bun:test';
import { SimpleScheduleMatcher } from '../../src/implementations/schedule-matcher.js';
import { SimpleCronParser } from '../../src/implementations/cron-parser.js';

describe('SimpleScheduleMatcher', () => {
  const cronParser = new SimpleCronParser();
  const timeSource = { now: () => new Date('2024-01-01T09:00:00Z').getTime() }; // Monday
  const matcher = new SimpleScheduleMatcher(cronParser, timeSource);

  test('matches wildcard', () => {
    const schedule = { cron: '* * * * *' };
    expect(matcher.matches(schedule, timeSource.now())).toBe(true);
  });

  test('matches specific time', () => {
    const schedule = { cron: '0 9 * * *' }; // 9:00
    expect(matcher.matches(schedule, timeSource.now())).toBe(true);
  });

  test('does not match wrong time', () => {
    const schedule = { cron: '0 10 * * *' }; // 10:00
    expect(matcher.matches(schedule, timeSource.now())).toBe(false);
  });

  test('matches day of week', () => {
    const schedule = { cron: '* * * * 1' }; // Monday
    expect(matcher.matches(schedule, timeSource.now())).toBe(true);
  });

  test('does not match wrong day of week', () => {
    const schedule = { cron: '* * * * 2' }; // Tuesday
    expect(matcher.matches(schedule, timeSource.now())).toBe(false);
  });
  
  test('matches with startTime restriction', () => {
    const schedule = { cron: '* * * * *', startTime: timeSource.now() + 1000 };
    expect(matcher.matches(schedule, timeSource.now())).toBe(false);
  });

  test('matches with endTime restriction', () => {
    const schedule = { cron: '* * * * *', endTime: timeSource.now() - 1000 };
    expect(matcher.matches(schedule, timeSource.now())).toBe(false);
  });

  test('matches step values', () => {
     // 9:00 matches */15
    const schedule = { cron: '*/15 * * * *' };
    expect(matcher.matches(schedule, timeSource.now())).toBe(true);
  });

  test('getNextExecution calculates correct next time', () => {
    // Current: 09:00. Next: 09:01
    const schedule = { cron: '* * * * *' };
    const next = matcher.getNextExecution(schedule, timeSource.now());
    expect(next).toBe(timeSource.now() + 60000);
  });

  test('getNextExecution returns null if no schedule', () => {
    const schedule = {};
    const next = matcher.getNextExecution(schedule, timeSource.now());
    expect(next).toBeNull();
  });
});
