/**
 * Git Auto-Commit Plugin Example
 *
 * This example demonstrates how to automatically commit changes
 * after each task completion using the git auto-commit plugin.
 */

import { defineConfig, compose, withJSONBackend, withGitAutoCommit } from 'loopwork'

export default compose(
  // Use JSON backend for tasks
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),

  // Enable Git auto-commit
  withGitAutoCommit({
    enabled: true,

    // Automatically stage all changes before committing
    addAll: true,

    // Add co-author to commit message
    coAuthor: 'Loopwork AI <noreply@loopwork.ai>',

    // Skip commit if no changes detected
    skipIfNoChanges: true,

    // Scope of files to commit
    // - 'all': Commit all changed files (default)
    // - 'task-only': Only commit files changed during this task
    // - 'staged-only': Only commit already staged files
    scope: 'all',
  }),
)(
  defineConfig({
    cli: 'claude',
    maxIterations: 50,
    timeout: 600,
  })
)

/**
 * How it works:
 *
 * 1. When a task completes successfully, the plugin will:
 *    - Check if you're in a git repository
 *    - Stage all changes (if addAll: true)
 *    - Create a commit with a structured message including:
 *      - Task ID and title
 *      - Task description (first 5 lines)
 *      - Iteration number and namespace
 *      - Co-author attribution
 *
 * 2. Commit message format:
 *    ```
 *    feat(TASK-001): Add user authentication
 *
 *    Implement JWT-based authentication
 *    - Create login endpoint
 *    - Add token validation middleware
 *    ...
 *
 *    Task: TASK-001
 *    Iteration: 5
 *    Namespace: auth
 *
 *    Co-Authored-By: Loopwork AI <noreply@loopwork.ai>
 *    ```
 *
 * 3. The plugin will gracefully handle errors:
 *    - Won't fail the task if git commit fails
 *    - Skips commit if not in a git repository
 *    - Skips commit if no changes detected
 *    - Skips commit if task failed
 *
 * Benefits:
 * - Automatic logical commit chunking (one commit per task)
 * - Clear audit trail of what was changed for each task
 * - Easy to revert changes if needed
 * - Follows conventional commit format
 * - Includes context (task ID, iteration, namespace)
 */
