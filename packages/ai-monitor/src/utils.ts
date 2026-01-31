/**
 * Utility functions for AI Monitor
 * Provides logging that works standalone or integrates with loopwork
 */

/**
 * Logger interface that can be imported from loopwork or used standalone
 */
export interface Logger {
  debug: (message: string) => void
  info: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => void
  success?: (message: string) => void
  update?: (message: string) => void
  raw?: (message: string) => void
  logFile?: string
}

/**
 * Create a basic console logger
 */
function createConsoleLogger(): Logger {
  return {
    debug: (msg: string) => console.debug(`[DEBUG] ${msg}`),
    info: (msg: string) => console.info(`[INFO] ${msg}`),
    warn: (msg: string) => console.warn(`[WARN] ${msg}`),
    error: (msg: string) => console.error(`[ERROR] ${msg}`),
    success: (msg: string) => console.log(`[SUCCESS] ${msg}`),
    update: (msg: string) => console.log(msg),
    raw: (msg: string) => console.log(msg)
  }
}

/**
 * Try to import logger from loopwork, fallback to console
 */
let _logger: Logger | null = null

export function getLogger(): Logger {
  if (_logger) return _logger

  try {
    // Try to import from loopwork package (will be available as peer dep)
    const loopwork = require('@loopwork-ai/loopwork')
    if (loopwork.logger) {
      _logger = loopwork.logger as Logger
      return _logger
    }
  } catch {
    // Loopwork not available, use console fallback
  }

  _logger = createConsoleLogger()
  return _logger
}

/**
 * Set custom logger (for testing or custom integrations)
 */
export function setLogger(customLogger: Logger): void {
  _logger = customLogger
}

/**
 * Export singleton logger instance
 */
export const logger = new Proxy({} as Logger, {
  get(_target, prop: keyof Logger) {
    const log = getLogger()
    return log[prop]
  }
})
