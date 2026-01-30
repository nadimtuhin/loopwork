import { createAIMonitor } from './index'
import { logger } from '../core/utils'
import { findProjectRoot } from '../commands/shared/process-utils'
import { findLatestSession, getMainLogFile } from '../commands/shared/log-utils'

export interface AIMonitorOptions {
  watch?: boolean
  logFile?: string
  namespace?: string
  model?: string
}

export async function aiMonitor(options: AIMonitorOptions) {
  const projectRoot = findProjectRoot()
  const namespace = options.namespace || 'default'
  
  let logFile = options.logFile
  
  if (!logFile) {
    const session = findLatestSession(projectRoot, namespace)
    if (session) {
      logFile = getMainLogFile(session.fullPath) || undefined
    }
  }
  
  if (!logFile) {
    logger.error('No log file found to monitor. Please specify --log-file or ensure loopwork is running.')
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

  await (monitor as { startWatching: () => Promise<void> }).startWatching()

  if (options.watch) {
    logger.info('Press Ctrl+C to stop monitoring')

    process.on('SIGINT', () => {
      logger.info('AI Monitor stopping...')
      ;(monitor as { stopWatching: () => void }).stopWatching()
      process.exit(0)
    })

    setInterval(() => {}, 1000)
  }
}
