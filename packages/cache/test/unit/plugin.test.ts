import { describe, test, expect } from 'bun:test';
import { withCacheManager } from '../../src/plugin.js';

describe('Plugin', () => {
  test('creates plugin when enabled', () => {
    const result = withCacheManager({ enabled: true })({ plugins: [] });
    expect(result.plugins.length).toBe(1);
    expect(result.plugins[0].name).toBe('cache-manager');
  });

  test('skips when disabled', () => {
    const result = withCacheManager({ enabled: false })({ plugins: [] });
    expect(result.plugins).toEqual([]);
  });

  test('preserves existing plugins', () => {
    const existing = { name: 'other', onLoopStart: async () => {} };
    const result = withCacheManager({})({ plugins: [existing] });
    expect(result.plugins.length).toBe(2);
    expect(result.plugins[0]).toBe(existing);
  });
});
