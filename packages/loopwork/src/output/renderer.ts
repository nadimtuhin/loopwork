/**
 * Output Renderer Interface
 *
 * Defines the contract for output rendering implementations.
 * Supports multiple output modes: Ink (TUI), JSON, silent, and human-readable.
 */

import type {
  OutputEvent,
  OutputEventSubscriber,
  OutputConfig,
  LogEvent,
} from './contracts'

/**
 * Output renderer interface - implemented by all renderers
 */
export interface OutputRenderer {
  readonly name: string
  readonly isSupported: boolean

  render(event: OutputEvent): void
  renderEvent(event: OutputEvent): void
  subscribe(subscriber: OutputEventSubscriber): () => void
  configure(config: Partial<OutputConfig>): void
  dispose(): void
}

/**
 * Renderer factory type
 */
export type RendererFactory = (config?: OutputConfig) => OutputRenderer

/**
 * Base renderer class with common functionality
 */
export abstract class BaseRenderer implements OutputRenderer {
  abstract readonly name: string
  abstract readonly isSupported: boolean

  protected config: OutputConfig
  protected subscribers: Set<OutputEventSubscriber> = new Set()
  protected disposed = false

  constructor(config: OutputConfig) {
    this.config = config
  }

  abstract render(event: OutputEvent): void

  renderEvent(event: OutputEvent): void {
    if (this.disposed) return

    // Filter log events based on configured log level
    if (event.type === 'log') {
      const logEvent = event as LogEvent
      if (!this.shouldLog(logEvent.level)) {
        return
      }
    }

    this.render(event)
    this.notifySubscribers(event)
  }

  subscribe(subscriber: OutputEventSubscriber): () => void {
    this.subscribers.add(subscriber)
    return () => {
      this.subscribers.delete(subscriber)
    }
  }

  configure(config: Partial<OutputConfig>): void {
    this.config = { ...this.config, ...config }
  }

  dispose(): void {
    this.disposed = true
    this.subscribers.clear()
  }

  protected notifySubscribers(event: OutputEvent): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(event)
      } catch {
        // Ignore subscriber errors
      }
    }
  }

  protected shouldLog(level: string): boolean {
    const levels = ['trace', 'debug', 'info', 'warn', 'error', 'silent']
    const configLevel = this.config.logLevel || 'info'
    const eventLevelIndex = levels.indexOf(level)
    const configLevelIndex = levels.indexOf(configLevel)
    return eventLevelIndex >= configLevelIndex
  }
}
