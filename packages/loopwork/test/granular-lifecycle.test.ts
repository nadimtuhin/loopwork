
import { describe, test, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { CliExecutor } from '../src/core/cli'
import { plugins } from '../src/plugins'
import type { Config } from '../src/core/config'
import type { Task } from '../src/contracts/task'
import type { ProcessSpawner, SpawnedProcess } from '../src/contracts/spawner'
import { EventEmitter } from 'events'

describe('CliExecutor Granular Lifecycle Hooks', () => {
  let testRoot: string
  let config: Config
  let task: Task
  let mockSpawner: ProcessSpawner
  let mockProcess: any
  let executor: CliExecutor

  beforeEach(() => {
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'loopwork-lifecycle-test-'))
    
    config = {
      namespace: 'test',
      cli: 'opencode',
      cliConfig: {
        models: [
          { name: 'test-model', cli: 'opencode', model: 'test-model-id' }
        ],
        cliPaths: {
          opencode: '/mock/bin/opencode',
          claude: '/mock/bin/claude'
        }
      }
    } as any

    task = {
      id: 'TASK-123',
      priority: 'high',
      feature: 'test-feature'
    } as any

    // Mock process
    mockProcess = new EventEmitter() as any
    mockProcess.pid = 12345
    mockProcess.stdout = new EventEmitter()
    mockProcess.stderr = new EventEmitter()
    mockProcess.stdin = { write: () => {}, end: () => {} }
    mockProcess.kill = () => { mockProcess.emit('close', 0) }

    mockSpawner = {
      name: 'mock-spawner',
      spawn: mock(() => mockProcess)
    } as any

    // Mock fs.existsSync for cliPaths
    spyOn(fs, 'existsSync').mockImplementation((p: any) => p.includes('/mock/bin/'))
    spyOn(fs, 'writeFileSync').mockImplementation(() => {})
    spyOn(fs, 'createWriteStream').mockImplementation(() => ({
      write: () => {},
      end: () => {},
      on: () => {}
    } as any))
    
    plugins.clear()
    executor = new CliExecutor(config, { 
      spawner: mockSpawner,
      pluginRegistry: plugins,
      logger: require('../src/core/utils').logger
    })
  })

  afterEach(async () => {
    if (executor) {
      await executor.cleanup()
    }
    plugins.clear()
    if (fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true })
    }
    mock.restore()
  })

  test('emits onStep hooks during execution', async () => {
    const hookSpy = spyOn(plugins, 'runHook').mockResolvedValue(undefined)
    
    const outputFile = path.join(testRoot, 'output.txt')
    
    const execPromise = executor.executeTask(task, 'test prompt', outputFile, 30)
    
    // Simulate process completion
    setTimeout(() => {
      mockProcess.emit('close', 0)
    }, 1000)

    await execPromise

    // Verify onStep calls
    const stepCalls = hookSpy.mock.calls.filter(call => call[0] === 'onStep')
    
    expect(stepCalls.length).toBeGreaterThanOrEqual(5)
    
    // Check for specific step IDs
    const stepIds = stepCalls.map(call => (call[1] as any).stepId)
    expect(stepIds).toContain('cli_execution_start')
    expect(stepIds).toContain('model_selected')
    expect(stepIds).toContain('cli_spawn_start')
    expect(stepIds).toContain('cli_spawn_end')
    expect(stepIds).toContain('cli_execution_end')
  })

  test('emits onToolCall hook before spawning', async () => {
    const hookSpy = spyOn(plugins, 'runHook').mockResolvedValue(undefined)
    
    const outputFile = path.join(testRoot, 'output.txt')
    
    const execPromise = executor.executeTask(task, 'test prompt', outputFile, 30)
    
    setTimeout(() => {
      mockProcess.emit('close', 0)
    }, 1000)

    await execPromise

    const toolCall = hookSpy.mock.calls.find(call => call[0] === 'onToolCall')
    expect(toolCall).toBeDefined()
    
    const event = toolCall![1] as any
    expect(event.toolName).toBe('opencode')
    expect(event.taskId).toBe('TASK-123')
    expect(event.arguments).toBeDefined()
    expect(event.arguments.model).toBeDefined()
  })

  test('emits onAgentResponse hook during output streaming', async () => {
    const hookSpy = spyOn(plugins, 'runHook').mockResolvedValue(undefined)
    
    const outputFile = path.join(testRoot, 'output.txt')
    
    const execPromise = executor.executeTask(task, 'test prompt', outputFile, 30)
    
    // Simulate output
    setTimeout(() => {
      mockProcess.stdout.emit('data', Buffer.from('hello world'))
    }, 500)

    setTimeout(() => {
      mockProcess.emit('close', 0)
    }, 1000)

    await execPromise

    // Wait a bit for non-awaited hooks
    await new Promise(resolve => setTimeout(resolve, 100))

    const responseCalls = hookSpy.mock.calls.filter(call => call[0] === 'onAgentResponse')
    expect(responseCalls.length).toBeGreaterThan(1) // At least one partial and one final
    
    const partialEvent = responseCalls[0][1] as any
    expect(partialEvent.responseText).toBe('hello world')
    expect(partialEvent.isPartial).toBe(true)

    const finalEvent = responseCalls[responseCalls.length - 1][1] as any
    expect(finalEvent.isPartial).toBe(false)
    expect(finalEvent.taskId).toBe('TASK-123')
  })
})
