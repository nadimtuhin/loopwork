/**
 * Application-wide constants
 *
 * This file defines magic numbers used throughout the codebase to improve
 * maintainability and allow for easy tuning without code changes.
 */

/**
 * File locking configuration
 */

/**
 * Default timeout for acquiring file lock (5 seconds)
 * Used by JsonTaskAdapter when no explicit timeout is provided
 */
export const DEFAULT_LOCK_TIMEOUT_MS = 5000

/**
 * Timeout for considering a lock file stale (30 seconds)
 * If a lock file hasn't been updated in this time, it's assumed the
 * holding process has crashed and the lock is removed
 */
export const LOCK_STALE_TIMEOUT_MS = 30000

/**
 * Delay between lock acquisition retry attempts (100ms)
 * When a lock file exists, the adapter waits this long before retrying
 * to acquire the lock. Prevents busy-waiting and high CPU usage
 */
export const LOCK_RETRY_DELAY_MS = 100

/**
 * CLI execution configuration
 */

/**
 * Wait time when rate limit is detected (60 seconds)
 * When the CLI output contains rate limit indicators (429, RESOURCE_EXHAUSTED, etc),
 * wait this long before retrying to avoid immediate re-failure
 */
export const RATE_LIMIT_WAIT_MS = 60000

/**
 * Progress update interval for CLI execution (2 seconds)
 * How often to update the progress bar while a CLI process is running
 */
export const PROGRESS_UPDATE_INTERVAL_MS = 2000

/**
 * Delay before sending SIGKILL after SIGTERM (5 seconds)
 * When a CLI process exceeds its timeout, SIGTERM is sent first.
 * If the process doesn't exit after this delay, SIGKILL is sent
 */
export const SIGKILL_DELAY_MS = 5000

/**
 * GitHub backend configuration
 */

/**
 * Base retry delay for GitHub API calls (1 second)
 * Exponential backoff multiplier for retryable GitHub API failures
 * Actual delays will be: 1s, 2s, 4s, 8s, etc. depending on attempt number
 */
export const GITHUB_RETRY_BASE_DELAY_MS = 1000

/**
 * Maximum number of retries for GitHub API operations (3)
 * Used by GitHubTaskAdapter for retryable network/API errors
 */
export const GITHUB_MAX_RETRIES = 3

/**
 * State file paths
 *
 * @deprecated Use LoopworkState class from './loopwork-state' instead
 * These exports are kept for backward compatibility
 */
import {
  LOOPWORK_DIR,
  STATE_FILES,
  STATE_WATCH_PATTERNS,
} from './loopwork-state'

/** @deprecated Use LOOPWORK_DIR from loopwork-state */
export const LOOPWORK_STATE_DIR = LOOPWORK_DIR

/** @deprecated Use STATE_FILES.SESSION from loopwork-state */
export const STATE_FILE_BASE = STATE_FILES.SESSION

/** @deprecated Use STATE_FILES.MONITOR from loopwork-state */
export const MONITOR_STATE_FILE = STATE_FILES.MONITOR

/** @deprecated Use STATE_WATCH_PATTERNS from loopwork-state */
export const STATE_FILE_WATCH_PATTERNS = STATE_WATCH_PATTERNS
