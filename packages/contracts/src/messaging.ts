/**
 * Messaging System Contracts
 *
 * Core interfaces and types for decoupled messaging and event handling
 */

/**
 * Base event type with generic payload support
 */
export interface InternalEvent<TPayload = unknown> {
  /** Unique identifier for the event */
  id: string

  /** Event topic (supports wildcard matching) */
  topic: string

  /** Event payload data */
  payload: TPayload

  /** Timestamp when event was created */
  timestamp: number

  /** Optional metadata */
  metadata?: Record<string, unknown>
}

/**
 * Event handler function type
 */
export type EventHandler<TPayload = unknown> = (event: InternalEvent<TPayload>) => void | Promise<void>

/**
 * Event subscription that can be cancelled
 */
export interface EventSubscription {
  /** Unsubscribe from the event */
  unsubscribe: () => void

  /** Check if subscription is still active */
  readonly isActive: boolean
}

/**
 * Event filter for selective subscriptions
 */
export type EventFilter<TPayload = unknown> = (event: InternalEvent<TPayload>) => boolean

/**
 * Message bus statistics
 */
export interface MessageBusStats {
  /** Total messages sent */
  messagesSent: number

  /** Total messages received */
  messagesReceived: number

  /** Number of active subscriptions */
  activeSubscriptions: number

  /** Number of events published */
  eventsPublished: number
}

/**
 * Configuration options for message/event buses
 */
export interface BusOptions {
  /** Maximum queue size for messages */
  maxQueueSize?: number

  /** Enable debug logging */
  enableLogging?: boolean

  /** Enable topic wildcard support */
  enableWildcards?: boolean

  /** Maximum number of handlers per topic */
  maxHandlersPerTopic?: number
}

/**
 * Message Bus - General communication interface
 *
 * Handles point-to-point and broadcast messaging between components
 */
export interface IMessageBus {
  /**
   * Send a message to a specific recipient
   */
  send<TPayload = unknown>(event: InternalEvent<TPayload>): Promise<void>

  /**
   * Subscribe to messages for a specific topic
   */
  subscribe<TPayload = unknown>(
    topic: string,
    handler: EventHandler<TPayload>,
    filter?: EventFilter<TPayload>
  ): EventSubscription

  /**
   * Get current bus statistics
   */
  getStats(): MessageBusStats

  /**
   * Clear all subscriptions
   */
  clear(): void
}

/**
 * Event Bus - Pub/Sub interface with topic routing
 *
 * Supports hierarchical topics with wildcard matching:
 * - `app.user.created` - matches exactly
 * - `app.user.*` - matches `app.user.created`, `app.user.updated`, etc.
 * - `app.**` - matches all topics starting with `app.`
 */
export interface IEventBus extends IMessageBus {
  /**
   * Publish an event to a specific topic
   * Multiple subscribers can receive the same event
   */
  publish<TPayload = unknown>(topic: string, event: InternalEvent<TPayload>): Promise<void>

  /**
   * Subscribe to a topic pattern (supports wildcards)
   *
   * Wildcard patterns:
   * - `*` - matches single segment (e.g., `user.*` matches `user.created` but not `user.profile.created`)
   * - `**` - matches zero or more segments (e.g., `user.**` matches `user.created` and `user.profile.created`)
   */
  subscribeToPattern<TPayload = unknown>(
    pattern: string,
    handler: EventHandler<TPayload>,
    filter?: EventFilter<TPayload>
  ): EventSubscription

  /**
   * Get all active topics
   */
  getActiveTopics(): string[]

  /**
   * Get subscriber count for a topic
   */
  getSubscriberCount(topic: string): number
}

/**
 * Wildcard matching utility types
 */
export type WildcardPattern = string

/**
 * Topic matching modes
 */
export enum TopicMatchMode {
  /** Exact match only */
  EXACT = 'exact',

  /** Single segment wildcard (*) */
  SINGLE = 'single',

  /** Multi-segment wildcard (**) */
  MULTI = 'multi'
}

/**
 * Topic match result
 */
export interface TopicMatch {
  /** Whether the pattern matched */
  matched: boolean

  /** Match mode used */
  mode: TopicMatchMode

  /** Extracted parameters from wildcard matches */
  params?: Record<string, string>
}

/**
 * Event bus configuration with wildcard settings
 */
export interface EventBusOptions extends BusOptions {
  /** Default wildcard character for single-segment matches */
  singleWildcard?: string

  /** Default wildcard character for multi-segment matches */
  multiWildcard?: string

  /** Enable parameter extraction from wildcard matches */
  enableParams?: boolean
}

/**
 * Default wildcard characters
 */
export const DEFAULT_SINGLE_WILDCARD = '*'
export const DEFAULT_MULTI_WILDCARD = '**'

/**
 * Helper function to match topic patterns
 *
 * @param pattern - Pattern with wildcards (e.g., `user.*`, `app.**`)
 * @param topic - Topic to match against (e.g., `user.created`, `app.user.created`)
 * @returns Match result with mode and extracted parameters
 */
export function matchTopicPattern(
  pattern: string,
  topic: string,
  singleWildcard: string = DEFAULT_SINGLE_WILDCARD,
  multiWildcard: string = DEFAULT_MULTI_WILDCARD
): TopicMatch {
  // Exact match
  if (pattern === topic) {
    return { matched: true, mode: TopicMatchMode.EXACT }
  }

  const patternSegments = pattern.split('.')
  const topicSegments = topic.split('.')

  // Multi-wildcard (**) - matches zero or more segments
  const multiIndex = patternSegments.indexOf(multiWildcard)
  if (multiIndex !== -1) {
    // Check if prefix matches
    const prefixMatches = patternSegments.slice(0, multiIndex).every((seg, i) => seg === topicSegments[i])

    // Check if suffix matches (if there are segments after **)
    const suffixSegments = patternSegments.slice(multiIndex + 1)
    let suffixMatches = true
    let params: Record<string, string> | undefined

    if (suffixSegments.length > 0) {
      const requiredLength = multiIndex + suffixSegments.length
      if (topicSegments.length >= requiredLength) {
        suffixMatches = suffixSegments.every(
          (seg, i) => seg === topicSegments[topicSegments.length - suffixSegments.length + i]
        )

        // Extract captured segments as parameters
        const capturedSegments = topicSegments.slice(multiIndex, topicSegments.length - suffixSegments.length)
        if (capturedSegments.length > 0) {
          params = { captured: capturedSegments.join('.') }
        }
      } else {
        suffixMatches = false
      }
    } else {
      // No suffix, capture all remaining segments
      const capturedSegments = topicSegments.slice(multiIndex)
      if (capturedSegments.length > 0) {
        params = { captured: capturedSegments.join('.') }
      }
    }

    if (prefixMatches && suffixMatches) {
      return { matched: true, mode: TopicMatchMode.MULTI, params }
    }
  }

  // Single-wildcard (*) - matches exactly one segment
  if (patternSegments.length !== topicSegments.length) {
    return { matched: false, mode: TopicMatchMode.EXACT }
  }

  let hasWildcard = false
  let params: Record<string, string> | undefined

  for (let i = 0; i < patternSegments.length; i++) {
    if (patternSegments[i] === singleWildcard) {
      hasWildcard = true
      if (!params) params = {}
      params[`seg${i}`] = topicSegments[i]
    } else if (patternSegments[i] !== topicSegments[i]) {
      return { matched: false, mode: TopicMatchMode.EXACT }
    }
  }

  if (hasWildcard) {
    return { matched: true, mode: TopicMatchMode.SINGLE, params }
  }

  return { matched: false, mode: TopicMatchMode.EXACT }
}
