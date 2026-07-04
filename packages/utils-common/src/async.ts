/**
 * Shared async utilities for Loopwork
 */

/**
 * Pause execution for a specified duration
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
