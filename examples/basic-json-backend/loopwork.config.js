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

  // Dynamic task creation - automatically generate follow-up tasks from task results
  // This feature analyzes completed tasks and suggests relevant follow-up work
  dynamicTasks: {
    enabled: true,           // Enable automatic task generation

    // Analyzer option 1: Built-in pattern-based analyzer (fast, no API calls)
    analyzer: 'pattern',     // Detects common patterns like "TODO:", "FIXME:", unhandled errors

    // Analyzer option 2: LLM-based analyzer (more intelligent, requires API)
    // analyzer: 'llm',      // Uses AI to understand context and suggest tasks

    // Analyzer option 3: Custom analyzer instance
    // analyzer: new PatternAnalyzer({ patterns: [...] }),

    createSubTasks: true,    // Create generated tasks as sub-tasks of completed task
    maxTasksPerExecution: 5, // Limit new tasks per completed task (prevents task explosion)
    autoApprove: true,       // Automatically create tasks (set to false for approval queue)
  },

  // Namespace for concurrent runs
  namespace: 'basic-example',
}
