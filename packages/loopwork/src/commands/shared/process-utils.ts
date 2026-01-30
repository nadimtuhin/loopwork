import fs from 'fs'
import path from 'path'

/**
 * Arguments needed to restart a loopwork process
 */
export interface RestartArgs {
  namespace: string
  args: string[]
  config?: string
  cwd: string
  startedAt: string
}

const RESTART_ARGS_FILE = 'restart-args.json'

/**
 * Save restart arguments for a namespace so the process can be restarted
 */
export function saveRestartArgs(projectRoot: string, namespace: string, args: string[]): void {
  const stateDir = path.join(projectRoot, '.loopwork')

  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true })
  }

  const argsFile = path.join(stateDir, `${namespace}-${RESTART_ARGS_FILE}`)

  const restartArgs: RestartArgs = {
    namespace,
    args,
    cwd: process.cwd(),
    startedAt: new Date().toISOString(),
  }

  fs.writeFileSync(argsFile, JSON.stringify(restartArgs, null, 2))
}

/**
 * Load restart arguments for a namespace
 */
export function loadRestartArgs(projectRoot: string, namespace: string): RestartArgs | null {
  const stateDir = path.join(projectRoot, '.loopwork')
  const argsFile = path.join(stateDir, `${namespace}-${RESTART_ARGS_FILE}`)

  if (!fs.existsSync(argsFile)) {
    return null
  }

  try {
    const content = fs.readFileSync(argsFile, 'utf-8')
    return JSON.parse(content) as RestartArgs
  } catch {
    return null
  }
}

/**
 * Clear restart arguments for a namespace
 */
export function clearRestartArgs(projectRoot: string, namespace: string): void {
  const stateDir = path.join(projectRoot, '.loopwork')
  const argsFile = path.join(stateDir, `${namespace}-${RESTART_ARGS_FILE}`)

  if (fs.existsSync(argsFile)) {
    fs.unlinkSync(argsFile)
  }
}

/**
 * Format uptime from a start time to now
 */
export function formatUptime(startedAt: string | Date): string {
  const start = typeof startedAt === 'string' ? new Date(startedAt).getTime() : startedAt.getTime()
  const now = Date.now()
  const diff = now - start

  if (diff < 0) {
    return '0s'
  }

  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    const remainingHours = hours % 24
    return `${days}d ${remainingHours}h`
  }

  if (hours > 0) {
    const remainingMinutes = minutes % 60
    return `${hours}h ${remainingMinutes}m`
  }

  if (minutes > 0) {
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  return `${seconds}s`
}

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }

  return `${seconds}s`
}

/**
 * Check if a process with given PID is alive
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Get current process info
 */
export function getProcessInfo(): { pid: number, ppid: number, cwd: string, argv: string[] } {
  return {
    pid: process.pid,
    ppid: process.ppid,
    cwd: process.cwd(),
    argv: process.argv,
  }
}

/**
 * Parse namespace from command line args or use default
 */
export function parseNamespace(args: string[]): string {
  const namespaceIndex = args.indexOf('--namespace')
  if (namespaceIndex !== -1 && args[namespaceIndex + 1]) {
    return args[namespaceIndex + 1]
  }
  return 'default'
}

/**
 * Get project root by walking up directory tree
 */
export function findProjectRoot(startDir: string = process.cwd()): string {
  let currentDir = startDir
  let projectRoot = currentDir

  while (currentDir !== '/' && currentDir.length > 1) {
    if (
      fs.existsSync(path.join(currentDir, '.git')) ||
      fs.existsSync(path.join(currentDir, 'package.json'))
    ) {
      projectRoot = currentDir
      break
    }
    currentDir = path.dirname(currentDir)
  }

  return projectRoot
}
