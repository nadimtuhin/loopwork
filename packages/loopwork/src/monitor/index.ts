import fs from 'fs'
import path from 'path'
import { spawn, ChildProcess } from 'child_process'
import chalk from 'chalk'
import { logger } from '../core/utils'
import { detectOrphans, OrphanProcess } from '../core/orphan-detector'
import { OrphanKiller } from '../core/orphan-killer'
import { LoopworkState, type SessionMetadata } from '../core/loopwork-state'
import { isProcessAlive } from '../commands/shared/process-utils'

// export * from './resources' // TODO: Re-enable when resources.ts is created

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

export interface OrphanWatchOptions {
  interval?: number      // Check interval in ms (default: 60000 = 1 min)
  maxAge?: number        // Kill orphans older than X ms (default: 1800000 = 30min)
  autoKill?: boolean     // Auto-kill confirmed orphans (default: false)
  patterns?: string[]    // Additional patterns to watch
}

interface OrphanWatchState {
  watching: boolean
  intervalId: NodeJS.Timeout | null
  lastCheck: string | null
  orphansDetected: number
  orphansKilled: number
  options: OrphanWatchOptions
}

export class LoopworkMonitor {
  private stateFile: string
  private projectRoot: string
  private orphanWatch: OrphanWatchState
  private loopworkState: LoopworkState

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot || process.cwd()
    this.loopworkState = new LoopworkState({ projectRoot: this.projectRoot })
    this.stateFile = this.loopworkState.paths.monitor()
    this.orphanWatch = {
      watching: false,
      intervalId: null,
      lastCheck: null,
      orphansDetected: 0,
      orphansKilled: 0,
      options: {},
    }

    // Clean up interval on exit
    process.on('exit', () => {
      if (this.orphanWatch.intervalId) {
        clearInterval(this.orphanWatch.intervalId)
      }
    })
  }

  /**
   * Start a loop in the background
   */
  async start(namespace: string, args: string[] = []): Promise<{ success: boolean; pid?: number; sessionId?: string; error?: string }> {
    // Check if already running
    const running = this.getRunningProcesses()
    const existing = running.find(p => p.namespace === namespace)
    if (existing) {
      return { success: false, error: `Namespace '${namespace}' is already running (PID: ${existing.pid})` }
    }

    // Build command args
    const fullArgs = ['--namespace', namespace, '-y', ...args]

    // Create session with unified structure
    const nsState = this.loopworkState.withNamespace(namespace)

    // We'll create the session after getting the PID
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

    // Find the real package root - either we are in it, or it's in packages/loopwork
    const currentPkgDir = path.join(this.projectRoot, 'packages/loopwork')
    const spawnCwd = fs.existsSync(currentPkgDir) ? currentPkgDir : this.projectRoot

    // Create log directory using unified session structure
    const sessionDir = nsState.paths.sessionDir(timestamp, namespace)
    const logsDir = path.join(sessionDir, 'logs')
    fs.mkdirSync(logsDir, { recursive: true })

    const logFile = path.join(sessionDir, 'loopwork.log')

    // Spawn background process
    const logStream = fs.openSync(logFile, 'a')

    const child: ChildProcess = spawn('bun', ['run', 'src/index.ts', ...fullArgs], {
      cwd: spawnCwd,
      detached: true,
      stdio: ['ignore', logStream, logStream],
    })

    if (child.unref) {
      child.unref()
    }

    if (!child.pid) {
      return { success: false, error: 'Failed to spawn process' }
    }

    // Create session metadata
    const session: SessionMetadata = {
      id: timestamp,
      namespace,
      mode: 'daemon',
      pid: child.pid,
      startedAt: new Date().toISOString(),
      status: 'running',
      args: fullArgs,
      updatedAt: new Date().toISOString(),
    }
    nsState.writeJson(nsState.paths.sessionFile(timestamp, namespace), session)

    // Also save to monitor state for backward compatibility
    const state = this.loadState()
    state.processes.push({
      namespace,
      pid: child.pid,
      startedAt: session.startedAt,
      logFile,
      args: fullArgs,
    })
    this.saveState(state)

    return { success: true, pid: child.pid, sessionId: timestamp }
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

      // Update session status to stopped
      this.updateLatestSessionStatus(namespace, 'stopped')

      // Remove from state
      state.processes = state.processes.filter(p => p.namespace !== namespace)
      this.saveState(state)

      return { success: true }
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string }
      if (err.code === 'ESRCH') {
        // Process already dead, clean up state and update session
        this.updateLatestSessionStatus(namespace, 'stopped')
        state.processes = state.processes.filter(p => p.namespace !== namespace)
        this.saveState(state)
        return { success: true }
      }
      return { success: false, error: err.message || String(e) }
    }
  }

  /**
   * Update the status of the latest running session for a namespace
   */
  private updateLatestSessionStatus(namespace: string, status: SessionMetadata['status']): void {
    const nsState = this.loopworkState.withNamespace(namespace)
    const latestSession = nsState.getLatestSession(namespace)
    if (latestSession && latestSession.status === 'running') {
      nsState.updateSession(latestSession.id, namespace, { status })
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

    // Stop orphan watch if active
    this.stopOrphanWatch()

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
      if (isProcessAlive(proc.pid)) {
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
    const runsDir = path.join(this.loopworkState.dir, 'runs')
    const namespaces: { name: string; status: 'running' | 'stopped'; lastRun?: string }[] = []

    if (fs.existsSync(runsDir)) {
      try {
        const dirs = fs.readdirSync(runsDir, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name)

        for (const name of dirs) {
          const isRunning = running.some(p => p.namespace === name)
          const nsDir = path.join(runsDir, name)

          // Find last run timestamp
          let lastRun: string | undefined
          try {
            const runDirs = fs.readdirSync(nsDir, { withFileTypes: true })
              .filter(d => d.isDirectory() && d.name !== 'monitor-logs')
              .map(d => d.name)
              .sort()
              .reverse()

            if (runDirs.length > 0) {
              lastRun = runDirs[0]
            }
          } catch {}

          namespaces.push({
            name,
            status: isRunning ? 'running' : 'stopped',
            lastRun,
          })
        }
      } catch {}
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
      const logsDir = this.loopworkState.paths.monitorLogs(namespace)
      if (fs.existsSync(logsDir)) {
        try {
          const files = fs.readdirSync(logsDir)
            .filter(f => f.endsWith('.log'))
            .sort()
            .reverse()
          if (files.length > 0) {
            logFile = path.join(logsDir, files[0])
          }
        } catch {}
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
   * Start orphan process monitoring
   */
  startOrphanWatch(options: OrphanWatchOptions = {}): void {
    if (this.orphanWatch.watching) {
      logger.warn('Orphan watch already running')
      return
    }

    const {
      interval = 60000,      // 1 minute
      maxAge = 1800000,      // 30 minutes
      autoKill = false,
      patterns = [],
    } = options

    this.orphanWatch.options = { interval, maxAge, autoKill, patterns }
    this.orphanWatch.watching = true

    const check = async () => {
      try {
        this.orphanWatch.lastCheck = new Date().toISOString()

        // Detect orphans
        const orphans = await detectOrphans({
          projectRoot: this.projectRoot,
          patterns,
          maxAge: 0, // Get all orphans, we'll filter by age below
        })

        this.orphanWatch.orphansDetected += orphans.length

        if (orphans.length === 0) {
          logger.debug('No orphans detected')
          return
        }

        // Filter orphans by age
        const oldOrphans = orphans.filter(o => o.age >= maxAge)

        if (oldOrphans.length === 0) {
          logger.debug(`Found ${orphans.length} orphans but none exceed maxAge (${maxAge}ms)`)
          this.logOrphanEvents(orphans, 'DETECTED')
          return
        }

        // Log detected orphans
        this.logOrphanEvents(oldOrphans, 'DETECTED')

        // Auto-kill if enabled
        if (autoKill) {
          const killer = new OrphanKiller()
          const result = await killer.kill(oldOrphans, {
            force: false, // Only kill confirmed orphans
            dryRun: false,
          })

          this.orphanWatch.orphansKilled += result.killed.length

          // Log killed orphans
          for (const pid of result.killed) {
            const orphan = oldOrphans.find(o => o.pid === pid)
            if (orphan) {
              this.logOrphanEvent(orphan, 'KILLED', 'exceeded maxAge')
            }
          }

          // Log skipped orphans
          for (const pid of result.skipped) {
            const orphan = oldOrphans.find(o => o.pid === pid)
            if (orphan) {
              this.logOrphanEvent(orphan, 'SKIPPED', 'suspected, autoKill disabled')
            }
          }

          logger.info(`Orphan watch: killed ${result.killed.length}, skipped ${result.skipped.length}`)
        } else {
          logger.info(`Orphan watch: detected ${oldOrphans.length} orphans (autoKill disabled)`)

          // Log skipped orphans
          for (const orphan of oldOrphans) {
            this.logOrphanEvent(orphan, 'SKIPPED', 'autoKill disabled')
          }
        }
      } catch (error) {
        logger.error(`Orphan watch error: ${error}`)
      }
    }

    // Run initial check
    check()

    // Set up interval
    this.orphanWatch.intervalId = setInterval(check, interval)

    logger.info(`Orphan watch started (interval: ${interval}ms, maxAge: ${maxAge}ms, autoKill: ${autoKill})`)
  }

  /**
   * Stop orphan process monitoring
   */
  stopOrphanWatch(): void {
    if (!this.orphanWatch.watching) {
      return
    }

    if (this.orphanWatch.intervalId) {
      clearInterval(this.orphanWatch.intervalId)
      this.orphanWatch.intervalId = null
    }

    this.orphanWatch.watching = false
    logger.info('Orphan watch stopped')
  }

  /**
   * Get orphan watch statistics
   */
  getOrphanStats(): {
    watching: boolean
    lastCheck: string | null
    orphansDetected: number
    orphansKilled: number
  } {
    return {
      watching: this.orphanWatch.watching,
      lastCheck: this.orphanWatch.lastCheck,
      orphansDetected: this.orphanWatch.orphansDetected,
      orphansKilled: this.orphanWatch.orphansKilled,
    }
  }

  /**
   * Log orphan events to file
   */
  private logOrphanEvents(orphans: OrphanProcess[], event: string): void {
    for (const orphan of orphans) {
      this.logOrphanEvent(orphan, event)
    }
  }

  /**
   * Log a single orphan event
   */
  private logOrphanEvent(orphan: OrphanProcess, event: string, reason?: string): void {
    this.loopworkState.ensureDir()
    const logFile = this.loopworkState.paths.orphanEvents()
    const timestamp = new Date().toISOString()
    const ageMin = Math.floor(orphan.age / 60000)
    const statusStr = `status=${orphan.classification}`
    const reasonStr = reason ? ` reason="${reason}"` : ''

    const logLine = `[${timestamp}] ${event} pid=${orphan.pid} cmd="${orphan.command}" age=${ageMin}min ${statusStr}${reasonStr}\n`

    try {
      fs.appendFileSync(logFile, logLine, 'utf-8')
    } catch (error) {
      logger.debug(`Failed to write orphan event log: ${error}`)
    }
  }

  private loadState(): MonitorState {
    try {
      if (fs.existsSync(this.stateFile)) {
        const content = fs.readFileSync(this.stateFile, 'utf-8')
        if (!content || content.trim() === 'undefined') {
          return { processes: [] }
        }
        return JSON.parse(content)
      }
    } catch (e) {
      logger.error(`Failed to load monitor state: ${e}`)
    }
    return { processes: [] }
  }

  private saveState(state: MonitorState): void {
    try {
      if (!state) state = { processes: [] }
      fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2))
    } catch (e) {
      logger.error(`Failed to save monitor state: ${e}`)
    }
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
      logger.info(chalk.blue(`Starting loop in namespace '${namespace}'...`))
      const result = await monitor.start(namespace, extraArgs)
      if (result.success) {
        logger.info(chalk.green(`✓ Started (PID: ${result.pid})`))
        logger.info(chalk.gray(`View logs: bun run src/monitor.ts logs ${namespace}`))
      } else {
        logger.info(chalk.red(`✗ ${result.error}`))
        process.exit(1)
      }
      break
    }

    case 'stop': {
      const namespace = args[1]
      if (!namespace) {
        logger.info(chalk.yellow('Usage: monitor stop <namespace> | monitor stop --all'))
        process.exit(1)
      }
      if (namespace === '--all') {
        const result = monitor.stopAll()
        if (result.stopped.length > 0) {
          logger.info(chalk.green(`✓ Stopped: ${result.stopped.join(', ')}`))
        }
        if (result.errors.length > 0) {
          logger.info(chalk.red(`✗ Errors:\n  ${result.errors.join('\n  ')}`))
        }
        if (result.stopped.length === 0 && result.errors.length === 0) {
          logger.info(chalk.gray('No running loops'))
        }
      } else {
        const result = monitor.stop(namespace)
        if (result.success) {
          logger.info(chalk.green(`✓ Stopped namespace '${namespace}'`))
        } else {
          logger.info(chalk.red(`✗ ${result.error}`))
          process.exit(1)
        }
      }
      break
    }

    case 'status': {
      const { running, namespaces } = monitor.getStatus()

      logger.info(chalk.bold('\nLoopwork Monitor Status'))
      logger.info(chalk.gray('─'.repeat(50)))

      if (running.length === 0) {
        logger.info(chalk.gray('No loops currently running\n'))
      } else {
        logger.info(chalk.bold(`\nRunning (${running.length}):`))
        for (const proc of running) {
          const uptime = getUptime(proc.startedAt)
          logger.info(`  ${chalk.green('●')} ${chalk.bold(proc.namespace)}`)
          logger.info(`    PID: ${proc.pid} | Uptime: ${uptime}`)
          logger.info(`    Log: ${proc.logFile}`)
        }
      }

      if (namespaces.length > 0) {
        logger.info(chalk.bold('\nAll namespaces:'))
        for (const ns of namespaces) {
          const icon = ns.status === 'running' ? chalk.green('●') : chalk.gray('○')
          const lastRunStr = ns.lastRun ? chalk.gray(`(last: ${ns.lastRun})`) : ''
          logger.info(`  ${icon} ${ns.name} ${lastRunStr}`)
        }
      }

      logger.info('')
      break
    }

    case 'logs': {
      const namespace = args[1] || 'default'
      const lines = parseInt(args[2], 10) || 50
      const logLines = monitor.getLogs(namespace, lines)
      logger.info(logLines.join('\n'))
      break
    }

    case 'tail': {
      const namespace = args[1] || 'default'
      const running = monitor.getRunningProcesses()
      const proc = running.find(p => p.namespace === namespace)

      if (!proc) {
        logger.info(chalk.red(`Namespace '${namespace}' is not running`))
        process.exit(1)
      }

      logger.info(chalk.gray(`Tailing ${proc.logFile} (Ctrl+C to stop)\n`))
      const tail = spawn('tail', ['-f', proc.logFile], { stdio: 'inherit' })
      tail.on('close', () => process.exit(0))
      break
    }

    default:
      logger.info(chalk.bold('\nLoopwork Monitor'))
      logger.info(chalk.gray('─'.repeat(30)))
      logger.info(`
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
    logger.error(`Error: ${err.message}`)
    process.exit(1)
  })
}
