import { LoopworkError, handleError } from '../core/errors'
import { startInkTui } from '../dashboard/tui'
import { LoopworkMonitor } from '../monitor'
import { Dashboard } from '../dashboard/cli'
import { getBackendAndConfig } from './shared'

export interface DashboardOptions {
  tui?: boolean
  web?: boolean
  watch?: boolean
  port?: number
  // Allow passing backend config options
  config?: string
  backend?: string
  tasksFile?: string
  repo?: string
}

/**
 * Dashboard command - launch the TUI or Web dashboard
 *
 * Displays an interactive dashboard showing:
 * - Running processes and namespaces
 * - Task progress and status
 * - Recent logs and activity
 *
 * Modes:
 * - TUI (default): Terminal-based interactive dashboard
 * - Web: Browser-based dashboard with live updates
 *
 * Use --watch for auto-refreshing TUI mode.
 */
export async function dashboard(
  options: DashboardOptions = {},
  deps: { DashboardClass?: typeof Dashboard } = {}
): Promise<void> {
  try {
    // Web mode: Launch browser-based dashboard
    if (options.web) {
      const port = options.port || 3333

      // Launch the web dashboard server
      // This will be implemented when the web UI is available
      console.log(`Starting Web Dashboard on port ${port}...`)
      console.log(`Opening browser to http://localhost:${port}`)

      // For now, show a message that web UI is coming soon
      throw new LoopworkError(
        'ERR_UNKNOWN',
        'Web UI mode is not yet implemented',
        [
          'Use TUI mode instead: loopwork dashboard',
          'Or run with --tui flag explicitly',
          'Web UI will be available in a future release'
        ]
      )
    }

    // TUI mode (default): Terminal-based Ink dashboard
    const projectRoot = process.cwd()
    const DashboardClass = deps.DashboardClass || Dashboard
    const legacyDash = new DashboardClass(projectRoot)

    // Check for TTY support before trying Ink
    const isRawModeSupported = process.stdin.isTTY

    // If no TTY, use the legacy chalk-based dashboard instead
    if (!isRawModeSupported) {
      console.log('Running in non-interactive mode - using simple status display\n')

      // Display one-time status and exit
      // Default to interactive mode when watch is undefined or true
      const watchMode = options.watch ?? true
      if (watchMode) {
        await legacyDash.interactive()
      } else {
        legacyDash.display()
      }

      // Show a simple message and exit
      console.log('\nFor interactive TUI, run in a proper terminal:')
      console.log('  loopwork dashboard')
      return
    }

    try {
      const monitor = new LoopworkMonitor(projectRoot)
      
      // Initialize backend to get task stats
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let backend: any = null
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { backend: initializedBackend } = await getBackendAndConfig(options as any)
        backend = initializedBackend
      } catch {
        // If backend fails to initialize, continue without task stats to show process status
      }

      // Launch Ink TUI dashboard with data callbacks
      await startInkTui({
        port: options.port || 3333,
        watch: options.watch ?? true,
        directMode: true,
        getState: async () => {
          const { running } = monitor.getStatus()
          const activity = legacyDash.getRecentActivity()

          // Convert activity to task events format
          const completedTasks = activity.filter(a => a.type === 'completed').map(a => ({
            id: a.message.replace('Completed ', ''),
            title: a.message,
          }))
          const failedTasks = activity.filter(a => a.type === 'failed').map(a => ({
            id: a.message.replace('Failed ', ''),
            title: a.message,
          }))

          // Convert activity to recent events format for display
          const recentEvents = activity.map(a => ({
            id: a.message.replace(/^(Completed|Failed|Started iteration) /, ''),
            title: a.message,
            status: (a.type === 'completed' ? 'completed' : a.type === 'failed' ? 'failed' : 'started') as 'started' | 'completed' | 'failed',
            timestamp: new Date(), // Activity doesn't have full timestamps
          }))

          // Fetch pending tasks from backend if available
          let pendingCount = 0
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let pendingTasksList: any[] = []
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let currentTaskFromBackend: any = null

          if (backend) {
            try {
              pendingCount = await backend.countPending()
              // Fetch a small list of pending tasks for display
              pendingTasksList = await backend.listPendingTasks({ 
                priority: undefined, // undefined to get default sorting
                limit: 5 // We only show top 3-5 anyway
              })

              // Check for in-progress tasks in backend
              const inProgressTasks = await backend.listTasks({ status: 'in-progress' })
              if (inProgressTasks.length > 0) {
                currentTaskFromBackend = inProgressTasks[0]
              }
            } catch {
              // Ignore backend errors during refresh
            }
          }

          // Combine monitor info (PID) and backend info (Task ID)
          let displayTask = null
          if (running.length > 0) {
             displayTask = { 
               id: `PID-${running[0].pid}`, 
               title: `Running in ${running[0].namespace}` 
             }
          } 
          // Prefer backend task info if available because it's more descriptive (has Task ID and Title)
          if (currentTaskFromBackend) {
             displayTask = { 
               id: currentTaskFromBackend.id, 
               title: currentTaskFromBackend.title,
               startedAt: currentTaskFromBackend.timestamps?.startedAt ? new Date(currentTaskFromBackend.timestamps.startedAt) : undefined
             }
          }

          return {
            currentTask: displayTask,
            pendingTasks: pendingTasksList,
            completedTasks,
            failedTasks,
            stats: {
              total: completedTasks.length + failedTasks.length + pendingCount + (displayTask ? 1 : 0),
              pending: pendingCount,
              completed: completedTasks.length,
              failed: failedTasks.length,
            },
            recentEvents,
          }
        },
        getRunningLoops: async () => {
          const running = monitor.getRunningProcesses()
          return running.map(p => ({
            namespace: p.namespace,
            pid: p.pid,
            startTime: new Date(p.startedAt),
          }))
        },
        getNamespaces: async () => {
          const { namespaces } = monitor.getStatus()
          return namespaces.map(ns => ns.name)
        },
      })
    } catch (tuiError: unknown) {
      // If TUI fails (e.g., non-interactive terminal), suggest web mode
      const message = tuiError instanceof Error ? tuiError.message : String(tuiError)

      // Check if this is a terminal compatibility issue
      if (message.includes('TTY') || message.includes('interactive') || !process.stdout.isTTY) {
        throw new LoopworkError(
          'ERR_TUI_UNSUPPORTED',
          'TUI mode requires an interactive terminal',
          [
            'Your terminal does not support interactive TUI mode',
            'Try using Web mode instead: loopwork dashboard --web',
            'Or redirect output: loopwork status'
          ]
        )
      }

      throw tuiError
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)

    // If it's already a LoopworkError, just handle it
    if (error instanceof LoopworkError) {
      handleError(error)
    } else {
      handleError(new LoopworkError(
        'ERR_UNKNOWN',
        `Failed to launch dashboard: ${message}`,
        [
          'Ensure your terminal supports TUI features',
          'Check if the dashboard package is properly installed',
          'Try the simple status command: loopwork status',
          'Or try Web mode: loopwork dashboard --web'
        ]
      ))
    }
    process.exit(1)
  }
}

/**
 * Create the dashboard command configuration for CLI registration
 */
export function createDashboardCommand() {
  return {
    name: 'dashboard',
    description: 'View task progress and statistics',
    usage: '[options]',
    options: [
      {
        flags: '-t, --tui',
        description: 'Terminal UI mode (default)'
      },
      {
        flags: '-w, --web',
        description: 'Web UI mode (opens browser)'
      },
      {
        flags: '--watch',
        description: 'Auto-refresh in TUI mode (enabled by default)'
      },
      {
        flags: '-p, --port <number>',
        description: 'Dashboard server port',
        default: '3333'
      }
    ],
    examples: [
      { command: 'loopwork dashboard', description: 'Launch TUI dashboard with auto-refresh' },
      { command: 'loopwork dashboard --tui', description: 'Explicitly launch TUI mode' },
      { command: 'loopwork dashboard --web', description: 'Launch Web UI in browser' },
      { command: 'loopwork dashboard --web --port 8080', description: 'Web UI on custom port' },
      { command: 'loopwork dashboard --no-watch', description: 'TUI one-time display' },
    ],
    seeAlso: [
      'loopwork status    Simple status check',
      'loopwork logs      View detailed logs',
    ],
    handler: dashboard,
  }
}
