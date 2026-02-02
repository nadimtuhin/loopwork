import { describe, test, expect } from 'bun:test';
import { withScheduler } from '../../src/plugin.js';

describe('Scheduler Plugin', () => {
  test('creates plugin when enabled', () => {
    const result = withScheduler({})({ plugins: [] });
    expect(result.plugins.length).toBe(1);
    expect(result.plugins[0].name).toBe('task-scheduler');
  });

  test('skips when disabled', () => {
    const result = withScheduler({ enabled: false })({ plugins: [] });
    expect(result.plugins).toEqual([]);
  });

  test('preserves existing plugins', () => {
    const existing = { name: 'other', onLoopStart: async () => {} };
    const result = withScheduler({})({ plugins: [existing] });
    expect(result.plugins.length).toBe(2);
  });
});
