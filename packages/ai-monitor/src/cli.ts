import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import { createAIMonitor } from './index'
import { logger } from './utils'
import { CircuitBreaker } from './circuit-breaker'

// Try to import utilities from loopwork, fallback to local implementations
let findProjectRoot: () => string
let findLatestSession: (root: string, namespace: string) => any
let getMainLogFile: (sessionPath: string) => string | null

try {
  const loopwork = require('@loopwork-ai/loopwork')
  findProjectRoot = loopwork.findProjectRoot || (() => process.cwd())
  findLatestSession = loopwork.findLatestSession || (() => null)
  getMainLogFile = loopwork.getMainLogFile || (() => null)
} catch {
  // Fallback implementations
  findProjectRoot = () => process.cwd()
  findLatestSession = () => null
  getMainLogFile = () => null
}

export interface AIMonitorOptions {
  watch?: boolean
  dryRun?: boolean
  status?: boolean
  logFile?: string
  logDir?: string
  namespace?: string
  model?: string
}

/**
 * Load monitor state from disk
 */
function loadMonitorState(projectRoot: string): Record<string, unknown> | null {
  const stateFile = path.join(projectRoot, '.loopwork', 'monitor-state.json')

  if (!fs.existsSync(stateFile)) {
    return null
  }

  try {
    const data = fs.readFileSync(stateFile, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    logger.warn(`Failed to read monitor state: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

/**
 * Format circuit breaker state for display
 */
function formatCircuitBreakerStatus(state: any): string {
  const breaker = state?.circuitBreakerState
  if (!breaker) {
    return 'Unknown'
  }

  const status = breaker.status || 'UNKNOWN'
  const failures = breaker.failures || 0
  const timestamp = breaker.lastFailureTime ? new Date(breaker.lastFailureTime).toLocaleString() : 'N/A'

  let color = chalk.green
  if (status === 'OPEN') color = chalk.red
  else if (status === 'HALF_OPEN') color = chalk.yellow

  return `${color(status)} (${failures} failures, last: ${timestamp})`
}

/**
 * Show circuit breaker status and exit
 */
function showStatus(options: AIMonitorOptions): void {
  const projectRoot = findProjectRoot()
  const state = loadMonitorState(projectRoot)

  if (!state) {
    logger.warn('No monitor state found. AI Monitor may not have run yet.')
    process.exit(0)
  }

  logger.raw('')
  logger.raw(chalk.bold('AI Monitor Status'))
  logger.raw(chalk.gray('─'.repeat(50)))
  logger.raw('')

  logger.raw(`${chalk.bold('Circuit Breaker:')} ${formatCircuitBreakerStatus(state)}`)
  logger.raw(`${chalk.bold('LLM Calls:')} ${state.llmCallCount || 0}/${state.llmMaxPerSession || 'unlimited'}`)
  logger.raw(`${chalk.bold('Last LLM Call:')} ${state.lastLLMCall ? new Date(state.lastLLMCall).toLocaleString() : 'Never'}`)

  if (state.detectedPatterns) {
    logger.raw(`${chalk.bold('Detected Patterns:')} ${Object.keys(state.detectedPatterns).length}`)
    Object.entries(state.detectedPatterns).forEach(([pattern, count]) => {
      logger.raw(`  - ${pattern}: ${count}`)
    })
  }

  if (state.taskRecovery) {
    logger.raw('')
    logger.raw(`${chalk.bold('Task Recovery:')}`)
    logger.raw(`  - Attempts: ${state.taskRecovery.attempts || 0}`)
    logger.raw(`  - Successes: ${state.taskRecovery.successes || 0}`)
    logger.raw(`  - Failures: ${state.taskRecovery.failures || 0}`)
  }

  logger.raw('')
  logger.raw(chalk.gray('─'.repeat(50)))
  logger.raw('')

  process.exit(0)
}

export async function aiMonitor(options: AIMonitorOptions) {
  // Handle --status flag
  if (options.status) {
    return showStatus(options)
  }

  const projectRoot = findProjectRoot()
  const namespace = options.namespace || 'default'

  let logDir = options.logDir || path.join(projectRoot, '.loopwork', 'runs')
  let logFile = options.logFile

  if (!logFile) {
    // Try to find latest session log
    if (fs.existsSync(logDir)) {
      const sessions = fs.readdirSync(logDir).sort().reverse()
      if (sessions.length > 0) {
        const sessionPath = path.join(logDir, sessions[0])
        const mainLogFile = path.join(sessionPath, `${namespace}.log`)
        if (fs.existsSync(mainLogFile)) {
          logFile = mainLogFile
        }
      }
    }
  }

  if (!logFile) {
    logger.error('No log file found to monitor. Please ensure loopwork is running or specify --log-file.')
    process.exit(1)
  }

  if (!fs.existsSync(logFile)) {
    logger.error(`Log file not found: ${logFile}`)
    process.exit(1)
  }

  const monitor = createAIMonitor({
    enabled: true,
    llmModel: options.model
  })

  await (monitor as { onConfigLoad: (config: { projectRoot: string }) => Promise<void> }).onConfigLoad({ projectRoot })

  ;(monitor as { logFile: string; namespace: string }).logFile = logFile
  ;(monitor as { logFile: string; namespace: string }).namespace = namespace

  logger.info(`AI Monitor watching: ${logFile}`)

  if (options.dryRun) {
    logger.info(chalk.yellow('DRY RUN MODE: Detection only, no healing actions will be executed'))
  }

  await (monitor as { startWatching: () => Promise<void> }).startWatching()

  if (options.watch || options.dryRun) {
    logger.info('Press Ctrl+C to stop monitoring')

    process.on('SIGINT', () => {
      logger.info('AI Monitor stopping...')
      ;(monitor as { stopWatching: () => void }).stopWatching()
      process.exit(0)
    })

    // Keep process alive
    setInterval(() => {}, 1000)
  }
}
