import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import { LoopworkMonitor } from '../monitor'
import { StateManager } from '../core/state'
import type { Config } from '../core/config'
import { logger } from '../core/utils'

/**
 * Loopwork Dashboard
 *
 * Displays comprehensive status, logs, and metrics for all running loops.
 */

interface TaskStats {
  completed: number
  failed: number
  pending: number
}

interface NamespaceStats {
  namespace: string
  status: 'running' | 'stopped'
  pid?: number
  uptime?: string
  lastRun?: string
  currentTask?: string
  tasks: TaskStats
  iterations: number
}

class Dashboard {
  private monitor: LoopworkMonitor
  private projectRoot: string

  constructor(projectRoot?: string, deps: { MonitorClass?: typeof LoopworkMonitor } = {}) {
    this.projectRoot = projectRoot || process.cwd()
    const MonitorClass = deps.MonitorClass ?? LoopworkMonitor
    this.monitor = new MonitorClass(this.projectRoot)
  }

  /**
   * Display full dashboard
   */
  display(): void {
    console.clear()
    this.printHeader()
    this.printRunningLoops()
    this.printRecentActivity()
    this.printHelp()
  }

  private printHeader(): void {
    process.stdout.write(chalk.bold.cyan('\n╔══════════════════════════════════════════════════════════════╗') + '\n')
    process.stdout.write(chalk.bold.cyan('║                    RALPH LOOP DASHBOARD                       ║') + '\n')
    process.stdout.write(chalk.bold.cyan('╚══════════════════════════════════════════════════════════════╝') + '\n')
    process.stdout.write(chalk.gray(`  ${new Date().toLocaleString()}`) + '\n')
    process.stdout.write('\n')
  }

  private printRunningLoops(): void {
    const { running, namespaces } = this.monitor.getStatus()

    process.stdout.write(chalk.bold.white('┌─ Running Loops ─────────────────────────────────────────────┐') + '\n')

    if (running.length === 0) {
      process.stdout.write(chalk.gray('│  No loops currently running                                 │') + '\n')
    } else {
      for (const proc of running) {
        const stats = this.getNamespaceStats(proc.namespace)
        const uptime = this.getUptime(proc.startedAt)

        process.stdout.write(chalk.green(`│  ● ${chalk.bold(proc.namespace.padEnd(15))} PID: ${String(proc.pid).padEnd(8)} Uptime: ${uptime.padEnd(10)} │`) + '\n')

        if (stats.currentTask) {
          process.stdout.write(chalk.gray(`│    └─ Current: ${stats.currentTask.padEnd(43)} │`) + '\n')
        }

        const taskLine = `Completed: ${chalk.green(stats.tasks.completed)} | Failed: ${chalk.red(stats.tasks.failed)} | Pending: ${chalk.yellow(stats.tasks.pending)}`
        process.stdout.write(chalk.gray(`│    └─ ${taskLine.padEnd(51)} │`) + '\n')
      }
    }

    process.stdout.write(chalk.white('└─────────────────────────────────────────────────────────────┘') + '\n')
    process.stdout.write('\n')

    // Show stopped namespaces
    const stopped = namespaces.filter(n => n.status === 'stopped')
    if (stopped.length > 0) {
      process.stdout.write(chalk.bold.white('┌─ Available Namespaces ───────────────────────────────────────┐') + '\n')
      for (const ns of stopped) {
        const lastRunStr = ns.lastRun || 'never'
        process.stdout.write(chalk.gray(`│  ○ ${ns.name.padEnd(20)} Last run: ${lastRunStr.padEnd(25)} │`) + '\n')
      }
      process.stdout.write(chalk.white('└─────────────────────────────────────────────────────────────┘') + '\n')
      process.stdout.write('\n')
    }
  }

  private printRecentActivity(): void {
    process.stdout.write(chalk.bold.white('┌─ Recent Activity ───────────────────────────────────────────┐') + '\n')

    const activity = this.getRecentActivity()

    if (activity.length === 0) {
      process.stdout.write(chalk.gray('│  No recent activity                                         │') + '\n')
    } else {
      for (const item of activity.slice(0, 10)) {
        const icon = item.type === 'completed' ? chalk.green('✓')
          : item.type === 'failed' ? chalk.red('✗')
          : chalk.blue('→')

        const line = `${icon} ${chalk.gray(item.time)} ${item.namespace}: ${item.message}`
        process.stdout.write(`│  ${line.padEnd(65)}│` + '\n')
      }
    }

    process.stdout.write(chalk.white('└─────────────────────────────────────────────────────────────┘') + '\n')
    process.stdout.write('\n')
  }

  private printHelp(): void {
    process.stdout.write(chalk.gray('Commands:') + '\n')
    process.stdout.write(chalk.gray('  q - Quit | r - Refresh | s - Start loop | k - Kill loop | l - View logs') + '\n')
    process.stdout.write('\n')
  }

  /**
   * Get stats for a specific namespace
   */
  private getNamespaceStats(namespace: string): NamespaceStats {
    const stats: NamespaceStats = {
      namespace,
      status: 'stopped',
      tasks: { completed: 0, failed: 0, pending: 0 },
      iterations: 0,
    }

    // Check if running
    const running = this.monitor.getRunningProcesses()
    const proc = running.find(p => p.namespace === namespace)

    if (proc) {
      stats.status = 'running'
      stats.pid = proc.pid
      stats.uptime = this.getUptime(proc.startedAt)
    }

    // Load state using StateManager
    const state = this.loadStateForNamespace(namespace)
    if (state) {
      stats.currentTask = `Task #${state.lastIssue}`
      stats.iterations = state.lastIteration
    }

    // Count tasks from logs
    const logsDir = path.join(this.projectRoot, '.loopwork/runs', namespace)
    if (fs.existsSync(logsDir)) {
      const runDirs = fs.readdirSync(logsDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name !== 'monitor-logs')

      for (const dir of runDirs) {
        const logPath = path.join(logsDir, dir.name, 'logs')
        if (fs.existsSync(logPath)) {
          const files = fs.readdirSync(logPath)
          for (const file of files) {
            if (file.includes('completed')) stats.tasks.completed++
            else if (file.includes('failed')) stats.tasks.failed++
          }
        }
      }
    }

    return stats
  }

  /**
   * Load state for a specific namespace using StateManager
   * Falls back to manual parsing for legacy formats
   */
  private loadStateForNamespace(namespace: string): { lastIssue: number; lastIteration: number } | null {
    try {
      // Create a minimal config for StateManager
      const config: Config = {
        namespace,
        projectRoot: this.projectRoot,
        cli: 'claude',
        maxIterations: 0,
        outputDir: '',
        sessionId: '',
        debug: false,
      }

      const stateManager = new StateManager(config)
      const state = stateManager.loadState()

      if (state) {
        return {
          lastIssue: state.lastIssue,
          lastIteration: state.lastIteration,
        }
      }
    } catch {
      // Fallback to manual parsing for legacy formats
      return this.loadStateLegacy(namespace)
    }

    return null
  }

  /**
   * Legacy state file parser for backward compatibility
   */
  private loadStateLegacy(namespace: string): { lastIssue: number; lastIteration: number } | null {
    const stateFile = path.join(
      this.projectRoot,
      '.loopwork',
      namespace === 'default' ? 'state.json' : `state-${namespace}.json`
    )

    if (!fs.existsSync(stateFile)) {
      return null
    }

    try {
      const content = fs.readFileSync(stateFile, 'utf-8')
      const state: Record<string, string> = {}

      content.split('\n').forEach((line) => {
        const trimmedLine = line.trim()
        const idx = trimmedLine.indexOf('=')
        if (idx !== -1) {
          const key = trimmedLine.substring(0, idx).trim()
          const value = trimmedLine.substring(idx + 1).trim()
          if (key && value) state[key] = value
        }
      })

      if (!state.LAST_ISSUE) {
        return null
      }

      return {
        lastIssue: parseInt(state.LAST_ISSUE, 10),
        lastIteration: parseInt(state.LAST_ITERATION || '0', 10),
      }
    } catch {
      return null
    }
  }

  /**
   * Get recent activity across all namespaces
   */
  getRecentActivity(): { time: string; namespace: string; type: string; message: string }[] {
    const activity: { time: string; namespace: string; type: string; message: string }[] = []

    const runsDir = path.join(this.projectRoot, '.loopwork/runs')
    if (!fs.existsSync(runsDir)) return activity

    const namespaces = fs.readdirSync(runsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())

    for (const ns of namespaces) {
      const monitorLogsDir = path.join(runsDir, ns.name, 'monitor-logs')
      if (!fs.existsSync(monitorLogsDir)) continue

      const logFiles = fs.readdirSync(monitorLogsDir)
        .filter(f => f.endsWith('.log'))
        .sort()
        .reverse()
        .slice(0, 1)

      for (const logFile of logFiles) {
        const content = fs.readFileSync(path.join(monitorLogsDir, logFile), 'utf-8')
        const lines = content.split('\n').slice(-50)

        for (const line of lines) {
          if (line.includes('[SUCCESS]') && line.includes('completed')) {
            const time = this.extractTime(line)
            const taskMatch = line.match(/Task (\S+)/)
            activity.push({
              time,
              namespace: ns.name,
              type: 'completed',
              message: taskMatch ? `Completed ${taskMatch[1]}` : 'Task completed',
            })
          } else if (line.includes('[ERROR]') && line.includes('failed')) {
            const time = this.extractTime(line)
            const taskMatch = line.match(/Task (\S+)/)
            activity.push({
              time,
              namespace: ns.name,
              type: 'failed',
              message: taskMatch ? `Failed ${taskMatch[1]}` : 'Task failed',
            })
          } else if (line.includes('Iteration')) {
            const time = this.extractTime(line)
            const iterMatch = line.match(/Iteration (\d+)/)
            if (iterMatch) {
              activity.push({
                time,
                namespace: ns.name,
                type: 'progress',
                message: `Started iteration ${iterMatch[1]}`,
              })
            }
          }
        }
      }
    }

    // Sort by time descending
    activity.sort((a, b) => b.time.localeCompare(a.time))

    return activity.slice(0, 10)
  }

  private extractTime(line: string): string {
    const match = line.match(/\d{1,2}:\d{2}:\d{2}\s*[AP]M/i)
    return match ? match[0] : ''
  }

  private getUptime(startedAt: string): string {
    const start = new Date(startedAt).getTime()
    const now = Date.now()
    const diff = now - start

    const hours = Math.floor(diff / (1000 * 60 * 60))
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

    if (hours > 0) {
      return `${hours}h ${mins}m`
    }
    return `${mins}m`
  }

  /**
   * Interactive mode with auto-refresh
   */
  async interactive(): Promise<void> {
    const readline = await import('readline')

    // Enable raw mode for single keypress
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true)
    }
    process.stdin.resume()

    const refresh = () => {
      this.display()
    }

    refresh()

    // Auto-refresh every 5 seconds
    const interval = setInterval(refresh, 5000)

    process.stdin.on('data', async (data) => {
      const key = data.toString()

      if (key === 'q' || key === '\u0003') {
        // Quit
        clearInterval(interval)
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false)
        }
        process.stdin.pause()
        process.stdout.write(chalk.gray('\nExiting dashboard...') + '\n')
        process.exit(0)
      } else if (key === 'r') {
        refresh()
      } else if (key === 's') {
        // Start a new loop
        clearInterval(interval)
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false)
        }

        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        })

        rl.question(chalk.cyan('Enter namespace to start: '), async (namespace) => {
          rl.close()
          if (namespace) {
            const result = await this.monitor.start(namespace.trim())
            if (result.success) {
              process.stdout.write(chalk.green(`✓ Started ${namespace} (PID: ${result.pid})`) + '\n')
            } else {
              process.stdout.write(chalk.red(`✗ ${result.error}`) + '\n')
            }
          }
          setTimeout(() => {
            if (process.stdin.isTTY) {
              process.stdin.setRawMode(true)
            }
            refresh()
          }, 1000)
        })
      } else if (key === 'k') {
        // Kill a loop
        clearInterval(interval)
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false)
        }

        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        })

        rl.question(chalk.cyan('Enter namespace to stop (or "all"): '), (namespace) => {
          rl.close()
          if (namespace === 'all') {
            const result = this.monitor.stopAll()
            if (result.stopped.length > 0) {
              process.stdout.write(chalk.green(`✓ Stopped: ${result.stopped.join(', ')}`) + '\n')
            }
          } else if (namespace) {
            const result = this.monitor.stop(namespace.trim())
            if (result.success) {
              process.stdout.write(chalk.green(`✓ Stopped ${namespace}`) + '\n')
            } else {
              process.stdout.write(chalk.red(`✗ ${result.error}`) + '\n')
            }
          }
          setTimeout(() => {
            if (process.stdin.isTTY) {
              process.stdin.setRawMode(true)
            }
            refresh()
          }, 1000)
        })
      } else if (key === 'l') {
        // View logs
        clearInterval(interval)
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false)
        }

        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        })

        rl.question(chalk.cyan('Enter namespace for logs: '), (namespace) => {
          rl.close()
          if (namespace) {
            const logs = this.monitor.getLogs(namespace.trim(), 30)
            process.stdout.write(chalk.gray('\n─'.repeat(60)) + '\n')
            process.stdout.write(logs.join('\n') + '\n')
            process.stdout.write(chalk.gray('─'.repeat(60)) + '\n')
            process.stdout.write(chalk.gray('Press any key to return...') + '\n')

            process.stdin.once('data', () => {
              if (process.stdin.isTTY) {
                process.stdin.setRawMode(true)
              }
              refresh()
            })
          } else {
            if (process.stdin.isTTY) {
              process.stdin.setRawMode(true)
            }
            refresh()
          }
        })
      }
    })
  }

  /**
   * One-time status display
   */
  static display(): void {
    const dashboard = new Dashboard()
    dashboard.display()
  }
}

/**
 * CLI entry point
 */
async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  const dashboard = new Dashboard()

  switch (command) {
    case 'watch':
    case '-w':
      await dashboard.interactive()
      break

    case 'status':
    default:
      dashboard.display()
      break
  }
}

export { Dashboard }

// Only run main when executed directly, not when imported
if (import.meta.main) {
  main().catch((err) => {
    logger.error(`Error: ${err.message}`)
    process.exit(1)
  })
}
