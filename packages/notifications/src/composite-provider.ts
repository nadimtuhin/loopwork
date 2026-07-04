import type { INotificationProvider, NotificationOptions } from '@loopwork-ai/contracts'
import { logger } from '@loopwork-ai/common'

/**
 * CompositeNotificationProvider aggregates multiple notification channels
 * and broadcasts messages to all of them.
 *
 * One provider failing does not stop others - errors are logged and aggregated.
 */
export class CompositeNotificationProvider implements INotificationProvider {
  readonly name = 'composite'

  private readonly providers: INotificationProvider[] = []

  /**
   * Add a provider to the composite
   */
  addProvider(provider: INotificationProvider): void {
    this.providers.push(provider)
    logger.debug(`Added notification provider to composite: ${provider.name}`)
  }

  /**
   * Remove a provider from the composite by name
   */
  removeProvider(name: string): boolean {
    const index = this.providers.findIndex(p => p.name === name)
    if (index === -1) {
      return false
    }
    this.providers.splice(index, 1)
    logger.debug(`Removed notification provider from composite: ${name}`)
    return true
  }

  /**
   * Get all registered provider names
   */
  getProviderNames(): string[] {
    return this.providers.map(p => p.name)
  }

  /**
   * Get the count of registered providers
   */
  getProviderCount(): number {
    return this.providers.length
  }

  /**
   * Send a notification to all registered providers.
   * One provider failing does not stop others.
   */
  async notify(message: string, options?: NotificationOptions): Promise<void> {
    if (this.providers.length === 0) {
      logger.warn('No notification providers registered in composite provider')
      return
    }

    const results = await Promise.allSettled(
      this.providers.map(provider =>
        provider.notify(message, options).catch(err => {
          logger.error(
            `Notification provider "${provider.name}" failed: ${
              err instanceof Error ? err.message : String(err)
            }`
          )
          return { provider: provider.name, error: err }
        })
      )
    )

    const failures = results.filter(
      (r): r is PromiseRejectedResult =>
        r.status === 'rejected' || (r as { error?: unknown }).error !== undefined
    )

    if (failures.length > 0) {
      logger.warn(
        `${failures.length}/${this.providers.length} notification providers failed`
      )
    }
  }

  /**
   * Verify all registered providers are properly configured.
   * Returns true only if all providers verify successfully.
   */
  async verify(): Promise<boolean> {
    if (this.providers.length === 0) {
      logger.warn('No notification providers to verify')
      return false
    }

    const results = await Promise.allSettled(
      this.providers.map(provider =>
        provider.verify().catch(err => {
          logger.error(
            `Verification failed for provider "${provider.name}": ${
              err instanceof Error ? err.message : String(err)
            }`
          )
          return false
        })
      )
    )

    const allVerified = results.every(
      r => r.status === 'fulfilled' && r.value === true
    )

    if (!allVerified) {
      const failedProviders = this.providers
        .map((p, i) => ({
          name: p.name,
          verified: results[i].status === 'fulfilled' && results[i].value === true,
        }))
        .filter(r => !r.verified)
        .map(r => r.name)

      logger.warn(`Verification failed for providers: ${failedProviders.join(', ')}`)
    }

    return allVerified
  }
}
