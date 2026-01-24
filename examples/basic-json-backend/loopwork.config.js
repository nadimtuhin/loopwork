/**
 * Basic Loopwork Configuration Example
 *
 * This is a minimal configuration for testing loopwork with JSON backend.
 * Tasks are stored in .specs/tasks/tasks.json
 */

export default {
  // Backend configuration
  backend: {
    type: 'json',
    tasksFile: '.specs/tasks/tasks.json',
    tasksDir: '.specs/tasks',
  },

  // CLI tool to use: 'opencode' or 'claude'
  cli: 'claude',

  // Loop settings
  maxIterations: 10,
  timeout: 300, // 5 minutes per task

  // Optional settings
  // dryRun: false,       // Set to true to test without executing (use --dry-run flag instead)
  debug: true,         // Enable debug logging
  // autoConfirm: false,  // Set to true to skip confirmations (use -y flag instead)

  // Retry settings
  maxRetries: 2,
  retryDelay: 3000,    // Wait 3 seconds before retry
  taskDelay: 2000,     // Wait 2 seconds between tasks

  // Namespace for concurrent runs
  namespace: 'basic-example',
}
