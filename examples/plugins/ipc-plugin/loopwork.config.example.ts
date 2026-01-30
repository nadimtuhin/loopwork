/**
 * Loopwork Configuration with IPC Plugin Example
 *
 * This example shows how to enable IPC (Inter-Process Communication)
 * for structured event emission to parent processes.
 */

import { compose, defineConfig } from 'loopwork'
import { withJSONBackend } from 'loopwork/backends'
import { withIPC } from 'loopwork/plugins/ipc'

// ============================================================================
// Example 1: Basic IPC Configuration (Most Common)
// ============================================================================

export default compose(
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),
  withIPC() // Enable IPC with all default settings
)(defineConfig({
  cli: 'claude',
  maxIterations: 50,
  namespace: 'ipc-example'
}))

// ============================================================================
// Example 2: Filtered IPC (Only Task Events)
// ============================================================================

/*
export default compose(
  withJSONBackend(),
  withIPC({
    filter: (event) => event.startsWith('task_')
  })
)(defineConfig({
  cli: 'claude',
  maxIterations: 50
}))
*/

// ============================================================================
// Example 3: Production Config (Only Failures)
// ============================================================================

/*
export default compose(
  withJSONBackend(),
  withIPC({
    filter: (event) => {
      // In production, only emit failures for alerting
      if (process.env.NODE_ENV === 'production') {
        return event === 'task_failed'
      }
      // In dev, emit all events
      return true
    }
  })
)(defineConfig({
  cli: 'claude',
  maxIterations: 100
}))
*/

// ============================================================================
// Example 4: Disabled IPC (For Testing)
// ============================================================================

/*
export default compose(
  withJSONBackend(),
  withIPC({ enabled: false })
)(defineConfig({
  cli: 'claude',
  maxIterations: 50
}))
*/

// ============================================================================
// Example 5: Multiple Plugins with IPC
// ============================================================================

/*
import { withClaudeCode } from 'loopwork/plugins/claude-code'

export default compose(
  withJSONBackend(),
  withIPC(),
  withClaudeCode()
)(defineConfig({
  cli: 'claude',
  maxIterations: 50
}))
*/
