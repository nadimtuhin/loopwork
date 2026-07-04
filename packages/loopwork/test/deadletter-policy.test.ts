import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { JsonTaskAdapter } from '../src/backends'

describe('Deadletter Policy', () => {
  let tempDir: string
  let tempTasksFile: string
  let adapter: JsonTaskAdapter

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deadletter-policy-test-'))
    tempTasksFile = path.join(tempDir, 'tasks.json')
    adapter = new JsonTaskAdapter({
      type: 'json',
      tasksFile: tempTasksFile,
      tasksDir: tempDir,
    })
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test('respects retryCooldown for failed tasks', async () => {
    const now = Date.now()
    const tasksData = {
      tasks: [
        {
          id: 'TASK-001',
          status: 'failed',
          timestamps: {
            failedAt: new Date(now - 10000).toISOString(), // Failed 10s ago
          },
        },
      ],
    }
    fs.writeFileSync(tempTasksFile, JSON.stringify(tasksData, null, 2))

    // With 5s cooldown, should find it
    const taskFound = await adapter.findNextTask({ retryCooldown: 5000 })
    expect(taskFound).not.toBeNull()
    expect(taskFound?.id).toBe('TASK-001')

    // With 15s cooldown, should NOT find it
    const taskNotFound = await adapter.findNextTask({ retryCooldown: 15000 })
    expect(taskNotFound).toBeNull()
  })

  test('auto-retries quarantined tasks after autoRetryDelayMs', async () => {
    const now = Date.now()
    const tasksData = {
      tasks: [
        {
          id: 'TASK-001',
          status: 'quarantined',
          timestamps: {
            quarantinedAt: new Date(now - 60000).toISOString(), // Quarantined 1 min ago
          },
        },
      ],
    }
    fs.writeFileSync(tempTasksFile, JSON.stringify(tasksData, null, 2))

    // Policy: autoRetry disabled (default) -> should NOT find it
    const taskNotFound1 = await adapter.findNextTask({ 
      deadletterPolicy: { enabled: true, autoRetry: false } 
    })
    expect(taskNotFound1).toBeNull()

    // Policy: autoRetry enabled, delay 2 mins -> should NOT find it
    const taskNotFound2 = await adapter.findNextTask({ 
      deadletterPolicy: { enabled: true, autoRetry: true, autoRetryDelayMs: 120000 } 
    })
    expect(taskNotFound2).toBeNull()

    // Policy: autoRetry enabled, delay 30s -> should find it
    const taskFound = await adapter.findNextTask({ 
      deadletterPolicy: { enabled: true, autoRetry: true, autoRetryDelayMs: 30000 } 
    })
    expect(taskFound).not.toBeNull()
    expect(taskFound?.id).toBe('TASK-001')
  })
})
