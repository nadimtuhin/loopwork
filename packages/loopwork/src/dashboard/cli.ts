import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import { LoopworkMonitor } from '../monitor'

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

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot || process.cwd()
    this.monitor = new LoopworkMonitor(this.projectRoot)
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
    console.log(chalk.bold.cyan('\n╔══════════════════════════════════════════════════════════════╗'))
    console.log(chalk.bold.cyan('║                    RALPH LOOP DASHBOARD                       ║'))
    console.log(chalk.bold.cyan('╚══════════════════════════════════════════════════════════════╝'))
    console.log(chalk.gray(`  ${new Date().toLocaleString()}`))
    console.log()
  }

  private printRunningLoops(): void {
    const { running, namespaces } = this.monitor.getStatus()

    console.log(chalk.bold.white('┌─ Running Loops ─────────────────────────────────────────────┐'))

    if (running.length === 0) {
      console.log(chalk.gray('│  No loops currently running                                 │'))
    } else {
      for (const proc of running) {
        const stats = this.getNamespaceStats(proc.namespace)
        const uptime = this.getUptime(proc.startedAt)

        console.log(chalk.green(`│  ● ${chalk.bold(proc.namespace.padEnd(15))} PID: ${String(proc.pid).padEnd(8)} Uptime: ${uptime.padEnd(10)} │`))

        if (stats.currentTask) {
          console.log(chalk.gray(`│    └─ Current: ${stats.currentTask.padEnd(43)} │`))
        }

        const taskLine = `Completed: ${chalk.green(stats.tasks.completed)} | Failed: ${chalk.red(stats.tasks.failed)} | Pending: ${chalk.yellow(stats.tasks.pending)}`
        console.log(chalk.gray(`│    └─ ${taskLine.padEnd(51)} │`))
      }
    }

    console.log(chalk.white('└─────────────────────────────────────────────────────────────┘'))
    console.log()

    // Show stopped namespaces
    const stopped = namespaces.filter(n => n.status === 'stopped')
    if (stopped.length > 0) {
      console.log(chalk.bold.white('┌─ Available Namespaces ───────────────────────────────────────┐'))
      for (const ns of stopped) {
        const lastRunStr = ns.lastRun || 'never'
        console.log(chalk.gray(`│  ○ ${ns.name.padEnd(20)} Last run: ${lastRunStr.padEnd(25)} │`))
      }
      console.log(chalk.white('└─────────────────────────────────────────────────────────────┘'))
      console.log()
    }
  }

  private printRecentActivity(): void {
    console.log(chalk.bold.white('┌─ Recent Activity ───────────────────────────────────────────┐'))

    const activity = this.getRecentActivity()

    if (activity.length === 0) {
      console.log(chalk.gray('│  No recent activity                                         │'))
    } else {
      for (const item of activity.slice(0, 10)) {
        const icon = item.type === 'completed' ? chalk.green('✓')
          : item.type === 'failed' ? chalk.red('✗')
          : chalk.blue('→')

        const line = `${icon} ${chalk.gray(item.time)} ${item.namespace}: ${item.message}`
        console.log(`│  ${line.padEnd(65)}│`)
      }
    }

    console.log(chalk.white('└─────────────────────────────────────────────────────────────┘'))
    console.log()
  }

  private printHelp(): void {
    console.log(chalk.gray('Commands:'))
    console.log(chalk.gray('  q - Quit | r - Refresh | s - Start loop | k - Kill loop | l - View logs'))
    console.log()
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

    // Parse state file for current task
    const stateFile = path.join(
      this.projectRoot,
      namespace === 'default' ? '.loopwork-state' : `.loopwork-state-${namespace}`
    )

    if (fs.existsSync(stateFile)) {
      try {
        const content = fs.readFileSync(stateFile, 'utf-8')
        const lines = content.split('\n')
        for (const line of lines) {
          const [key, value] = line.split('=')
          if (key === 'LAST_ISSUE' && value) {
            stats.currentTask = `Task #${value}`
          }
          if (key === 'LAST_ITERATION' && value) {
            stats.iterations = parseInt(value, 10)
          }
        }
      } catch {}
    }

    // Count tasks from logs
    const logsDir = path.join(this.projectRoot, 'loopwork-runs', namespace)
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
   * Get recent activity across all namespaces
   */
  private getRecentActivity(): { time: string; namespace: string; type: string; message: string }[] {
    const activity: { time: string; namespace: string; type: string; message: string }[] = []

    const runsDir = path.join(this.projectRoot, 'loopwork-runs')
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
        console.log(chalk.gray('\nExiting dashboard...'))
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
              console.log(chalk.green(`✓ Started ${namespace} (PID: ${result.pid})`))
            } else {
              console.log(chalk.red(`✗ ${result.error}`))
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
              console.log(chalk.green(`✓ Stopped: ${result.stopped.join(', ')}`))
            }
          } else if (namespace) {
            const result = this.monitor.stop(namespace.trim())
            if (result.success) {
              console.log(chalk.green(`✓ Stopped ${namespace}`))
            } else {
              console.log(chalk.red(`✗ ${result.error}`))
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
            console.log(chalk.gray('\n─'.repeat(60)))
            console.log(logs.join('\n'))
            console.log(chalk.gray('─'.repeat(60)))
            console.log(chalk.gray('Press any key to return...'))

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
    console.error(chalk.red(`Error: ${err.message}`))
    process.exit(1)
  })
}
