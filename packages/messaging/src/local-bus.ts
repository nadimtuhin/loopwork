/**
 * Local Event Bus Implementation
 *
 * Wraps Node.js EventEmitter to provide the strict IEventBus interface.
 * Supports typed event emission and handling with wildcard pattern matching.
 */

import { randomUUID } from 'crypto'
import { EventEmitter } from 'events'
import type {
  InternalEvent,
  EventHandler,
  EventSubscription,
  EventFilter,
  MessageBusStats,
  IEventBus,
  EventBusOptions,
  TopicMatch,
} from '@loopwork-ai/contracts'
import { matchTopicPattern } from '@loopwork-ai/contracts'

/**
 * LocalEventBus - Event emitter based event bus implementation
 *
 * Wraps Node.js EventEmitter (polyfilled in Bun) to implement IEventBus.
 * Provides typed event emission and handling with wildcard support.
 */
export class LocalEventBus implements IEventBus {
  private emitter: EventEmitter
  private stats: MessageBusStats
  private subscriptions: Map<string, SubscriptionRecord[]>
  private patternSubscriptions: Map<string, SubscriptionRecord[]>
  private activeTopics: Set<string>
  private options: Required<EventBusOptions>

  /**
   * Create a new LocalEventBus
   *
   * @param options - Configuration options for the event bus
   */
  constructor(options: EventBusOptions = {}) {
    this.emitter = new EventEmitter()

    // Set default options
    this.options = {
      maxQueueSize: options.maxQueueSize ?? 1000,
      enableLogging: options.enableLogging ?? false,
      enableWildcards: options.enableWildcards ?? true,
      maxHandlersPerTopic: options.maxHandlersPerTopic ?? 10,
      singleWildcard: options.singleWildcard ?? '*',
      multiWildcard: options.multiWildcard ?? '**',
      enableParams: options.enableParams ?? false,
    }

    // Initialize stats
    this.stats = {
      messagesSent: 0,
      messagesReceived: 0,
      activeSubscriptions: 0,
      eventsPublished: 0,
    }

    // Initialize subscription tracking
    this.subscriptions = new Map()
    this.patternSubscriptions = new Map()
    this.activeTopics = new Set()

    // Set max listeners to prevent memory leaks warnings
    this.emitter.setMaxListeners(this.options.maxHandlersPerTopic * 10)

    // Handle errors in event listeners to prevent bus crashes
    this.emitter.on('error', (error: Error) => {
      if (this.options.enableLogging) {
        console.warn('[LocalEventBus] Listener error:', error.message)
      }
    })

    // Enable warning for memory leaks from forgotten listeners
    this.emitter.on('newListener', (eventName: string) => {
      const listenerCount = this.emitter.listenerCount(eventName)
      if (listenerCount > this.options.maxHandlersPerTopic) {
        console.warn(
          `[LocalEventBus] Potential memory leak: ${eventName} has ${listenerCount} listeners`
        )
      }
    })
  }

  /**
   * Send a message to a specific recipient
   */
  async send<TPayload = unknown>(event: InternalEvent<TPayload>): Promise<void> {
    this.stats.messagesSent++

    const topic = event.topic
    this.activeTopics.add(topic)

    const handlers = this.subscriptions.get(topic) || []
    for (const record of handlers) {
      // Apply filter if present
      if (record.filter && !record.filter(event)) {
        continue
      }

      try {
        await record.handler(event)
        this.stats.messagesReceived++
      } catch (error) {
        if (this.options.enableLogging) {
          console.error(`[LocalEventBus] Handler error for ${topic}:`, error)
        }
      }
    }
  }

  /**
   * Publish an event to a specific topic
   */
  async publish<TPayload = unknown>(
    topic: string,
    event: InternalEvent<TPayload>
  ): Promise<void> {
    this.stats.eventsPublished++

    this.activeTopics.add(topic)

    // Emit to exact topic listeners
    const handlers = this.subscriptions.get(topic) || []
    for (const record of handlers) {
      // Apply filter if present
      if (record.filter && !record.filter(event)) {
        continue
      }

      try {
        await record.handler(event)
        this.stats.messagesReceived++
      } catch (error) {
        if (this.options.enableLogging) {
          console.error(`[LocalEventBus] Handler error for ${topic}:`, error)
        }
      }
    }

    // Emit to pattern subscribers if wildcards enabled
    if (this.options.enableWildcards) {
      for (const [pattern, patternHandlers] of this.patternSubscriptions) {
        const match = matchTopicPattern(
          pattern,
          topic,
          this.options.singleWildcard,
          this.options.multiWildcard
        )

        if (match.matched) {
          for (const record of patternHandlers) {
            // Apply filter if present
            if (record.filter && !record.filter(event)) {
              continue
            }

            try {
              // Add match info to event metadata
              const enrichedEvent: InternalEvent<TPayload> = {
                ...event,
                metadata: {
                  ...event.metadata,
                  patternMatch: match,
                },
              }
              await record.handler(enrichedEvent)
              this.stats.messagesReceived++
            } catch (error) {
              if (this.options.enableLogging) {
                console.error(
                  `[LocalEventBus] Pattern handler error for ${pattern}:`,
                  error
                )
              }
            }
          }
        }
      }
    }
  }

  /**
   * Subscribe to messages for a specific topic
   */
  subscribe<TPayload = unknown>(
    topic: string,
    handler: EventHandler<TPayload>,
    filter?: EventFilter<TPayload>
  ): EventSubscription {
    const record: SubscriptionRecord = {
      handler: handler as EventHandler,
      filter: filter as EventFilter,
      isActive: true,
    }

    // Add to subscriptions map
    const handlers = this.subscriptions.get(topic) || []
    handlers.push(record)
    this.subscriptions.set(topic, handlers)

    // Add to EventEmitter for exact topic
    this.emitter.on(topic, this.createEventHandler(record))

    this.stats.activeSubscriptions++

    return {
      unsubscribe: () => {
        if (!record.isActive) return

        record.isActive = false

        // Remove from subscriptions map
        const topicHandlers = this.subscriptions.get(topic)
        if (topicHandlers) {
          const index = topicHandlers.indexOf(record)
          if (index !== -1) {
            topicHandlers.splice(index, 1)
          }
          if (topicHandlers.length === 0) {
            this.subscriptions.delete(topic)
          }
        }

        // Remove from EventEmitter
        this.emitter.off(topic, this.createEventHandler(record))

        this.stats.activeSubscriptions--
      },
      get isActive() {
        return record.isActive
      },
    }
  }

  /**
   * Subscribe to a topic pattern (supports wildcards)
   */
  subscribeToPattern<TPayload = unknown>(
    pattern: string,
    handler: EventHandler<TPayload>,
    filter?: EventFilter<TPayload>
  ): EventSubscription {
    if (!this.options.enableWildcards) {
      throw new Error('Wildcard patterns are not enabled')
    }

    const record: SubscriptionRecord = {
      handler: handler as EventHandler,
      filter: filter as EventFilter,
      isActive: true,
    }

    // Add to pattern subscriptions
    const handlers = this.patternSubscriptions.get(pattern) || []
    handlers.push(record)
    this.patternSubscriptions.set(pattern, handlers)

    this.stats.activeSubscriptions++

    return {
      unsubscribe: () => {
        if (!record.isActive) return

        record.isActive = false

        const patternHandlers = this.patternSubscriptions.get(pattern)
        if (patternHandlers) {
          const index = patternHandlers.indexOf(record)
          if (index !== -1) {
            patternHandlers.splice(index, 1)
          }
          if (patternHandlers.length === 0) {
            this.patternSubscriptions.delete(pattern)
          }
        }

        this.stats.activeSubscriptions--
      },
      get isActive() {
        return record.isActive
      },
    }
  }

  /**
   * Get current bus statistics
   */
  getStats(): MessageBusStats {
    return { ...this.stats }
  }

  /**
   * Clear all subscriptions
   */
  clear(): void {
    this.emitter.removeAllListeners()
    this.subscriptions.clear()
    this.patternSubscriptions.clear()
    this.activeTopics.clear()
    this.stats = {
      messagesSent: 0,
      messagesReceived: 0,
      activeSubscriptions: 0,
      eventsPublished: 0,
    }
  }

  /**
   * Get all active topics
   */
  getActiveTopics(): string[] {
    return Array.from(this.activeTopics)
  }

  /**
   * Get subscriber count for a topic
   */
  getSubscriberCount(topic: string): number {
    const exactCount = this.emitter.listenerCount(topic)
    let patternCount = 0

    if (this.options.enableWildcards) {
      for (const pattern of this.patternSubscriptions.keys()) {
        const match = matchTopicPattern(
          pattern,
          topic,
          this.options.singleWildcard,
          this.options.multiWildcard
        )
        if (match.matched) {
          patternCount += this.patternSubscriptions.get(pattern)?.length || 0
        }
      }
    }

    return exactCount + patternCount
  }

  /**
   * Create a wrapped event handler with error handling
   */
  private createEventHandler(record: SubscriptionRecord): (...args: unknown[]) => void {
    return async (...args: unknown[]) => {
      if (!record.isActive) return

      const event = args[0] as InternalEvent

      // Apply filter if present
      if (record.filter && !record.filter(event)) {
        return
      }

      try {
        await record.handler(event)
      } catch (error) {
        if (this.options.enableLogging) {
          console.error('[LocalEventBus] Handler error:', error)
        }
        // Don't rethrow - prevent bus crashes
      }
    }
  }
}

/**
 * Subscription record for tracking
 */
interface SubscriptionRecord {
  handler: EventHandler
  filter?: EventFilter
  isActive: boolean
}

/**
 * Create an InternalEvent with auto-generated ID and timestamp
 *
 * @param topic - Event topic
 * @param payload - Event payload data
 * @param metadata - Optional metadata
 * @returns A new InternalEvent
 */
export function createEvent<TPayload = unknown>(
  topic: string,
  payload: TPayload,
  metadata?: Record<string, unknown>
): InternalEvent<TPayload> {
  return {
    id: randomUUID(),
    topic,
    payload,
    timestamp: Date.now(),
    metadata,
  }
}
