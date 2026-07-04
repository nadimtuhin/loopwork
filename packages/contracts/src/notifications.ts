/**
 * Notification System Contracts
 *
 * Core interfaces and types for notification providers
 */

export interface NotificationOptions {
  /** Title of the notification */
  title?: string

  /** Priority level */
  priority?: 'low' | 'normal' | 'high'

  /** Metadata for the notification */
  metadata?: Record<string, unknown>

  /** Optional link or URL associated with the notification */
  url?: string
}

/**
 * Interface for notification providers (Telegram, Discord, Slack, etc.)
 */
export interface INotificationProvider {
  /** Unique name of the provider */
  readonly name: string

  /**
   * Send a notification
   *
   * @param message - The notification message content
   * @param options - Optional configuration for the notification
   */
  notify(message: string, options?: NotificationOptions): Promise<void>

  /**
   * Check if the provider is properly configured and reachable
   */
  verify(): Promise<boolean>
}
