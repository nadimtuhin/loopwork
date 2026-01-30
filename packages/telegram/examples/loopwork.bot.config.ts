/**
 * Example Loopwork Configuration for Telegram Bot
 *
 * This config enables the IPC plugin for structured communication
 * between the loopwork subprocess and the Telegram bot daemon.
 *
 * Usage:
 *   1. Copy this file to your project root as `loopwork.config.ts`
 *   2. Update the backend configuration as needed
 *   3. The Telegram bot will spawn loopwork with IPC enabled
 */

import { compose, defineConfig, withIPC } from 'loopwork'
import { withJSONBackend } from 'loopwork/backends'

export default compose(
  // Backend: JSON file with markdown PRDs
  withJSONBackend({
    tasksFile: '.specs/tasks/tasks.json'
  }),

  // IPC Plugin: Enables structured communication with parent process
  withIPC({
    enabled: true,
    // Optional: Filter which events to emit
    // filter: (event) => event !== 'log' // Example: exclude log events
  })
)(defineConfig({
  // CLI configuration
  cli: 'claude',
  maxIterations: 50,
  timeout: 300,

  // Model configuration (optional)
  cliConfig: {
    models: {
      primary: [
        { id: 'claude-sonnet-4.5-20250514', rateLimit: 50 },
        { id: 'gemini-2.0-flash-thinking-exp-01-21', rateLimit: 50 }
      ],
      fallback: [
        { id: 'claude-opus-4-20250514', rateLimit: 10 }
      ]
    }
  }
}))
