/**
 * Action: Pause Loop
 *
 * Pauses the main loop execution when rate limits or critical errors are detected.
 * Uses a session-based pause mechanism to prevent system-wide hangs.
 */

import { logger } from '../../core/utils'
import type { MonitorAction } from '../types'

export interface PauseLoopOptions {
  stateManager: any // StateManager from core/state.ts
  namespace: string
  pauseDurationMs: number
}

let activePause: NodeJS.Timeout | null = null

/**
 * Execute pause action
 */
export async function executePause(
  reason: string,
  duration: number,
  options: PauseLoopOptions
): Promise<void> {
  const { namespace, stateManager, pauseDurationMs } = options

  try {
    logger.warn(`[AI-MONITOR] Pausing loop for ${duration}ms: ${reason}`)

    // Store pause information in state
    const pauseInfo = {
      paused: true,
      reason,
      durationMs: duration,
      startTime: Date.now(),
      namespace
    }

    stateManager?.setPluginState?.('ai-monitor-pause', pauseInfo)

    // Set a timeout to auto-resume
    activePause = setTimeout(() => {
      stateManager?.setPluginState?.('ai-monitor-pause', { paused: false })
      logger.info(`[AI-MONITOR] Auto-resuming loop after pause: ${reason}`)
    }, duration)

    // Stop all monitoring to prevent conflicts during pause
    await stopMonitoring()

    logger.info(`[AI-MONITOR] Loop paused. Auto-resume in ${duration}ms`)

    // Wait for pause duration
    await new Promise(resolve => setTimeout(resolve, duration))

    // Resume if still paused
    const currentPause = stateManager?.getPluginState?.('ai-monitor-pause')
    if (currentPause?.paused) {
      logger.info(`[AI-MONITOR] Resuming loop after user/system intervention`)
      stateManager?.setPluginState?.('ai-monitor-pause', { paused: false })
      await resumeMonitoring()
    }

    return
  } catch (error) {
    logger.error(`[AI-MONITOR] Failed to pause loop: ${error}`)
    throw error
  }
}

/**
 * Stop all monitoring activities
 */
async function stopMonitoring(): Promise<void> {
  // Signal to LogWatcher to stop emitting
  logger.debug('[AI-MONITOR] Stopping monitoring activities')
  // Implementation would interact with LogWatcher instance if tracking it globally
}

/**
 * Resume monitoring activities
 */
async function resumeMonitoring(): Promise<void> {
  logger.debug('[AI-MONITOR] Resuming monitoring activities')
  // Implementation would resume LogWatcher and other monitors
}

/**
 * Check if loop is currently paused
 */
export function isPaused(options: PauseLoopOptions): boolean {
  const pauseInfo = options.stateManager?.getPluginState?.('ai-monitor-pause')
  return pauseInfo?.paused === true
}

/**
 * Clear any active pause
 */
export async function clearPause(options: PauseLoopOptions): Promise<void> {
  stateManager?.setPluginState?.('ai-monitor-pause', { paused: false })
  if (activePause) {
    clearTimeout(activePause)
    activePause = null
  }
  logger.info('[AI-MONITOR] Clearing active pause')
}

/**
 * Factory function to create the action
 */
export function createActionPauseLoop(
  reason: string,
  duration: number,
  options: PauseLoopOptions
): MonitorAction {
  return {
    type: 'pause',
    reason,
    duration
  }
}
