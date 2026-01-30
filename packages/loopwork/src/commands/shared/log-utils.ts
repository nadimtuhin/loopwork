import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import chalk from 'chalk'

/**
 * Session info extracted from session directory name
 */
export interface SessionInfo {
  namespace: string
  timestamp: string
  fullPath: string
  startedAt: Date
}

/**
 * Find the latest session directory for a namespace
 */
export function findLatestSession(projectRoot: string, namespace: string = 'default'): SessionInfo | null {
  const runsDir = path.join(projectRoot, '.loopwork/runs', namespace)

  if (!fs.existsSync(runsDir)) {
    return null
  }

  try {
    const entries = fs.readdirSync(runsDir, { withFileTypes: true })
    const sessionDirs = entries
      .filter(e => e.isDirectory() && e.name !== 'monitor-logs')
      .map(e => e.name)
      .sort()
      .reverse()

    if (sessionDirs.length === 0) {
      return null
    }

    const latestTimestamp = sessionDirs[0]
    const fullPath = path.join(runsDir, latestTimestamp)

    // Parse timestamp (format: 2025-01-25T12-34-56)
    const timestampDate = parseTimestamp(latestTimestamp)

    return {
      namespace,
      timestamp: latestTimestamp,
      fullPath,
      startedAt: timestampDate,
    }
  } catch {
    return null
  }
}

/**
 * Get log files for a session
 */
export function getSessionLogs(sessionPath: string): string[] {
  const logsDir = path.join(sessionPath, 'logs')

  if (!fs.existsSync(logsDir)) {
    return []
  }

  try {
    const files = fs.readdirSync(logsDir)
      .filter(f => f.endsWith('.txt') || f.endsWith('.log') || f.endsWith('.md'))
      .sort()

    return files.map(f => path.join(logsDir, f))
  } catch {
    return []
  }
}

/**
 * Get logs for a specific task iteration
 */
export function getTaskLogs(sessionPath: string, iteration: number): { prompt: string | null, output: string | null } {
  const logsDir = path.join(sessionPath, 'logs')

  const promptFile = path.join(logsDir, `iteration-${iteration}-prompt.md`)
  const outputFile = path.join(logsDir, `iteration-${iteration}-output.txt`)

  return {
    prompt: fs.existsSync(promptFile) ? fs.readFileSync(promptFile, 'utf-8') : null,
    output: fs.existsSync(outputFile) ? fs.readFileSync(outputFile, 'utf-8') : null,
  }
}

/**
 * Read last N lines from a log file
 */
export function readLastLines(filePath: string, lines: number = 50): string[] {
  if (!fs.existsSync(filePath)) {
    return []
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const allLines = content.split('\n')
    return allLines.slice(-lines)
  } catch {
    return []
  }
}

/**
 * Get the main loopwork.log file for a session
 */
export function getMainLogFile(sessionPath: string): string | null {
  const logFile = path.join(sessionPath, 'loopwork.log')
  return fs.existsSync(logFile) ? logFile : null
}

/**
 * Tail logs in real-time using native tail -f
 * Returns a function to stop tailing
 */
export function tailLogs(
  logFile: string,
  options: {
    onLine?: (line: string) => void
    onError?: (err: Error) => void
  } = {}
): { stop: () => void } {
  const tail = spawn('tail', ['-f', logFile], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (options.onLine && tail.stdout) {
    let buffer = ''
    tail.stdout.on('data', (data: Buffer) => {
      buffer += data.toString('utf-8')
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        options.onLine!(line)
      }
    })
  }

  if (options.onError && tail.stderr) {
    tail.stderr.on('data', (data: Buffer) => {
      options.onError!(new Error(data.toString('utf-8')))
    })
  }

  return {
    stop: () => {
      tail.kill('SIGTERM')
    },
  }
}

/**
 * Format log line for display with timestamp highlighting
 */
export function formatLogLine(line: string): string {
  // Match timestamp pattern at start of line
  const timestampMatch = line.match(/^\[([^\]]+)\]/)
  if (timestampMatch) {
    const timestamp = timestampMatch[1]
    const rest = line.slice(timestampMatch[0].length)

    // Color-code log levels
    if (rest.includes('[ERROR]') || rest.includes('ERROR:')) {
      return `${chalk.gray(`[${timestamp}]`)}${chalk.red(rest)}`
    }
    if (rest.includes('[WARN]') || rest.includes('WARN:')) {
      return `${chalk.gray(`[${timestamp}]`)}${chalk.yellow(rest)}`
    }
    if (rest.includes('[SUCCESS]') || rest.includes('SUCCESS:')) {
      return `${chalk.gray(`[${timestamp}]`)}${chalk.green(rest)}`
    }
    if (rest.includes('[DEBUG]')) {
      return `${chalk.gray(`[${timestamp}]`)}${chalk.cyan(rest)}`
    }

    return `${chalk.gray(`[${timestamp}]`)}${rest}`
  }

  return line
}

/**
 * Parse timestamp string back to Date
 */
function parseTimestamp(timestamp: string): Date {
  // Format: 2025-01-25T12-34-56
  const cleaned = timestamp
    .replace(/T/, ' ')
    .replace(/-(\d{2})-(\d{2})$/, ':$1:$2')

  const date = new Date(cleaned)
  return isNaN(date.getTime()) ? new Date() : date
}

/**
 * List all sessions for a namespace
 */
export function listSessions(projectRoot: string, namespace: string = 'default'): SessionInfo[] {
  const runsDir = path.join(projectRoot, '.loopwork/runs', namespace)

  if (!fs.existsSync(runsDir)) {
    return []
  }

  try {
    const entries = fs.readdirSync(runsDir, { withFileTypes: true })
    return entries
      .filter(e => e.isDirectory() && e.name !== 'monitor-logs')
      .map(e => ({
        namespace,
        timestamp: e.name,
        fullPath: path.join(runsDir, e.name),
        startedAt: parseTimestamp(e.name),
      }))
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
  } catch {
    return []
  }
}
