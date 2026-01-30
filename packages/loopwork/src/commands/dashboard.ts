import { Dashboard } from '../dashboard/cli'
import { LoopworkError, handleError } from '../core/errors'

export interface DashboardOptions {
  watch?: boolean
}

/**
 * Dashboard command - launch the TUI dashboard
 *
 * Displays an interactive terminal dashboard showing:
 * - Running processes and namespaces
 * - Task progress and status
 * - Recent logs and activity
 *
 * Use --watch for auto-refreshing interactive mode.
 */
export async function dashboard(
  options: DashboardOptions = {},
  deps: { DashboardClass?: typeof Dashboard } = {}
): Promise<void> {
  try {
    const DashboardClass = deps.DashboardClass ?? Dashboard
    const dash = new DashboardClass()

    if (options.watch) {
      // Interactive mode with auto-refresh
      await dash.interactive()
    } else {
      // One-time display
      dash.display()
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    handleError(new LoopworkError(
      `Failed to launch dashboard: ${message}`,
      [
        'Ensure your terminal supports TUI features',
        'Check if the dashboard package is properly installed',
        'Try the simple status command: loopwork status'
      ]
    ))
    process.exit(1)
  }
}

/**
 * Create the dashboard command configuration for CLI registration
 */
export function createDashboardCommand() {
  return {
    name: 'dashboard',
    description: 'Launch interactive TUI dashboard',
    usage: '[options]',
    examples: [
      { command: 'loopwork dashboard', description: 'One-time status display' },
      { command: 'loopwork dashboard --watch', description: 'Auto-refreshing interactive mode' },
    ],
    seeAlso: [
      'loopwork status    Simple status check',
      'loopwork logs      View detailed logs',
    ],
    handler: dashboard,
  }
}
