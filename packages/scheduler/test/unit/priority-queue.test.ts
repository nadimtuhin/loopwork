import { describe, test, expect, beforeEach } from 'bun:test';
import { HeapPriorityQueue } from '../../src/implementations/priority-queue.js';

describe('HeapPriorityQueue', () => {
  let queue: HeapPriorityQueue<string>;

  beforeEach(() => {
    queue = new HeapPriorityQueue<string>();
  });

  test('enqueue adds item', () => {
    queue.enqueue('a', 1);
    expect(queue.size()).toBe(1);
    expect(queue.peek()).toBe('a');
  });

  test('dequeue returns highest priority', () => {
    queue.enqueue('low', 1);
    queue.enqueue('high', 10);
    queue.enqueue('medium', 5);

    expect(queue.dequeue()).toBe('high');
    expect(queue.dequeue()).toBe('medium');
    expect(queue.dequeue()).toBe('low');
  });

  test('peek does not remove item', () => {
    queue.enqueue('a', 1);
    expect(queue.peek()).toBe('a');
    expect(queue.size()).toBe(1);
  });

  test('isEmpty works correctly', () => {
    expect(queue.isEmpty()).toBe(true);
    queue.enqueue('a', 1);
    expect(queue.isEmpty()).toBe(false);
  });

  test('dequeue on empty returns null', () => {
    expect(queue.dequeue()).toBeNull();
  });
  
  test('FIFO for equal priorities', () => {
    queue.enqueue('first', 10);
    queue.enqueue('second', 10);
    
    expect(queue.dequeue()).toBe('first');
    expect(queue.dequeue()).toBe('second');
  });
});
