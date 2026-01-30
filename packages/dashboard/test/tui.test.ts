/**
 * Terminal UI Tests
 */

import { describe, test, expect } from 'bun:test';
import {
  getStatusColor,
  getStatusIcon,
  formatDuration,
  formatRelativeTime,
  createProgressBar,
  formatPercentage,
  truncate,
  padRight,
  center,
  formatTaskId,
  getConnectionStatus
} from '../src/tui/utils';

describe('TUI Utils', () => {
  describe('getStatusColor', () => {
    test('returns green for completed', () => {
      expect(getStatusColor('completed')).toBe('{green-fg}');
    });

    test('returns yellow for pending', () => {
      expect(getStatusColor('pending')).toBe('{yellow-fg}');
    });

    test('returns red for failed', () => {
      expect(getStatusColor('failed')).toBe('{red-fg}');
    });

    test('returns blue for in-progress', () => {
      expect(getStatusColor('in-progress')).toBe('{blue-fg}');
    });

    test('returns white for unknown status', () => {
      expect(getStatusColor('unknown')).toBe('{white-fg}');
    });
  });

  describe('getStatusIcon', () => {
    test('returns checkmark for completed', () => {
      expect(getStatusIcon('completed')).toBe('✓');
    });

    test('returns circle for pending', () => {
      expect(getStatusIcon('pending')).toBe('○');
    });

    test('returns X for failed', () => {
      expect(getStatusIcon('failed')).toBe('✗');
    });

    test('returns filled circle for in-progress', () => {
      expect(getStatusIcon('in-progress')).toBe('●');
    });

    test('returns dash for unknown', () => {
      expect(getStatusIcon('unknown')).toBe('-');
    });
  });

  describe('formatDuration', () => {
    test('formats seconds', () => {
      expect(formatDuration(5000)).toBe('5s');
    });

    test('formats minutes and seconds', () => {
      expect(formatDuration(125000)).toBe('2m 5s');
    });

    test('formats hours and minutes', () => {
      expect(formatDuration(3725000)).toBe('1h 2m');
    });

    test('handles zero', () => {
      expect(formatDuration(0)).toBe('0s');
    });

    test('handles undefined', () => {
      expect(formatDuration(undefined)).toBe('0s');
    });
  });

  describe('formatRelativeTime', () => {
    test('shows "just now" for recent timestamps', () => {
      const now = Date.now();
      expect(formatRelativeTime(now - 30000)).toBe('just now');
    });

    test('shows minutes ago', () => {
      const now = Date.now();
      expect(formatRelativeTime(now - 120000)).toBe('2m ago');
    });

    test('shows hours ago', () => {
      const now = Date.now();
      expect(formatRelativeTime(now - 7200000)).toBe('2h ago');
    });

    test('shows days ago', () => {
      const now = Date.now();
      expect(formatRelativeTime(now - 172800000)).toBe('2d ago');
    });
  });

  describe('createProgressBar', () => {
    test('creates empty bar when total is 0', () => {
      expect(createProgressBar(0, 0, 10)).toBe('░'.repeat(10));
    });

    test('creates full bar when current equals total', () => {
      expect(createProgressBar(10, 10, 10)).toBe('█'.repeat(10));
    });

    test('creates partial bar', () => {
      const bar = createProgressBar(5, 10, 10);
      expect(bar).toBe('█████░░░░░');
    });

    test('respects width parameter', () => {
      const bar = createProgressBar(1, 2, 20);
      expect(bar.length).toBe(20);
    });
  });

  describe('formatPercentage', () => {
    test('formats percentage with default decimals', () => {
      expect(formatPercentage(0.5)).toBe('50.0%');
    });

    test('formats percentage with custom decimals', () => {
      expect(formatPercentage(0.333, 2)).toBe('33.30%');
    });

    test('handles 0', () => {
      expect(formatPercentage(0)).toBe('0.0%');
    });

    test('handles 1', () => {
      expect(formatPercentage(1)).toBe('100.0%');
    });
  });

  describe('truncate', () => {
    test('truncates long text', () => {
      const text = 'This is a very long text that needs truncation';
      expect(truncate(text, 20)).toBe('This is a very lo...');
    });

    test('does not truncate short text', () => {
      const text = 'Short';
      expect(truncate(text, 20)).toBe('Short');
    });

    test('handles exact length', () => {
      const text = 'Exactly twenty chars';
      expect(truncate(text, 20)).toBe(text);
    });
  });

  describe('padRight', () => {
    test('pads text to width', () => {
      expect(padRight('Hello', 10)).toBe('Hello     ');
    });

    test('does not pad if already wide enough', () => {
      expect(padRight('Hello', 3)).toBe('Hello');
    });
  });

  describe('center', () => {
    test('centers text', () => {
      expect(center('Hi', 10)).toBe('    Hi    ');
    });

    test('handles odd padding', () => {
      const result = center('Hi', 11);
      expect(result.length).toBe(11);
    });
  });

  describe('formatTaskId', () => {
    test('wraps ID in brackets', () => {
      expect(formatTaskId('TASK-001')).toBe('[TASK-001]');
    });
  });

  describe('getConnectionStatus', () => {
    test('returns connected status', () => {
      const status = getConnectionStatus(true);
      expect(status.color).toBe('{green-fg}');
      expect(status.text).toBe('● Connected');
    });

    test('returns disconnected status', () => {
      const status = getConnectionStatus(false);
      expect(status.color).toBe('{red-fg}');
      expect(status.text).toBe('○ Disconnected');
    });
  });
});
