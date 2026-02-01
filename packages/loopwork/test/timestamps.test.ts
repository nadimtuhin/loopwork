import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import path from 'path'
// Removed type-only import from '../src/backends/json'
import type { TaskStatus } from '../src/contracts/task'

describe('Task Timestamps and Events', () => {
  const testTasksFile = path.join(process.cwd(), 'test-tasks-timestamps.json')
  const testTasksDir = path.join(process.cwd(), 'test-tasks-timestamps')

  beforeEach(() => {
    if (!fs.existsSync(testTasksDir)) {
      fs.mkdirSync(testTasksDir)
    }
    fs.writeFileSync(testTasksFile, JSON.stringify({ tasks: [] }, null, 2))
  })

  afterEach(() => {
    if (fs.existsSync(testTasksFile)) fs.unlinkSync(testTasksFile)
    if (fs.existsSync(testTasksFile + '.lock')) fs.unlinkSync(testTasksFile + '.lock')
    if (fs.existsSync(testTasksDir)) {
      fs.readdirSync(testTasksDir).forEach(file => {
        fs.unlinkSync(path.join(testTasksDir, file))
      })
      fs.rmdirSync(testTasksDir)
    }
  })

  test('should set createdAt and updatedAt when creating a task', async () => {
    const adapter = new JsonTaskAdapter({ tasksFile: testTasksFile, tasksDir: testTasksDir } as any)
    const task = await adapter.createTask({
      title: 'Test Task',
      description: 'Test Description',
      priority: 'high'
    })

    expect(task.timestamps).toBeDefined()
    expect(task.timestamps?.createdAt).toBeDefined()
    expect(task.timestamps?.updatedAt).toBeDefined()
    expect(task.timestamps?.createdAt).toBe(task.timestamps?.updatedAt!)
    
    expect(task.events).toBeDefined()
    expect(task.events?.length).toBe(1)
    expect(task.events?.[0].taskId).toBe(task.id)
    expect(task.events?.[0].type).toBe('created')
    expect(task.events?.[0].level).toBe('info')
    expect(task.events?.[0].actor).toBe('system')
  })

  test('should update updatedAt when task status changes', async () => {
    const adapter = new JsonTaskAdapter({ tasksFile: testTasksFile, tasksDir: testTasksDir } as any)
    const task = await adapter.createTask({
      title: 'Test Task',
      description: 'Test Description',
      priority: 'medium'
    })

    const initialUpdatedAt = task.timestamps?.updatedAt

    await new Promise(resolve => setTimeout(resolve, 10))

    await adapter.markInProgress(task.id)
    const updatedTask = await adapter.getTask(task.id)

    expect(updatedTask?.timestamps?.updatedAt).toBeDefined()
    expect(updatedTask?.timestamps?.updatedAt).not.toBe(initialUpdatedAt!)
    expect(updatedTask?.timestamps?.startedAt).toBeDefined()
    
    expect(updatedTask?.events?.length).toBe(2)
    expect(updatedTask?.events?.[1].type).toBe('started')
  })

  test('should handle cancelled status and cancelledAt timestamp', async () => {
    const adapter = new JsonTaskAdapter({ tasksFile: testTasksFile, tasksDir: testTasksDir } as any)
    const task = await adapter.createTask({
      title: 'Test Task',
      description: 'Test Description',
      priority: 'medium'
    })

    await adapter.updateTask(task.id, { status: 'cancelled' as TaskStatus })
    const cancelledTask = await adapter.getTask(task.id)

    expect(cancelledTask?.status).toBe('cancelled')
    expect(cancelledTask?.timestamps?.cancelledAt).toBeDefined()
    
    const cancelEvent = cancelledTask?.events?.find(e => e.type === 'cancelled')
    expect(cancelEvent).toBeDefined()
    expect(cancelEvent?.level).toBe('info')
  })

  test('should set level to error for failed events', async () => {
    const adapter = new JsonTaskAdapter({ tasksFile: testTasksFile, tasksDir: testTasksDir } as any)
    const task = await adapter.createTask({
      title: 'Test Task',
      description: 'Test Description',
      priority: 'medium'
    })

    await adapter.markFailed(task.id, 'Something went wrong')
    const failedTask = await adapter.getTask(task.id)

    const failEvent = failedTask?.events?.find(e => e.type === 'failed')
    expect(failEvent).toBeDefined()
    expect(failEvent?.level).toBe('error')
    expect(failedTask?.timestamps?.failedAt).toBeDefined()
  })
})
