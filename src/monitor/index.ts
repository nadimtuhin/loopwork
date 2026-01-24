import fs from 'fs'
import path from 'path'
import { spawn, ChildProcess } from 'child_process'
import chalk from 'chalk'

/**
 * Monitor for running Loopwork instances in the background
 *
 * Features:
 * - Start/stop loops by namespace
 * - Track running processes
 * - View logs and status
 */

interface LoopProcess {
  namespace: string
  pid: number
  startedAt: string
  logFile: string
  args: string[]
}

interface MonitorState {
  processes: LoopProcess[]
}

const MONITOR_STATE_FILE = '.loopwork-monitor-state.json'

export class LoopworkMonitor {
  private stateFile: string
  private projectRoot: string

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot || process.cwd()
    this.stateFile = path.join(this.projectRoot, MONITOR_STATE_FILE)
  }

  /**
   * Start a loop in the background
   */
  async start(namespace: string, args: string[] = []): Promise<{ success: boolean; pid?: number; error?: string }> {
    // Check if already running
    const running = this.getRunningProcesses()
    const existing = running.find(p => p.namespace === namespace)
    if (existing) {
      return { success: false, error: `Namespace '${namespace}' is already running (PID: ${existing.pid})` }
    }

    // Create log directory
    const logsDir = path.join(this.projectRoot, 'loopwork-runs', namespace, 'monitor-logs')
    fs.mkdirSync(logsDir, { recursive: true })

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const logFile = path.join(logsDir, `${timestamp}.log`)

    // Build command args
    const fullArgs = ['--namespace', namespace, '-y', ...args]

    // Spawn background process
    const logStream = fs.openSync(logFile, 'a')

    const child: ChildProcess = spawn('bun', ['run', 'src/index.ts', ...fullArgs], {
      cwd: path.join(this.projectRoot, 'packages/loopwork'),
      detached: true,
      stdio: ['ignore', logStream, logStream],
    })

    child.unref()

    if (!child.pid) {
      return { success: false, error: 'Failed to spawn process' }
    }

    // Save to state
    const state = this.loadState()
    state.processes.push({
      namespace,
      pid: child.pid,
      startedAt: new Date().toISOString(),
      logFile,
      args: fullArgs,
    })
    this.saveState(state)

    return { success: true, pid: child.pid }
  }

  /**
   * Stop a running loop by namespace
   */
  stop(namespace: string): { success: boolean; error?: string } {
    const state = this.loadState()
    const proc = state.processes.find(p => p.namespace === namespace)

    if (!proc) {
      return { success: false, error: `No running loop found for namespace '${namespace}'` }
    }

    try {
      process.kill(proc.pid, 'SIGTERM')

      // Remove from state
      state.processes = state.processes.filter(p => p.namespace !== namespace)
      this.saveState(state)

      return { success: true }
    } catch (e: any) {
      if (e.code === 'ESRCH') {
        // Process already dead, clean up state
        state.processes = state.processes.filter(p => p.namespace !== namespace)
        this.saveState(state)
        return { success: true }
      }
      return { success: false, error: e.message }
    }
  }

  /**
   * Stop all running loops
   */
  stopAll(): { stopped: string[]; errors: string[] } {
    const stopped: string[] = []
    const errors: string[] = []

    const running = this.getRunningProcesses()
    for (const proc of running) {
      const result = this.stop(proc.namespace)
      if (result.success) {
        stopped.push(proc.namespace)
      } else {
        errors.push(`${proc.namespace}: ${result.error}`)
      }
    }

    return { stopped, errors }
  }

  /**
   * Get list of running processes (with validation)
   */
  getRunningProcesses(): LoopProcess[] {
    const state = this.loadState()
    const running: LoopProcess[] = []
    const toRemove: string[] = []

    for (const proc of state.processes) {
      if (this.isProcessAlive(proc.pid)) {
        running.push(proc)
      } else {
        toRemove.push(proc.namespace)
      }
    }

    // Clean up dead processes
    if (toRemove.length > 0) {
      state.processes = state.processes.filter(p => !toRemove.includes(p.namespace))
      this.saveState(state)
    }

    return running
  }

  /**
   * Get status of all namespaces
   */
  getStatus(): {
    running: LoopProcess[]
    namespaces: { name: string; status: 'running' | 'stopped'; lastRun?: string }[]
  } {
    const running = this.getRunningProcesses()

    // Find all namespaces from directories
    const runsDir = path.join(this.projectRoot, 'loopwork-runs')
    const namespaces: { name: string; status: 'running' | 'stopped'; lastRun?: string }[] = []

    if (fs.existsSync(runsDir)) {
      const dirs = fs.readdirSync(runsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)

      for (const name of dirs) {
        const isRunning = running.some(p => p.namespace === name)
        const nsDir = path.join(runsDir, name)

        // Find last run timestamp
        let lastRun: string | undefined
        const runDirs = fs.readdirSync(nsDir, { withFileTypes: true })
          .filter(d => d.isDirectory() && d.name !== 'monitor-logs')
          .map(d => d.name)
          .sort()
          .reverse()

        if (runDirs.length > 0) {
          lastRun = runDirs[0]
        }

        namespaces.push({
          name,
          status: isRunning ? 'running' : 'stopped',
          lastRun,
        })
      }
    }

    return { running, namespaces }
  }

  /**
   * Get recent logs for a namespace
   */
  getLogs(namespace: string, lines = 50): string[] {
    const running = this.getRunningProcesses()
    const proc = running.find(p => p.namespace === namespace)

    let logFile: string | undefined

    if (proc) {
      logFile = proc.logFile
    } else {
      // Find most recent log file
      const logsDir = path.join(this.projectRoot, 'loopwork-runs', namespace, 'monitor-logs')
      if (fs.existsSync(logsDir)) {
        const files = fs.readdirSync(logsDir)
          .filter(f => f.endsWith('.log'))
          .sort()
          .reverse()
        if (files.length > 0) {
          logFile = path.join(logsDir, files[0])
        }
      }
    }

    if (!logFile || !fs.existsSync(logFile)) {
      return [`No logs found for namespace '${namespace}'`]
    }

    const content = fs.readFileSync(logFile, 'utf-8')
    const allLines = content.split('\n')
    return allLines.slice(-lines)
  }

  /**
   * Check if a process is still alive
   */
  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }

  private loadState(): MonitorState {
    try {
      if (fs.existsSync(this.stateFile)) {
        const content = fs.readFileSync(this.stateFile, 'utf-8')
        return JSON.parse(content)
      }
    } catch {}
    return { processes: [] }
  }

  private saveState(state: MonitorState): void {
    fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2))
  }
}

/**
 * CLI for the monitor
 */
async function main() {
  const args = process.argv.slice(2)
  const command = args[0]
  const monitor = new LoopworkMonitor()

  switch (command) {
    case 'start': {
      const namespace = args[1] || 'default'
      const extraArgs = args.slice(2)
      console.log(chalk.blue(`Starting loop in namespace '${namespace}'...`))
      const result = await monitor.start(namespace, extraArgs)
      if (result.success) {
        console.log(chalk.green(`✓ Started (PID: ${result.pid})`))
        console.log(chalk.gray(`View logs: bun run src/monitor.ts logs ${namespace}`))
      } else {
        console.log(chalk.red(`✗ ${result.error}`))
        process.exit(1)
      }
      break
    }

    case 'stop': {
      const namespace = args[1]
      if (!namespace) {
        console.log(chalk.yellow('Usage: monitor stop <namespace> | monitor stop --all'))
        process.exit(1)
      }
      if (namespace === '--all') {
        const result = monitor.stopAll()
        if (result.stopped.length > 0) {
          console.log(chalk.green(`✓ Stopped: ${result.stopped.join(', ')}`))
        }
        if (result.errors.length > 0) {
          console.log(chalk.red(`✗ Errors:\n  ${result.errors.join('\n  ')}`))
        }
        if (result.stopped.length === 0 && result.errors.length === 0) {
          console.log(chalk.gray('No running loops'))
        }
      } else {
        const result = monitor.stop(namespace)
        if (result.success) {
          console.log(chalk.green(`✓ Stopped namespace '${namespace}'`))
        } else {
          console.log(chalk.red(`✗ ${result.error}`))
          process.exit(1)
        }
      }
      break
    }

    case 'status': {
      const { running, namespaces } = monitor.getStatus()

      console.log(chalk.bold('\nLoopwork Monitor Status'))
      console.log(chalk.gray('─'.repeat(50)))

      if (running.length === 0) {
        console.log(chalk.gray('No loops currently running\n'))
      } else {
        console.log(chalk.bold(`\nRunning (${running.length}):`))
        for (const proc of running) {
          const uptime = getUptime(proc.startedAt)
          console.log(`  ${chalk.green('●')} ${chalk.bold(proc.namespace)}`)
          console.log(`    PID: ${proc.pid} | Uptime: ${uptime}`)
          console.log(`    Log: ${proc.logFile}`)
        }
      }

      if (namespaces.length > 0) {
        console.log(chalk.bold('\nAll namespaces:'))
        for (const ns of namespaces) {
          const icon = ns.status === 'running' ? chalk.green('●') : chalk.gray('○')
          const lastRunStr = ns.lastRun ? chalk.gray(`(last: ${ns.lastRun})`) : ''
          console.log(`  ${icon} ${ns.name} ${lastRunStr}`)
        }
      }

      console.log()
      break
    }

    case 'logs': {
      const namespace = args[1] || 'default'
      const lines = parseInt(args[2], 10) || 50
      const logLines = monitor.getLogs(namespace, lines)
      console.log(logLines.join('\n'))
      break
    }

    case 'tail': {
      const namespace = args[1] || 'default'
      const running = monitor.getRunningProcesses()
      const proc = running.find(p => p.namespace === namespace)

      if (!proc) {
        console.log(chalk.red(`Namespace '${namespace}' is not running`))
        process.exit(1)
      }

      console.log(chalk.gray(`Tailing ${proc.logFile} (Ctrl+C to stop)\n`))
      const tail = spawn('tail', ['-f', proc.logFile], { stdio: 'inherit' })
      tail.on('close', () => process.exit(0))
      break
    }

    default:
      console.log(chalk.bold('\nLoopwork Monitor'))
      console.log(chalk.gray('─'.repeat(30)))
      console.log(`
Commands:
  ${chalk.cyan('start <namespace> [args...]')}  Start a loop in background
  ${chalk.cyan('stop <namespace>')}             Stop a running loop
  ${chalk.cyan('stop --all')}                   Stop all running loops
  ${chalk.cyan('status')}                       Show status of all loops
  ${chalk.cyan('logs <namespace> [lines]')}     Show recent logs
  ${chalk.cyan('tail <namespace>')}             Follow logs in real-time

Examples:
  bun run src/monitor.ts start default --feature auth
  bun run src/monitor.ts start feature-a --backend github
  bun run src/monitor.ts status
  bun run src/monitor.ts logs feature-a 100
  bun run src/monitor.ts stop --all
`)
      break
  }
}

function getUptime(startedAt: string): string {
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

// Only run main when executed directly, not when imported
if (import.meta.main) {
  main().catch((err) => {
    console.error(chalk.red(`Error: ${err.message}`))
    process.exit(1)
  })
}
