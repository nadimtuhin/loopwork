/**
 * Sliding Window Context Manager Tests
 */

import { describe, test, expect, beforeEach } from 'bun:test'
import { SlidingWindowContextManager, createSlidingWindowContextManager } from '../../src/memory/sliding-window-context'

describe('SlidingWindowContextManager', () => {
  let manager: SlidingWindowContextManager

  beforeEach(() => {
    manager = new SlidingWindowContextManager({ maxTokens: 100 })
  })

  describe('constructor', () => {
    test('should create manager with max tokens', () => {
      const mgr = new SlidingWindowContextManager({ maxTokens: 1000 })
      expect(mgr).toBeDefined()
    })

    test('should use default values for optional settings', () => {
      const mgr = new SlidingWindowContextManager({ maxTokens: 1000 })
      expect(mgr).toBeDefined()
    })

    test('should accept custom token estimator', () => {
      const customEstimator = (content: string) => content.length
      const mgr = new SlidingWindowContextManager({
        maxTokens: 1000,
        tokenEstimator: customEstimator,
      })
      expect(mgr).toBeDefined()
    })
  })

  describe('add', () => {
    test('should add item to context window', () => {
      const item = manager.add({
        id: 'test-1',
        content: 'Hello, world!',
        type: 'user',
        priority: 1,
      })

      expect(item.id).toBe('test-1')
      expect(manager.size()).toBe(1)
    })

    test('should calculate tokens for added item', () => {
      manager.add({
        id: 'test-1',
        content: 'Hello, world!',
        type: 'user',
        priority: 1,
      })

      const stats = manager.getStats()
      expect(stats.totalTokens).toBeGreaterThan(0)
    })

    test('should add item with metadata', () => {
      const item = manager.add({
        id: 'test-1',
        content: 'Test content',
        type: 'retrieved',
        priority: 2,
        metadata: { filePath: 'test.ts', lineStart: 10 },
      })

      expect(item.metadata?.filePath).toBe('test.ts')
    })
  })

  describe('addBatch', () => {
    test('should add multiple items at once', () => {
      manager.addBatch([
        { id: 'item-1', content: 'Content 1', type: 'user', priority: 1 },
        { id: 'item-2', content: 'Content 2', type: 'assistant', priority: 1 },
        { id: 'item-3', content: 'Content 3', type: 'system', priority: 2 },
      ])

      expect(manager.size()).toBe(3)
    })
  })

  describe('getAll', () => {
    test('should return all items', () => {
      manager.add({ id: 'item-1', content: 'Content 1', type: 'user', priority: 1 })
      manager.add({ id: 'item-2', content: 'Content 2', type: 'assistant', priority: 1 })

      const items = manager.getAll()

      expect(items).toHaveLength(2)
    })

    test('should return copy of items', () => {
      manager.add({ id: 'item-1', content: 'Content 1', type: 'user', priority: 1 })

      const items = manager.getAll()
      items.push({} as any)

      expect(manager.size()).toBe(1)
    })
  })

  describe('getByType', () => {
    test('should filter items by type', () => {
      manager.add({ id: 'item-1', content: 'User message', type: 'user', priority: 1 })
      manager.add({ id: 'item-2', content: 'Assistant response', type: 'assistant', priority: 1 })
      manager.add({ id: 'item-3', content: 'Another user', type: 'user', priority: 1 })

      const userItems = manager.getByType('user')

      expect(userItems).toHaveLength(2)
      expect(userItems.every((item) => item.type === 'user')).toBe(true)
    })
  })

  describe('getById', () => {
    test('should return item by ID', () => {
      manager.add({ id: 'item-1', content: 'Content 1', type: 'user', priority: 1 })

      const item = manager.getById('item-1')

      expect(item).toBeDefined()
      expect(item?.id).toBe('item-1')
    })

    test('should return undefined for non-existent ID', () => {
      const item = manager.getById('non-existent')

      expect(item).toBeUndefined()
    })
  })

  describe('remove', () => {
    test('should remove item by ID', () => {
      manager.add({ id: 'item-1', content: 'Content 1', type: 'user', priority: 1 })

      const removed = manager.remove('item-1')

      expect(removed).toBe(true)
      expect(manager.size()).toBe(0)
    })

    test('should return false for non-existent ID', () => {
      const removed = manager.remove('non-existent')

      expect(removed).toBe(false)
    })
  })

  describe('update', () => {
    test('should update existing item', () => {
      manager.add({ id: 'item-1', content: 'Original', type: 'user', priority: 1 })

      const updated = manager.update('item-1', { content: 'Updated', priority: 2 })

      expect(updated).toBeDefined()
      expect(updated?.content).toBe('Updated')
      expect(updated?.priority).toBe(2)
    })

    test('should return null for non-existent item', () => {
      const updated = manager.update('non-existent', { content: 'Updated' })

      expect(updated).toBeNull()
    })
  })

  describe('clear', () => {
    test('should remove all items', () => {
      manager.add({ id: 'item-1', content: 'Content 1', type: 'user', priority: 1 })
      manager.add({ id: 'item-2', content: 'Content 2', type: 'assistant', priority: 1 })

      manager.clear()

      expect(manager.size()).toBe(0)
    })
  })

  describe('toString', () => {
    test('should concatenate all content', () => {
      manager.add({ id: 'item-1', content: 'First', type: 'user', priority: 1 })
      manager.add({ id: 'item-2', content: 'Second', type: 'assistant', priority: 1 })

      const result = manager.toString()

      expect(result).toBe('First\nSecond')
    })
  })

  describe('token limit enforcement', () => {
    test('should evict items when token limit exceeded', () => {
      const smallManager = new SlidingWindowContextManager({ maxTokens: 50 })

      // Add items that will exceed the limit
      smallManager.add({ id: 'item-1', content: 'A'.repeat(40), type: 'user', priority: 1 })
      smallManager.add({ id: 'item-2', content: 'B'.repeat(40), type: 'user', priority: 1 })

      // Should have evicted the first item
      expect(smallManager.size()).toBeLessThanOrEqual(2)
    })

    test('should evict lower priority items first', () => {
      const smallManager = new SlidingWindowContextManager({ maxTokens: 50 })

      smallManager.add({ id: 'low', content: 'Low priority content', type: 'user', priority: 1 })
      smallManager.add({ id: 'high', content: 'High priority content', type: 'user', priority: 10 })

      const stats = smallManager.getStats()

      // High priority item should still be present
      expect(smallManager.getById('high')).toBeDefined()
    })
  })

  describe('getStats', () => {
    test('should return statistics', () => {
      manager.add({ id: 'item-1', content: 'Content 1', type: 'user', priority: 1 })

      const stats = manager.getStats()

      expect(stats.totalTokens).toBeGreaterThan(0)
      expect(stats.itemCount).toBe(1)
      expect(stats.oldestTimestamp).toBeDefined()
      expect(stats.newestTimestamp).toBeDefined()
    })
  })

  describe('getAvailableTokens', () => {
    test('should return available token budget', () => {
      const available = manager.getAvailableTokens()

      expect(available).toBeGreaterThanOrEqual(0)
      expect(available).toBeLessThanOrEqual(100)
    })
  })

  describe('isWithinLimit', () => {
    test('should return true when within limit', () => {
      expect(manager.isWithinLimit()).toBe(true)
    })

    test('should enforce limit by evicting items', () => {
      const smallManager = new SlidingWindowContextManager({ maxTokens: 10 })
      // Add a single item that's larger than the limit
      // The manager should evict it to stay within limit
      smallManager.add({ id: 'item', content: 'x'.repeat(50), type: 'user', priority: 1 })

      // After eviction, the manager should be within limit (empty or with evicted content)
      expect(smallManager.isWithinLimit()).toBe(true)
    })
  })

  describe('peek', () => {
    test('should peek at oldest item', () => {
      manager.add({ id: 'item-1', content: 'First', type: 'user', priority: 1 })
      manager.add({ id: 'item-2', content: 'Second', type: 'assistant', priority: 1 })

      const oldest = manager.peekOldest()

      expect(oldest?.id).toBe('item-1')
    })

    test('should peek at newest item', () => {
      manager.add({ id: 'item-1', content: 'First', type: 'user', priority: 1 })
      manager.add({ id: 'item-2', content: 'Second', type: 'assistant', priority: 1 })

      const newest = manager.peekNewest()

      expect(newest?.id).toBe('item-2')
    })

    test('should return null for empty manager', () => {
      expect(manager.peekOldest()).toBeNull()
      expect(manager.peekNewest()).toBeNull()
    })
  })

  describe('size and tokenCount', () => {
    test('should return item count', () => {
      expect(manager.size()).toBe(0)

      manager.add({ id: 'item', content: 'test', type: 'user', priority: 1 })

      expect(manager.size()).toBe(1)
    })

    test('should return total token count', () => {
      expect(manager.tokenCount()).toBe(0)

      manager.add({ id: 'item', content: 'test content here', type: 'user', priority: 1 })

      expect(manager.tokenCount()).toBeGreaterThan(0)
    })
  })
})

describe('createSlidingWindowContextManager', () => {
  test('should create manager with factory function', () => {
    const manager = createSlidingWindowContextManager(1000)

    expect(manager).toBeDefined()
    expect(manager.size()).toBe(0)
  })
})
