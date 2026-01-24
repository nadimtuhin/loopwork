import chalk from 'chalk'

function getTimestamp(): string {
  return new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

export const logger = {
  info: (msg: string) =>
    console.log(chalk.gray(getTimestamp()), chalk.blue('[INFO]'), msg),
  success: (msg: string) =>
    console.log(chalk.gray(getTimestamp()), chalk.green('[SUCCESS]'), msg),
  warn: (msg: string) =>
    console.log(chalk.gray(getTimestamp()), chalk.yellow('[WARN]'), msg),
  error: (msg: string) =>
    console.log(chalk.gray(getTimestamp()), chalk.red('[ERROR]'), msg),
  debug: (msg: string) => {
    if (process.env.LOOPWORK_DEBUG === 'true') {
      console.log(chalk.gray(getTimestamp()), chalk.cyan('[DEBUG]'), msg)
    }
  },
}

export async function promptUser(
  question: string,
  defaultValue: string = 'n',
  nonInteractive: boolean = false
): Promise<string> {
  if (nonInteractive || !process.stdin.isTTY) {
    logger.debug(`Non-interactive mode, using default: ${defaultValue}`)
    return defaultValue
  }

  process.stdout.write(question)
  process.stdin.setRawMode(true)

  return new Promise<string>((resolve) => {
    process.stdin.resume()

    const cleanup = () => {
      try {
        process.stdin.setRawMode(false)
      } catch {
        // stdin may already be closed
      }
      process.stdin.pause()
      process.stdin.removeListener('data', onData)
      process.stdin.removeListener('error', onError)
    }

    const onData = (data: Buffer) => {
      const char = data.toString('utf8')

      // Handle Ctrl+C
      if (char === '\u0003') {
        cleanup()
        process.stdout.write('\n')
        logger.info('Interrupted by user (Ctrl+C)')
        process.exit(130)
      }

      cleanup()
      process.stdout.write('\n')
      if (char === '\r' || char === '\n') {
        resolve(defaultValue)
      } else {
        resolve(char.trim())
      }
    }

    const onError = (err: Error) => {
      cleanup()
      logger.debug(`stdin error: ${err.message}`)
      resolve(defaultValue)
    }

    process.stdin.once('data', onData)
    process.stdin.once('error', onError)
  })
}
