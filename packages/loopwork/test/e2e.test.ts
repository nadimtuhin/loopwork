import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import fs from 'fs'
import path from 'path'
import os from 'os'
// Removed type-only import from '../src/backends/json'
import { StateManager } from '../src/core/state'
import { CliExecutor } from '../src/core/cli'
import type { Config } from '../src/core/config'
import type { Task } from '../src/backends/types'

/**
 * End-to-End Test for Loopwork with JSON Backend
 *
 * This test simulates the complete loopwork workflow:
 * 1. Setting up tasks in JSON format
 * 2. Running the task loop
 * 3. Executing tasks (mocked CLI)
 * 4. Verifying task status changes
 */

describe('Loopwork E2E with JSON Backend', () => {
  let tempDir: string
  let tasksFile: string
  let config: Config
  let backend: JsonTaskAdapter
  let stateManager: StateManager

  beforeEach(() => {
    // Create temp directory for test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loopwork-e2e-'))
    tasksFile = path.join(tempDir, 'tasks.json')

    // Create config
    config = {
      projectRoot: tempDir,
      backend: {
        type: 'json',
        tasksFile,
        tasksDir: tempDir,
      },
      cli: 'claude',
      maxIterations: 10,
      timeout: 30,
      namespace: 'test',
      sessionId: 'test-session-123',
      outputDir: path.join(tempDir, 'output'),
      dryRun: false,
      debug: false,
      autoConfirm: true,
      maxRetries: 2,
      circuitBreakerThreshold: 3,
      taskDelay: 0,
      retryDelay: 0,
    }

    // Initialize backend and state manager
    backend = new JsonTaskAdapter(config.backend)
    stateManager = new StateManager(config)

    // Create output directory
    fs.mkdirSync(config.outputDir, { recursive: true })
    fs.mkdirSync(path.join(config.outputDir, 'logs'), { recursive: true })
  })

  afterEach(() => {
    // Cleanup
    stateManager.releaseLock()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test('completes simple task workflow', async () => {
    // Setup: Create tasks
    const tasksData = {
      tasks: [
        { id: 'TASK-001-01', status: 'pending' as const, priority: 'high' as const },
        { id: 'TASK-001-02', status: 'pending' as const, priority: 'medium' as const },
      ],
    }
    fs.writeFileSync(tasksFile, JSON.stringify(tasksData, null, 2))

    // Create PRD files
    fs.writeFileSync(
      path.join(tempDir, 'TASK-001-01.md'),
      '# TASK-001-01: Implement login\n\n## Goal\nAdd login functionality with username and password'
    )
    fs.writeFileSync(
      path.join(tempDir, 'TASK-001-02.md'),
      '# TASK-001-02: Add logout button\n\n## Goal\nAdd a logout button to the navbar'
    )

    // Verify initial state
    const initialPending = await backend.countPending()
    expect(initialPending).toBe(2)

    // Execute first task
    const task1 = await backend.findNextTask()
    expect(task1).not.toBeNull()
    expect(task1!.id).toBe('TASK-001-01') // High priority first

    await backend.markInProgress(task1!.id)
    let loadedTask = await backend.getTask(task1!.id)
    expect(loadedTask!.status).toBe('in-progress')

    // Complete first task
    await backend.markCompleted(task1!.id)
    loadedTask = await backend.getTask(task1!.id)
    expect(loadedTask!.status).toBe('completed')

    // Verify only one pending remains
    const midPending = await backend.countPending()
    expect(midPending).toBe(1)

    // Execute second task
    const task2 = await backend.findNextTask()
    expect(task2).not.toBeNull()
    expect(task2!.id).toBe('TASK-001-02')

    await backend.markInProgress(task2!.id)
    await backend.markCompleted(task2!.id)

    // Verify all tasks completed
    const finalPending = await backend.countPending()
    expect(finalPending).toBe(0)
  })

  test('handles task failure and retry', async () => {
    // Setup: Create task
    const tasksData = {
      tasks: [{ id: 'TASK-002-01', status: 'pending' as const, priority: 'high' as const }],
    }
    fs.writeFileSync(tasksFile, JSON.stringify(tasksData, null, 2))
    fs.writeFileSync(
      path.join(tempDir, 'TASK-002-01.md'),
      '# TASK-002-01: Complex task\n\n## Goal\nImplement complex feature'
    )

    const task = await backend.findNextTask()
    expect(task).not.toBeNull()

    // Mark as in progress
    await backend.markInProgress(task!.id)

    // Simulate failure
    await backend.markFailed(task!.id, 'Test error: Something went wrong')
    let loadedTask = await backend.getTask(task!.id)
    expect(loadedTask!.status).toBe('failed')

    // Check error log
    const logFile = path.join(tempDir, `${task!.id}.log`)
    expect(fs.existsSync(logFile)).toBe(true)
    const logContent = fs.readFileSync(logFile, 'utf-8')
    expect(logContent).toContain('Something went wrong')

    // Reset to pending for retry
    await backend.resetToPending(task!.id)
    loadedTask = await backend.getTask(task!.id)
    expect(loadedTask!.status).toBe('pending')

    // Second attempt succeeds
    await backend.markInProgress(task!.id)
    await backend.markCompleted(task!.id)
    loadedTask = await backend.getTask(task!.id)
    expect(loadedTask!.status).toBe('completed')
  })

  test('respects task priority ordering', async () => {
    // Setup: Create tasks with different priorities
    const tasksData = {
      tasks: [
        { id: 'TASK-003-01', status: 'pending' as const, priority: 'low' as const },
        { id: 'TASK-003-02', status: 'pending' as const, priority: 'high' as const },
        { id: 'TASK-003-03', status: 'pending' as const, priority: 'medium' as const },
      ],
    }
    fs.writeFileSync(tasksFile, JSON.stringify(tasksData, null, 2))

    // Create PRD files
    for (const task of tasksData.tasks) {
      fs.writeFileSync(path.join(tempDir, `${task.id}.md`), `# ${task.id}\n\nTask content`)
    }

    // Get tasks in priority order
    const tasks = await backend.listPendingTasks()
    expect(tasks.length).toBe(3)
    expect(tasks[0].id).toBe('TASK-003-02') // High priority first
    expect(tasks[1].id).toBe('TASK-003-03') // Medium priority second
    expect(tasks[2].id).toBe('TASK-003-01') // Low priority last

    // Find next task should return highest priority
    const nextTask = await backend.findNextTask()
    expect(nextTask!.id).toBe('TASK-003-02')
  })

  test('handles task dependencies', async () => {
    // Setup: Create tasks with dependencies
    const tasksData = {
      tasks: [
        { id: 'TASK-004-01', status: 'pending' as const, priority: 'high' as const },
        {
          id: 'TASK-004-02',
          status: 'pending' as const,
          priority: 'high' as const,
          dependsOn: ['TASK-004-01'],
        },
      ],
    }
    fs.writeFileSync(tasksFile, JSON.stringify(tasksData, null, 2))

    // Create PRD files
    for (const task of tasksData.tasks) {
      fs.writeFileSync(path.join(tempDir, `${task.id}.md`), `# ${task.id}\n\nTask content`)
    }

    // Task 2 should be blocked initially
    const pendingTasks = await backend.listPendingTasks()
    expect(pendingTasks.length).toBe(1)
    expect(pendingTasks[0].id).toBe('TASK-004-01') // Only unblocked task

    // Check dependencies
    const depsMet = await backend.areDependenciesMet('TASK-004-02')
    expect(depsMet).toBe(false)

    // Complete Task 1
    await backend.markInProgress('TASK-004-01')
    await backend.markCompleted('TASK-004-01')

    // Task 2 should now be unblocked
    const newPendingTasks = await backend.listPendingTasks()
    expect(newPendingTasks.length).toBe(1)
    expect(newPendingTasks[0].id).toBe('TASK-004-02')

    const depsMetNow = await backend.areDependenciesMet('TASK-004-02')
    expect(depsMetNow).toBe(true)
  })

  test('creates and manages sub-tasks', async () => {
    // Setup: Create parent task
    const tasksData = {
      tasks: [{ id: 'TASK-005-01', status: 'pending' as const, priority: 'high' as const }],
    }
    fs.writeFileSync(tasksFile, JSON.stringify(tasksData, null, 2))
    fs.writeFileSync(
      path.join(tempDir, 'TASK-005-01.md'),
      '# TASK-005-01: Parent task\n\nParent task content'
    )

    // Create sub-task
    const subtask = await backend.createSubTask('TASK-005-01', {
      title: 'TASK-005-01a: Sub-task 1',
      description: 'First sub-task',
      priority: 'medium',
    })

    expect(subtask.id).toBe('TASK-005-01a')
    expect(subtask.parentId).toBe('TASK-005-01')
    expect(subtask.status).toBe('pending')

    // Verify PRD file was created
    const prdPath = path.join(tempDir, 'TASK-005-01a.md')
    expect(fs.existsSync(prdPath)).toBe(true)

    // Get sub-tasks
    const subtasks = await backend.getSubTasks('TASK-005-01')
    expect(subtasks.length).toBe(1)
    expect(subtasks[0].id).toBe('TASK-005-01a')

    // List pending can filter by parent
    const pendingSubtasks = await backend.listPendingTasks({ parentId: 'TASK-005-01' })
    expect(pendingSubtasks.length).toBe(1)
    expect(pendingSubtasks[0].id).toBe('TASK-005-01a')
  })

  test('filters tasks by feature', async () => {
    // Setup: Create tasks with features
    const tasksData = {
      tasks: [
        { id: 'TASK-006-01', status: 'pending' as const, priority: 'high' as const, feature: 'auth' },
        { id: 'TASK-006-02', status: 'pending' as const, priority: 'high' as const, feature: 'billing' },
        { id: 'TASK-006-03', status: 'pending' as const, priority: 'high' as const, feature: 'auth' },
      ],
      features: {
        auth: { name: 'Authentication' },
        billing: { name: 'Billing System' },
      },
    }
    fs.writeFileSync(tasksFile, JSON.stringify(tasksData, null, 2))

    // Create PRD files
    for (const task of tasksData.tasks) {
      fs.writeFileSync(path.join(tempDir, `${task.id}.md`), `# ${task.id}\n\nTask content`)
    }

    // Filter by auth feature
    const authTasks = await backend.listPendingTasks({ feature: 'auth' })
    expect(authTasks.length).toBe(2)
    expect(authTasks.every(t => t.feature === 'auth')).toBe(true)

    // Filter by billing feature
    const billingTasks = await backend.listPendingTasks({ feature: 'billing' })
    expect(billingTasks.length).toBe(1)
    expect(billingTasks[0].feature).toBe('billing')

    // Count by feature
    const authCount = await backend.countPending({ feature: 'auth' })
    expect(authCount).toBe(2)
  })

  test('state manager handles locking', async () => {
    // Acquire lock
    const acquired = stateManager.acquireLock()
    expect(acquired).toBe(true)

    // Lock file should exist
    const lockFile = stateManager.getLockFile()
    expect(fs.existsSync(lockFile)).toBe(true)

    // Second acquire should fail
    const stateManager2 = new StateManager(config)
    const acquired2 = stateManager2.acquireLock()
    expect(acquired2).toBe(false)

    // Release lock
    stateManager.releaseLock()
    expect(fs.existsSync(lockFile)).toBe(false)

    // Now second manager can acquire
    const acquired3 = stateManager2.acquireLock()
    expect(acquired3).toBe(true)
    stateManager2.releaseLock()
  })

  test('state manager saves and loads state', async () => {
    // Save state
    stateManager.saveState(42, 5)

    // State file should exist
    const stateFile = stateManager.getStateFile()
    expect(fs.existsSync(stateFile)).toBe(true)

    // Load state
    const loadedState = stateManager.loadState()
    expect(loadedState).not.toBeNull()
    expect(loadedState!.lastIssue).toBe(42)
    expect(loadedState!.lastIteration).toBe(5)

    // Clear state
    stateManager.clearState()
    expect(fs.existsSync(stateFile)).toBe(false)
  })

  test('adds comments to task log', async () => {
    // Setup: Create task
    const tasksData = {
      tasks: [{ id: 'TASK-007-01', status: 'pending' as const, priority: 'high' as const }],
    }
    fs.writeFileSync(tasksFile, JSON.stringify(tasksData, null, 2))
    fs.writeFileSync(path.join(tempDir, 'TASK-007-01.md'), '# TASK-007-01\n\nTask content')

    // Add comments
    await backend.addComment('TASK-007-01', 'Starting implementation')
    await backend.addComment('TASK-007-01', 'Tests passing')

    // Check log file
    const logFile = path.join(tempDir, 'TASK-007-01.log')
    expect(fs.existsSync(logFile)).toBe(true)
    const logContent = fs.readFileSync(logFile, 'utf-8')
    expect(logContent).toContain('Starting implementation')
    expect(logContent).toContain('Tests passing')
  })

  test('backend ping checks health', async () => {
    // With valid tasks file
    const tasksData = { tasks: [] }
    fs.writeFileSync(tasksFile, JSON.stringify(tasksData, null, 2))

    const result = await backend.ping()
    expect(result.ok).toBe(true)
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)

    // With missing file
    fs.unlinkSync(tasksFile)
    const result2 = await backend.ping()
    expect(result2.ok).toBe(false)
    expect(result2.error).toContain('not found')
  })

  test('complete workflow simulation', async () => {
    // Setup: Create realistic task set
    const tasksData = {
      tasks: [
        { id: 'TASK-100-01', status: 'pending' as const, priority: 'high' as const, feature: 'auth' },
        { id: 'TASK-100-02', status: 'pending' as const, priority: 'medium' as const, feature: 'auth' },
        { id: 'TASK-100-03', status: 'pending' as const, priority: 'low' as const },
      ],
      features: {
        auth: { name: 'Authentication System' },
      },
    }
    fs.writeFileSync(tasksFile, JSON.stringify(tasksData, null, 2))

    // Create PRD files
    const prds = [
      { id: 'TASK-100-01', title: 'Implement login API', goal: 'Create login endpoint' },
      { id: 'TASK-100-02', title: 'Add JWT tokens', goal: 'Implement JWT authentication' },
      { id: 'TASK-100-03', title: 'Update README', goal: 'Document the changes' },
    ]

    for (const prd of prds) {
      fs.writeFileSync(
        path.join(tempDir, `${prd.id}.md`),
        `# ${prd.id}: ${prd.title}\n\n## Goal\n${prd.goal}\n\n## Requirements\n- Requirement 1\n- Requirement 2`
      )
    }

    // Simulate workflow loop
    let iteration = 0
    const maxIterations = 10
    let tasksCompleted = 0

    while (iteration < maxIterations) {
      iteration++

      // Find next task
      const task = await backend.findNextTask()
      if (!task) break

      // Mark in progress
      await backend.markInProgress(task.id)

      // Simulate execution (would normally call CLI)
      await backend.addComment(task.id, `Iteration ${iteration}: Executing task`)

      // Simulate success
      await backend.markCompleted(task.id, `Completed in iteration ${iteration}`)
      tasksCompleted++

      // Small delay to simulate work
      await new Promise(r => setTimeout(r, 10))
    }

    // Verify all tasks completed
    expect(tasksCompleted).toBe(3)
    const finalPending = await backend.countPending()
    expect(finalPending).toBe(0)

    // Verify all tasks are marked completed
    for (const task of tasksData.tasks) {
      const loadedTask = await backend.getTask(task.id)
      expect(loadedTask!.status).toBe('completed')
    }

    // Verify log files exist
    for (const task of tasksData.tasks) {
      const logFile = path.join(tempDir, `${task.id}.log`)
      expect(fs.existsSync(logFile)).toBe(true)
    }
  })
})
