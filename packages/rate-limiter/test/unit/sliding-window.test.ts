import { describe, test, expect } from 'bun:test';
import { createSlidingWindow } from '../../src/factories';

describe('SlidingWindow', () => {
  test('should allow requests within window', () => {
    const window = createSlidingWindow({ limit: 5, windowMs: 60000 });
    expect(window.allow()).toBe(true);
  });

  test('should deny requests exceeding limit', () => {
    const window = createSlidingWindow({ limit: 2, windowMs: 60000 });
    expect(window.allow()).toBe(true);
    expect(window.allow()).toBe(true);
    expect(window.allow()).toBe(false);
  });

  test('should slide window over time', () => {
    let currentTime = 1000;
    const timeSource = { now: () => currentTime };
    const window = createSlidingWindow({ limit: 2, windowMs: 1000 }, timeSource);

    expect(window.allow()).toBe(true);
    expect(window.allow()).toBe(true);
    expect(window.allow()).toBe(false);

    currentTime = 2100;
    
    expect(window.allow()).toBe(true);
    expect(window.allow()).toBe(true);
    expect(window.allow()).toBe(false);
  });

  test('should count only recent requests', () => {
    let currentTime = 1000;
    const timeSource = { now: () => currentTime };
    const window = createSlidingWindow({ limit: 5, windowMs: 1000 }, timeSource);

    window.allow();
    expect(window.getCount()).toBe(1);

    currentTime = 1500;
    window.allow();
    expect(window.getCount()).toBe(2);

    currentTime = 2100;
    expect(window.getCount()).toBe(1);
  });

  test('should handle window boundaries correctly', () => {
    let currentTime = 1000;
    const timeSource = { now: () => currentTime };
    const window = createSlidingWindow({ limit: 2, windowMs: 1000 }, timeSource);

    window.allow();
    
    currentTime = 1999;
    window.allow();
    
    expect(window.allow()).toBe(false);

    currentTime = 2000;
    expect(window.allow()).toBe(true);
  });

  test('should support different window sizes', () => {
    let currentTime = 0;
    const timeSource = { now: () => currentTime };
    const window = createSlidingWindow({ limit: 10, windowMs: 500 }, timeSource);

    window.allow();
    
    currentTime = 501;
    expect(window.getCount()).toBe(0);
  });

  test('should handle high-frequency requests', () => {
    const window = createSlidingWindow({ limit: 1000, windowMs: 1000 });
    for (let i = 0; i < 1000; i++) {
      expect(window.allow()).toBe(true);
    }
    expect(window.allow()).toBe(false);
  });

  test('should calculate accurate remaining capacity', () => {
     const limit = 5;
     const window = createSlidingWindow({ limit, windowMs: 1000 });
     
     expect(window.getCount()).toBe(0);
     window.allow();
     expect(window.getCount()).toBe(1);
     expect(limit - window.getCount()).toBe(4);
  });
});
