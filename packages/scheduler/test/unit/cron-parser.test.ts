import { describe, test, expect } from 'bun:test';
import { SimpleCronParser } from '../../src/implementations/cron-parser.js';

describe('SimpleCronParser', () => {
  const parser = new SimpleCronParser();

  test('parses valid cron expression', () => {
    const result = parser.parse('*/15 * * * *');
    expect(result).toEqual({
      minute: '*/15',
      hour: '*',
      dayOfMonth: '*',
      month: '*',
      dayOfWeek: '*'
    });
  });

  test('parses specific times', () => {
    const result = parser.parse('0 9 * * 1');
    expect(result).toEqual({
      minute: '0',
      hour: '9',
      dayOfMonth: '*',
      month: '*',
      dayOfWeek: '1'
    });
  });

  test('validates valid expressions', () => {
    expect(parser.isValid('*/15 * * * *')).toBe(true);
    expect(parser.isValid('0 9 * * 1')).toBe(true);
  });

  test('rejects invalid expressions', () => {
    expect(parser.isValid('invalid')).toBe(false);
    expect(parser.isValid('* * * *')).toBe(false); // Too short
    expect(parser.isValid('* * * * * *')).toBe(false); // Too long
    expect(parser.isValid('')).toBe(false);
  });

  test('handles ranges', () => {
    const result = parser.parse('0-30 * * * *');
    expect(result.minute).toBe('0-30');
  });

  test('handles lists', () => {
    const result = parser.parse('0,15,30,45 * * * *');
    expect(result.minute).toBe('0,15,30,45');
  });

  test('handles step values', () => {
    const result = parser.parse('*/10 * * * *');
    expect(result.minute).toBe('*/10');
  });

  test('throws error on invalid parse', () => {
    expect(() => parser.parse('invalid')).toThrow();
  });
});
