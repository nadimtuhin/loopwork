import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createAuditLoggingPlugin, AuditLogManager, type AuditConfig } from '../src/audit-logging'
import type { TaskContext, PluginTaskResult, LoopStats, StepEvent, ToolCallEvent, AgentResponseEvent } from '@loopwork-ai/loopwork/contracts'
import fs from 'fs'
import path from 'path'

describe('Audit Logging Plugin', () => {
  let tempAuditDir = ''

  beforeEach(() => {
    tempAuditDir = fs.mkdtempSync('audit-test')
    fs.mkdirSync(tempAuditDir, { recursive: true })
  })

  afterEach(() => {
    try {
      fs.rmSync(tempAuditDir, { recursive: true, force: true })
    } catch (error) {
    }
  })

  const readLatestLog = () => {
    const files = fs.readdirSync(tempAuditDir).filter(f => f.endsWith('.jsonl'))
    if (files.length === 0) return []
    const latest = files.sort().pop()!
    const content = fs.readFileSync(path.join(tempAuditDir, latest), 'utf-8')
    return content.trim().split('\n').map(line => JSON.parse(line))
  }

  describe('Lifecycle Hooks', () => {
    test('should log loop start event', async () => {
      const plugin = createAuditLoggingPlugin({ auditDir: tempAuditDir })

      await plugin.onLoopStart!('test-namespace')

      const logs = readLatestLog()
      expect(logs.length).toBeGreaterThan(0)
      expect(logs[0].eventType).toBe('loop_start')
      expect(logs[0].namespace).toBe('test-namespace')
    })

    test('should log loop end event with stats', async () => {
      const plugin = createAuditLoggingPlugin({ auditDir: tempAuditDir })
      const stats: LoopStats = {
        completed: 5,
        failed: 2,
        duration: 60000,
        isDegraded: false,
        disabledPlugins: [],
      }

      await plugin.onLoopEnd!(stats)

      const logs = readLatestLog()
      const endEvent = logs.find(l => l.eventType === 'loop_end')
      expect(endEvent).toBeDefined()
      expect(endEvent.data.metadata.completed).toBe(5)
      expect(endEvent.data.metadata.failed).toBe(2)
      expect(endEvent.data.metadata.duration).toBe(60000)
    })

    test('should log task start event', async () => {
      const plugin = createAuditLoggingPlugin({ auditDir: tempAuditDir })

      const context: TaskContext = {
        task: {
          id: 'TASK-001',
          title: 'Test Task',
          description: 'Test description',
          status: 'pending',
          priority: 'high',
        },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'test-ns',
      }

      await plugin.onTaskStart!(context)

      const logs = readLatestLog()
      const startEvent = logs.find(l => l.eventType === 'task_start')
      expect(startEvent).toBeDefined()
      expect(startEvent.taskId).toBe('TASK-001')
      expect(startEvent.taskTitle).toBe('Test Task')
      expect(startEvent.iteration).toBe(1)
      expect(startEvent.namespace).toBe('test-ns')
    })

    test('should log task complete event with result', async () => {
      const plugin = createAuditLoggingPlugin({ auditDir: tempAuditDir })

      const context: TaskContext = {
        task: {
          id: 'TASK-002',
          title: 'Completed Task',
          description: 'Task that completed',
          status: 'pending',
          priority: 'medium',
        },
        config: {} as any,
        iteration: 2,
        startTime: new Date(),
        namespace: 'test-ns',
      }

      const result: PluginTaskResult = {
        duration: 5000,
        success: true,
        output: 'Task completed successfully',
      }

      await plugin.onTaskComplete!(context, result)

      const logs = readLatestLog()
      const completeEvent = logs.find(l => l.eventType === 'task_complete')
      expect(completeEvent).toBeDefined()
      expect(completeEvent.taskId).toBe('TASK-002')
      expect(completeEvent.data.duration).toBe(5000)
      expect(completeEvent.data.success).toBe(true)
    })

    test('should log task failed event with error', async () => {
      const plugin = createAuditLoggingPlugin({ auditDir: tempAuditDir })

      const context: TaskContext = {
        task: {
          id: 'TASK-003',
          title: 'Failed Task',
          description: 'Task that failed',
          status: 'pending',
          priority: 'high',
        },
        config: {} as any,
        iteration: 3,
        startTime: new Date(),
        namespace: 'test-ns',
      }

      await plugin.onTaskFailed!(context, 'Task execution failed with timeout')

      const logs = readLatestLog()
      const failedEvent = logs.find(l => l.eventType === 'task_failed')
      expect(failedEvent).toBeDefined()
      expect(failedEvent.taskId).toBe('TASK-003')
      expect(failedEvent.data.error).toBe('Task execution failed with timeout')
    })

    test('should log step events', async () => {
      const plugin = createAuditLoggingPlugin({ auditDir: tempAuditDir })

      const event: StepEvent = {
        stepId: 'step-001',
        description: 'Test step',
        phase: 'start',
        context: {
          namespace: 'test-ns',
          taskId: 'TASK-001',
        },
      }

      await plugin.onStep!(event)

      const logs = readLatestLog()
      const stepEvent = logs.find(l => l.eventType === 'step_event')
      expect(stepEvent).toBeDefined()
      expect(stepEvent.data.stepId).toBe('step-001')
      expect(stepEvent.data.stepPhase).toBe('start')
    })

    test('should log tool calls', async () => {
      const plugin = createAuditLoggingPlugin({ auditDir: tempAuditDir })

      const event: ToolCallEvent = {
        toolName: 'git',
        arguments: { path: '.' },
        taskId: 'TASK-001',
        timestamp: Date.now(),
        metadata: {
          namespace: 'test-ns',
        },
      }

      await plugin.onToolCall!(event)

      const logs = readLatestLog()
      const toolEvent = logs.find(l => l.eventType === 'tool_call')
      expect(toolEvent).toBeDefined()
      expect(toolEvent.data.toolName).toBe('git')
    })

    test('should log agent responses', async () => {
      const plugin = createAuditLoggingPlugin({ auditDir: tempAuditDir })

      const event: AgentResponseEvent = {
        responseText: 'Task completed successfully',
        model: 'claude-sonnet-4',
        isPartial: false,
        taskId: 'TASK-001',
        timestamp: Date.now(),
        metadata: {
          namespace: 'test-ns',
        },
      }

      await plugin.onAgentResponse!(event)

      const logs = readLatestLog()
      const agentEvent = logs.find(l => l.eventType === 'agent_response')
      expect(agentEvent).toBeDefined()
      expect(agentEvent.data.responseText).toBe('Task completed successfully')
      expect(agentEvent.data.model).toBe('claude-sonnet-4')
    })
  })

  describe('Configuration Options', () => {
    test('should respect eventTypes filter', async () => {
      const plugin = createAuditLoggingPlugin({
        auditDir: tempAuditDir,
        eventTypes: ['task_start', 'task_complete'],
      })

      const context: TaskContext = {
        task: {
          id: 'TASK-001',
          title: 'Test Task',
          description: 'Test description',
          status: 'pending',
          priority: 'medium',
        },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'test-ns',
      }

      await plugin.onLoopStart!('test-ns')
      await plugin.onTaskStart!(context)
      await plugin.onTaskComplete!(context, { duration: 100, success: true })

      const logs = readLatestLog()
      const eventTypes = logs.map(l => l.eventType)
      expect(eventTypes).toContain('task_start')
      expect(eventTypes).toContain('task_complete')
      expect(eventTypes).not.toContain('loop_start')
    })

    test('should disable when enabled is false', async () => {
      const plugin = createAuditLoggingPlugin({
        auditDir: tempAuditDir,
        enabled: false,
      })

      const context: TaskContext = {
        task: {
          id: 'TASK-001',
          title: 'Test Task',
          description: 'Test description',
          status: 'pending',
          priority: 'medium',
        },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'test-ns',
      }

      await plugin.onTaskStart!(context)

      const files = fs.readdirSync(tempAuditDir).filter(f => f.endsWith('.jsonl'))
      expect(files.length).toBe(0)
    })

    test('should respect includeDescriptions option', async () => {
      const plugin = createAuditLoggingPlugin({
        auditDir: tempAuditDir,
        includeDescriptions: false,
      })

      const context: TaskContext = {
        task: {
          id: 'TASK-001',
          title: 'Test Task',
          description: 'This is a test description',
          status: 'pending',
          priority: 'medium',
        },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'test-ns',
      }

      await plugin.onTaskStart!(context)

      const logs = readLatestLog()
      const startEvent = logs.find(l => l.eventType === 'task_start')
      expect(startEvent.data.description).toBeUndefined()
    })
  })

  describe('AuditLogManager', () => {
    test('should create audit directory if not exists', () => {
      const newDir = fs.mkdtempSync('audit-mgr-test')
      fs.rmSync(newDir, { recursive: true, force: true })

      const manager = new AuditLogManager(newDir)

      expect(fs.existsSync(newDir)).toBe(true)
    })

    test('should write events to file', () => {
      const manager = new AuditLogManager(tempAuditDir)
      const sessionId = 'test-session'

      const testEvent = {
        id: 'audit_123',
        timestamp: new Date().toISOString(),
        eventType: 'task_start' as const,
        namespace: 'test',
        data: {},
      }

      manager.writeEvent(testEvent, sessionId)

      const logPath = path.join(tempAuditDir, `${sessionId}.jsonl`)
      expect(fs.existsSync(logPath)).toBe(true)

      const content = fs.readFileSync(logPath, 'utf-8')
      expect(content).toContain('audit_123')
    })

    test('should rotate logs when file size exceeded', () => {
      const manager = new AuditLogManager(tempAuditDir, 0.001) // Very small for testing
      const sessionId = 'rotate-test'

      // Write many small events
      for (let i = 0; i < 10; i++) {
        manager.writeEvent({
          id: `audit_${i}`,
          timestamp: new Date().toISOString(),
          eventType: 'task_start' as const,
          namespace: 'test',
          data: { metadata: { test: 'x'.repeat(100) } }, // Make it larger
        }, sessionId)
      }

      expect(manager.shouldRotateFile(sessionId)).toBe(true)
    })

    test('should not rotate when file size is small', () => {
      const manager = new AuditLogManager(tempAuditDir, 10)
      const sessionId = 'no-rotate-test'

      manager.writeEvent({
        id: 'audit_1',
        timestamp: new Date().toISOString(),
        eventType: 'task_start' as const,
        namespace: 'test',
        data: {},
      }, sessionId)

      expect(manager.shouldRotateFile(sessionId)).toBe(false)
    })

    test('should get audit files sorted by modification time', () => {
      const manager = new AuditLogManager(tempAuditDir)

      // Create test files with different timestamps
      const now = Date.now()
      fs.writeFileSync(path.join(tempAuditDir, 'file1.jsonl'), '{}')
      fs.writeFileSync(path.join(tempAuditDir, 'file2.jsonl'), '{}')
      fs.writeFileSync(path.join(tempAuditDir, 'file3.jsonl'), '{}')

      const files = manager.getAuditFiles()
      expect(files.length).toBe(3)
      expect(files).toHaveLength(3)
    })

    test('should cleanup old logs by date', () => {
      const manager = new AuditLogManager(tempAuditDir)

      // Create an old log file
      const oldFilePath = path.join(tempAuditDir, 'old-log.jsonl')
      const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) // 40 days ago
      fs.writeFileSync(oldFilePath, '{}')
      fs.utimesSync(oldFilePath, oldDate, oldDate)

      // Create a recent log file
      const recentFilePath = path.join(tempAuditDir, 'recent-log.jsonl')
      fs.writeFileSync(recentFilePath, '{}')

      manager.cleanupOldLogs(30) // Keep 30 days

      expect(fs.existsSync(oldFilePath)).toBe(false)
      expect(fs.existsSync(recentFilePath)).toBe(true)
    })
  })

  describe('Error Handling', () => {
    test('should handle file write errors gracefully', async () => {
      const readOnlyDir = fs.mkdtempSync('readonly-test')
      fs.chmodSync(readOnlyDir, 0o444)

      const plugin = createAuditLoggingPlugin({ auditDir: readOnlyDir })

      // This should not throw an error
      await plugin.onTaskStart!({
        task: { id: 'TASK-001', title: 'Test', description: 'Test', status: 'pending', priority: 'medium' },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'test',
      })

      // Cleanup
      fs.chmodSync(readOnlyDir, 0o755)
      fs.rmSync(readOnlyDir, { recursive: true, force: true })
    })

    test('should handle invalid log file gracefully', () => {
      const manager = new AuditLogManager(tempAuditDir)
      const sessionId = 'test-session'

      // Write invalid JSON
      const logPath = path.join(tempAuditDir, `${sessionId}.jsonl`)
      fs.writeFileSync(logPath, 'invalid json\nmore invalid')

      // Should not crash
      expect(() => manager.getAuditFiles()).not.toThrow()
    })
  })
})
