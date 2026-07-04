import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { run } from '../src/commands/run'
import { JsonTaskAdapter } from '../src/backends'
import { failureState } from '../src/core/failure-state'

describe('Run Command with Deadletter Policy', () => {
  let tempDir: string
  let tempTasksFile: string
  
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-deadletter-test-'))
    tempTasksFile = path.join(tempDir, 'tasks.json')
    failureState.clear()
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test('quarantines task after exceeding threshold', async () => {
    const tasksData = {
      tasks: [
        { id: 'TASK-001', status: 'pending', title: 'Fail task', description: 'This will fail' },
      ],
    }
    fs.writeFileSync(tempTasksFile, JSON.stringify(tasksData, null, 2))

    // Mock dependencies
    const mockCliExecutor = {
      execute: mock(async () => 1), // Always fail
      resetFallback: mock(() => {}),
      cleanup: mock(async () => {}),
      getNextModel: mock(() => ({ cli: 'claude', model: 'sonnet' })),
    }

    const mockDeps = {
      getConfig: mock(async () => ({
        cli: 'claude',
        maxIterations: 5,
        timeout: 10,
        projectRoot: tempDir,
        outputDir: path.join(tempDir, 'output'),
        backend: { type: 'json', tasksFile: tempTasksFile },
        cliConfig: {},
        autoConfirm: true,
        dryRun: false,
        debug: false,
        logLevel: 'info',
        outputMode: 'human',
        parallel: 1,
        parallelFailureMode: 'continue',
        dynamicTasks: { enabled: false },
        deadletter: {
          enabled: true,
          threshold: 2, // Quarantine after 2 failures
          retryCooldownMs: 0,
        },
        maxRetries: 1, // 1 try + 0 retries = 1 total attempts per iteration
        retryDelay: 0,
        taskDelay: 0,
      })),
      createBackend: (cfg: any) => new JsonTaskAdapter(cfg),
      CliExecutorClass: function() { return mockCliExecutor },
      logger: {
        info: mock(() => {}),
        success: mock(() => {}),
        warn: mock(() => {}),
        error: mock(() => {}),
        raw: mock(() => {}),
        startSpinner: mock(() => {}),
        stopSpinner: mock(() => {}),
        setLogFile: mock(() => {}),
        debug: mock(() => {}),
        emitJsonEvent: mock(() => {}),
      },
      handleError: mock(() => {}),
      process: { 
        ...process, 
        exit: mock(() => {}), 
        on: mock(() => {}), 
        removeAllListeners: mock(() => {}),
        env: { ...process.env },
      } as any,
    }

    // Run first time
    await run({}, mockDeps as any)
    
    let data = JSON.parse(fs.readFileSync(tempTasksFile, 'utf-8'))
    
    // Run second time
    await run({}, mockDeps as any)
    
    data = JSON.parse(fs.readFileSync(tempTasksFile, 'utf-8'))
    expect(data.tasks[0].status).toBe('quarantined')
  })
})
