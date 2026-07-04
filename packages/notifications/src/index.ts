import { INotificationProvider, NotificationOptions } from '@loopwork-ai/contracts'
import { logger } from '@loopwork-ai/common'
import { CompositeNotificationProvider } from './composite-provider'

export class NotificationManager {
  private providers: Map<string, INotificationProvider> = new Map()

  /**
   * Register a notification provider
   */
  registerProvider(provider: INotificationProvider): void {
    if (this.providers.has(provider.name)) {
      logger.warn(`Notification provider "${provider.name}" is already registered. Overwriting.`)
    }
    this.providers.set(provider.name, provider)
    logger.debug(`Registered notification provider: ${provider.name}`)
  }

  /**
   * Get a registered provider by name
   */
  getProvider(name: string): INotificationProvider | undefined {
    return this.providers.get(name)
  }

  /**
   * Send a notification through all registered providers
   */
  async notifyAll(message: string, options?: NotificationOptions): Promise<void> {
    const promises = Array.from(this.providers.values()).map(provider => 
      provider.notify(message, options).catch(err => {
        logger.error(`Failed to send notification via ${provider.name}: ${err instanceof Error ? err.message : String(err)}`)
      })
    )
    await Promise.all(promises)
  }

  /**
   * Send a notification through a specific provider
   */
  async notify(providerName: string, message: string, options?: NotificationOptions): Promise<void> {
    const provider = this.providers.get(providerName)
    if (!provider) {
      throw new Error(`Notification provider "${providerName}" not found`)
    }
    await provider.notify(message, options)
  }

  /**
   * Get all registered provider names
   */
  getProviderNames(): string[] {
    return Array.from(this.providers.keys())
  }
}

/**
 * Default notification manager instance
 */
export const notificationManager = new NotificationManager()

export { CompositeNotificationProvider } from './composite-provider'
