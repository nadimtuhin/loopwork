/**
 * LocalEventBus Tests
 *
 * Unit tests ensuring events emitted are received by subscribers;
 * test unsubscription logic.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { LocalEventBus, createEvent } from '../src/local-bus'

describe('LocalEventBus', () => {
  let bus: LocalEventBus

  beforeEach(() => {
    bus = new LocalEventBus()
  })

  afterEach(() => {
    bus.clear()
  })

  describe('publish and subscribe', () => {
    test('should receive published events', async () => {
      const received: unknown[] = []
      const event = createEvent('test.topic', { message: 'hello' })

      bus.subscribe('test.topic', (e) => {
        received.push(e.payload)
      })

      await bus.publish('test.topic', event)

      expect(received).toHaveLength(1)
      expect(received[0]).toEqual({ message: 'hello' })
    })

    test('should support multiple subscribers for same topic', async () => {
      const received1: unknown[] = []
      const received2: unknown[] = []
      const event = createEvent('test.topic', { value: 42 })

      bus.subscribe('test.topic', (e) => {
        received1.push(e.payload)
      })

      bus.subscribe('test.topic', (e) => {
        received2.push(e.payload)
      })

      await bus.publish('test.topic', event)

      expect(received1).toHaveLength(1)
      expect(received2).toHaveLength(1)
    })

    test('should not receive events after unsubscribing', async () => {
      const received: unknown[] = []
      const event = createEvent('test.topic', { message: 'test' })

      const subscription = bus.subscribe('test.topic', (e) => {
        received.push(e.payload)
      })

      subscription.unsubscribe()

      await bus.publish('test.topic', event)

      expect(received).toHaveLength(0)
    })

    test('should track subscription as inactive after unsubscribe', () => {
      const subscription = bus.subscribe('test.topic', () => {})

      expect(subscription.isActive).toBe(true)

      subscription.unsubscribe()

      expect(subscription.isActive).toBe(false)
    })
  })

  describe('send method', () => {
    test('should deliver messages via send method', async () => {
      const received: unknown[] = []
      const event = createEvent('direct.message', { data: 'send-test' })

      bus.subscribe('direct.message', (e) => {
        received.push(e.payload)
      })

      await bus.send(event)

      expect(received).toHaveLength(1)
      expect(received[0]).toEqual({ data: 'send-test' })
    })
  })

  describe('wildcard patterns', () => {
    test('should support single segment wildcard (*)', async () => {
      const received: unknown[] = []

      bus.subscribeToPattern('user.*', (e) => {
        received.push(e.payload)
      })

      await bus.publish('user.created', createEvent('user.created', { id: 1 }))
      await bus.publish('user.updated', createEvent('user.updated', { id: 1 }))

      expect(received).toHaveLength(2)
    })

    test('should support multi-segment wildcard (**)', async () => {
      const received: unknown[] = []

      bus.subscribeToPattern('app.**', (e) => {
        received.push(e.payload)
      })

      await bus.publish('app.start', createEvent('app.start', {}))
      await bus.publish('app.user.profile.update', createEvent('app.user.profile.update', {}))

      expect(received).toHaveLength(2)
    })

    test('should not match patterns incorrectly', async () => {
      const received: unknown[] = []

      bus.subscribeToPattern('user.*', (e) => {
        received.push(e.payload)
      })

      await bus.publish('user.profile.created', createEvent('user.profile.created', {}))

      expect(received).toHaveLength(0)
    })
  })

  describe('event filters', () => {
    test('should filter events based on filter function', async () => {
      const received: unknown[] = []

      bus.subscribe(
        'filtered.topic',
        (e) => {
          received.push(e.payload)
        },
        (e) => (e.payload as { shouldReceive: boolean }).shouldReceive === true
      )

      await bus.publish('filtered.topic', createEvent('filtered.topic', { shouldReceive: true }))
      await bus.publish('filtered.topic', createEvent('filtered.topic', { shouldReceive: false }))

      expect(received).toHaveLength(1)
    })
  })

  describe('error handling', () => {
    test('should not crash bus when handler throws', async () => {
      bus.subscribe('error.topic', () => {
        throw new Error('Handler error')
      })

      const event = createEvent('error.topic', {})

      // Should not throw
      await expect(bus.publish('error.topic', event)).resolves.toBeUndefined()
    })

    test('should continue processing handlers after one fails', async () => {
      const received: unknown[] = []

      bus.subscribe('multi.topic', () => {
        throw new Error('First handler error')
      })

      bus.subscribe('multi.topic', (e) => {
        received.push(e.payload)
      })

      await bus.publish('multi.topic', createEvent('multi.topic', { value: 'second' }))

      expect(received).toHaveLength(1)
    })
  })

  describe('statistics', () => {
    test('should track messages sent and received', async () => {
      const received: unknown[] = []

      bus.subscribe('stats.topic', (e) => {
        received.push(e.payload)
      })

      await bus.publish('stats.topic', createEvent('stats.topic', { test: true }))
      await bus.publish('stats.topic', createEvent('stats.topic', { test: true }))

      const stats = bus.getStats()

      expect(stats.eventsPublished).toBe(2)
      expect(stats.messagesReceived).toBe(2)
    })

    test('should track active subscriptions', () => {
      const sub1 = bus.subscribe('topic1', () => {})
      const sub2 = bus.subscribe('topic2', () => {})
      const sub3 = bus.subscribe('topic2', () => {})

      const stats = bus.getStats()

      expect(stats.activeSubscriptions).toBe(3)

      sub2.unsubscribe()

      const updatedStats = bus.getStats()

      expect(updatedStats.activeSubscriptions).toBe(2)
    })
  })

  describe('active topics', () => {
    test('should return list of active topics', async () => {
      await bus.publish('topic.a', createEvent('topic.a', {}))
      await bus.publish('topic.b', createEvent('topic.b', {}))

      const topics = bus.getActiveTopics()

      expect(topics).toContain('topic.a')
      expect(topics).toContain('topic.b')
    })

    test('should return subscriber count for topic', async () => {
      bus.subscribe('count.topic', () => {})
      bus.subscribe('count.topic', () => {})

      const count = bus.getSubscriberCount('count.topic')

      expect(count).toBe(2)
    })

    test('should include pattern subscribers in count', async () => {
      bus.subscribe('count.topic', () => {})
      bus.subscribeToPattern('count.*', () => {})

      const count = bus.getSubscriberCount('count.topic')

      expect(count).toBe(2)
    })
  })

  describe('clear', () => {
    test('should remove all subscriptions', async () => {
      bus.subscribe('topic1', () => {})
      bus.subscribe('topic2', () => {})
      bus.subscribeToPattern('topic*', () => {})

      bus.clear()

      const stats = bus.getStats()
      expect(stats.activeSubscriptions).toBe(0)
    })

    test('should reset statistics', async () => {
      await bus.publish('test', createEvent('test', {}))

      bus.clear()

      const stats = bus.getStats()
      expect(stats.messagesSent).toBe(0)
      expect(stats.eventsPublished).toBe(0)
    })
  })

  describe('createEvent helper', () => {
    test('should create event with required fields', () => {
      const event = createEvent('test.topic', { data: 'test' })

      expect(event.id).toBeDefined()
      expect(event.topic).toBe('test.topic')
      expect(event.payload).toEqual({ data: 'test' })
      expect(event.timestamp).toBeDefined()
    })

    test('should include metadata when provided', () => {
      const event = createEvent('test.topic', { data: 'test' }, { source: 'test' })

      expect(event.metadata).toEqual({ source: 'test' })
    })
  })
})
