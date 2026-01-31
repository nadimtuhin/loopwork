/**
 * Pause/resume loop control
 *
 * Implements temporary loop pausing with duration timer and
 * support for immediate resume on user command.
 */

import fs from 'fs'
import path from 'path'
import { logger } from '../utils'
import type { Action } from './index'

// Import LoopworkState from loopwork if available, otherwise use fallback
let LoopworkState: any
try {
  const loopwork = require('@loopwork-ai/loopwork')
  LoopworkState = loopwork.LoopworkState
} catch {
  // Fallback implementation
  LoopworkState = class {
    paths: any
    constructor() {
      const stateDir = path.join(process.cwd(), '.loopwork')
      this.paths = {
        pause: () => path.join(stateDir, 'pause-state.json')
      }
    }
  }
}

export interface PauseState {
  paused: boolean
  reason: string
  pausedAt: number
  resumeAt: number
  duration: number
}

const MAX_PAUSE_DURATION = 5 * 60 * 1000 // 5 minutes safety limit

/**
 * Get pause state file path
 */
function getPauseStateFile(): string {
  const loopworkState = new LoopworkState()
  return loopworkState.paths.pause()
}

/**
 * Load pause state from file
 */
export function loadPauseState(): PauseState | null {
  const stateFile = getPauseStateFile()

  if (!fs.existsSync(stateFile)) {
    return null
  }

  try {
    const data = fs.readFileSync(stateFile, 'utf8')
    return JSON.parse(data) as PauseState
  } catch (error) {
    logger.warn(`Failed to load pause state: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

/**
 * Save pause state to file
 */
export function savePauseState(state: PauseState): void {
  const stateFile = getPauseStateFile()

  try {
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8')
    logger.debug(`Pause state saved to ${stateFile}`)
  } catch (error) {
    logger.error(`Failed to save pause state: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Clear pause state
 */
export function clearPauseState(): void {
  const stateFile = getPauseStateFile()

  if (fs.existsSync(stateFile)) {
    try {
      fs.unlinkSync(stateFile)
      logger.debug('Pause state cleared')
    } catch (error) {
      logger.warn(`Failed to clear pause state: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

/**
 * Check if loop is currently paused
 */
export function isLoopPaused(): boolean {
  const state = loadPauseState()

  if (!state || !state.paused) {
    return false
  }

  // Check if pause duration has expired
  const now = Date.now()
  if (now >= state.resumeAt) {
    logger.info('Pause duration expired, auto-resuming')
    clearPauseState()
    return false
  }

  return true
}

/**
 * Get remaining pause time in milliseconds
 */
export function getRemainingPauseTime(): number {
  const state = loadPauseState()

  if (!state || !state.paused) {
    return 0
  }

  const now = Date.now()
  const remaining = Math.max(0, state.resumeAt - now)

  return remaining
}

/**
 * Execute pause action
 */
export async function executePauseLoop(action: Action): Promise<void> {
  if (action.type !== 'pause') {
    throw new Error('Invalid action type for pause executor')
  }

  const pauseAction = action as { type: 'pause'; pattern: string; context: Record<string, string>; reason: string; duration: number }
  let duration = pauseAction.duration || 60 * 1000 // Default 60 seconds

  // Enforce safety limit
  if (duration > MAX_PAUSE_DURATION) {
    logger.warn(`Pause duration ${duration}ms exceeds maximum ${MAX_PAUSE_DURATION}ms, capping to maximum`)
    duration = MAX_PAUSE_DURATION
  }

  const now = Date.now()
  const state: PauseState = {
    paused: true,
    reason: pauseAction.reason || 'Unknown',
    pausedAt: now,
    resumeAt: now + duration,
    duration
  }

  savePauseState(state)

  const durationSec = Math.round(duration / 1000)
  logger.warn(`Loop paused: ${state.reason}`)
  logger.info(`Will auto-resume in ${durationSec} seconds (or run 'loopwork resume')`)
}

/**
 * Resume the loop
 */
export function resumeLoop(): void {
  const state = loadPauseState()

  if (!state || !state.paused) {
    logger.info('Loop is not paused, nothing to resume')
    return
  }

  clearPauseState()

  const pausedDuration = Math.round((Date.now() - state.pausedAt) / 1000)
  logger.success?.(`Loop resumed after ${pausedDuration} seconds`)
}

/**
 * Wait for pause to complete (with periodic checks)
 */
export async function waitForPauseCompletion(checkInterval: number = 1000): Promise<void> {
  while (isLoopPaused()) {
    const remaining = getRemainingPauseTime()
    const remainingSec = Math.ceil(remaining / 1000)

    logger.update?.(`Loop paused, resuming in ${remainingSec}s...`)

    await new Promise(resolve => setTimeout(resolve, checkInterval))
  }
}
