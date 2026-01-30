/**
 * Example configuration using withDynamicTasks plugin
 *
 * This demonstrates the plugin working with the compose pattern
 */

import { compose, defineConfig, withJSONBackend, withDynamicTasks } from '../../src'
import { PatternAnalyzer } from '../../src/analyzers'

export default compose(
  withJSONBackend({
    tasksFile: '.specs/tasks/tasks.json',
    specsDir: '.specs/tasks'
  }),
  withDynamicTasks({
    enabled: true,
    createSubTasks: true,
    maxTasksPerExecution: 3,
    autoApprove: true,
    logCreatedTasks: true,
    analyzer: new PatternAnalyzer({
      patterns: ['todo-comment', 'fixme-comment', 'next-steps']
    })
  })
)(defineConfig({
  cli: 'claude',
  maxIterations: 50,
  timeout: 600
}))
