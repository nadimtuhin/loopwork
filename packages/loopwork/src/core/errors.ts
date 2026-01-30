import { logger } from './utils'
import chalk from 'chalk'

export class LoopworkError extends Error {
  constructor(
    message: string,
    public suggestions: string[] = [],
    public docsUrl?: string
  ) {
    super(message)
    this.name = 'LoopworkError'
  }
}

export function handleError(error: unknown): void {
  if (error instanceof LoopworkError) {
    logger.error(error.message)
    error.suggestions.forEach(s => logger.info(`💡 ${s}`))
    if (error.docsUrl) {
      logger.info(`📚 Documentation: ${chalk.underline(error.docsUrl)}`)
    }
    
    logger.debug(`LoopworkError: ${error.message}\n${error.stack}`)
  } else if (error instanceof Error) {
    logger.error(error.message)
    if (process.env.LOOPWORK_DEBUG === 'true') {
      logger.debug(error.stack || 'No stack trace available')
    } else {
      logger.debug(`Error: ${error.message}\n${error.stack}`)
    }
  } else {
    logger.error(String(error))
    logger.debug(`Non-Error thrown: ${String(error)}`)
  }
}
