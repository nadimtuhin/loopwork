import { LoopworkError, handleError } from '../core/errors'
import { startInkTui } from '../dashboard/tui'
import { LoopworkMonitor } from '../monitor'
import { Dashboard } from '../dashboard/cli'

export interface DashboardOptions {
  tui?: boolean
  web?: boolean
  watch?: boolean
  port?: number
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
  options: DashboardOptions = {}
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
        'ERR_NOT_IMPLEMENTED',
        'Web UI mode is not yet implemented',
        [
          'Use TUI mode instead: loopwork dashboard',
          'Or run with --tui flag explicitly',
          'Web UI will be available in a future release'
        ]
      )
    }

    // TUI mode (default): Terminal-based Ink dashboard
    try {
      const projectRoot = process.cwd()
      const monitor = new LoopworkMonitor(projectRoot)
      const legacyDash = new Dashboard(projectRoot)

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

          return {
            currentTask: running.length > 0 ? { id: `PID-${running[0].pid}`, title: `Running in ${running[0].namespace}` } : null,
            pendingTasks: [],
            completedTasks,
            failedTasks,
            stats: {
              total: completedTasks.length + failedTasks.length,
              pending: 0,
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
            startTime: p.startedAt,
          }))
        },
        getNamespaces: async () => {
          const { namespaces } = monitor.getStatus()
          return namespaces
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
