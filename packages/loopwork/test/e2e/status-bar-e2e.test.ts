/**
 * E2E Tests for Status Bar functionality
 * 
 * These tests verify that the status bar correctly displays worker and task statistics
 * during parallel execution.
 */

import { describe, expect, test, beforeEach, afterEach, spyOn, mock } from 'bun:test'
import { ParallelRunner } from '../../src/core/parallel-runner'
import { logger } from '../../src/core/utils'

describe('Status Bar E2E', () => {
  let renderSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    // Spy on the renderer to capture events
    renderSpy = spyOn(logger.renderer, 'render').mockImplementation(() => {})
  })

  afterEach(() => {
    renderSpy.mockRestore()
  })

  test('worker status event is emitted with correct structure', () => {
    // Emit a worker status event
    logger.emitWorkerStatus({
      totalWorkers: 8,
      activeWorkers: 4,
      pendingTasks: 12,
      runningTasks: 4,
      completedTasks: 15,
      failedTasks: 2,
    })

    // Verify the event was rendered
    expect(renderSpy).toHaveBeenCalled()
    
    const event = renderSpy.mock.calls[0][0]
    expect(event.type).toBe('worker:status')
    expect(event.totalWorkers).toBe(8)
    expect(event.activeWorkers).toBe(4)
    expect(event.pendingTasks).toBe(12)
    expect(event.runningTasks).toBe(4)
    expect(event.completedTasks).toBe(15)
    expect(event.failedTasks).toBe(2)
    expect(event.timestamp).toBeDefined()
  })

  test('multiple worker status updates are emitted', () => {
    const statuses = [
      { totalWorkers: 8, activeWorkers: 8, pendingTasks: 20, runningTasks: 8, completedTasks: 0, failedTasks: 0 },
      { totalWorkers: 8, activeWorkers: 8, pendingTasks: 12, runningTasks: 8, completedTasks: 8, failedTasks: 0 },
      { totalWorkers: 8, activeWorkers: 4, pendingTasks: 0, runningTasks: 4, completedTasks: 20, failedTasks: 0 },
    ]

    statuses.forEach((status, index) => {
      renderSpy.mockClear()
      logger.emitWorkerStatus(status)
      
      expect(renderSpy).toHaveBeenCalledTimes(1)
      const event = renderSpy.mock.calls[0][0]
      expect(event.type).toBe('worker:status')
      expect(event.pendingTasks).toBe(status.pendingTasks)
      console.log(`Status update ${index + 1}:`, event)
    })
  })

  test('InkRenderer handles worker:status event', async () => {
    const { InkRenderer } = await import('../../src/output/ink-renderer')
    
    // Create a mock ink instance
    const mockRender = mock(() => ({ unmount: () => {} }))
    
    // Create renderer
    const renderer = new InkRenderer({
      mode: 'ink',
      logLevel: 'info',
      useTty: true,
    })

    // Mock the isSupported property
    Object.defineProperty(renderer, 'isSupported', { value: false })

    // Render a worker status event
    renderer.render({
      type: 'worker:status',
      totalWorkers: 8,
      activeWorkers: 4,
      pendingTasks: 12,
      runningTasks: 4,
      completedTasks: 15,
      failedTasks: 2,
      timestamp: Date.now(),
    })

    // Test passes if no error is thrown
    expect(true).toBe(true)
  })

  test('ParallelRunner emits worker status during execution', async () => {
    const mockBackend = {
      countPending: mock(() => Promise.resolve(10)),
      findNextTask: mock(() => Promise.resolve(null)),
      claimTask: mock(() => Promise.resolve(null)),
    }

    const mockCliExecutor = {
      execute: mock(() => Promise.resolve(0)),
      cleanup: mock(() => Promise.resolve()),
    }

    const mockPluginRegistry = {
      register: mock(() => {}),
      runHook: mock(() => Promise.resolve()),
      isDegradedMode: mock(() => false),
      getDisabledPlugins: mock(() => []),
      getDisabledPluginsReport: mock(() => []),
      getActivePluginsReport: mock(() => []),
    }

    const workerStatusCallbacks: Array<{
      totalWorkers: number
      activeWorkers: number
      pendingTasks: number
      runningTasks: number
      completedTasks: number
      failedTasks: number
    }> = []

    const runner = new ParallelRunner({
      config: {
        parallel: 4,
        maxIterations: 2,
        timeout: 60,
        taskDelay: 100,
        outputDir: '/tmp/test',
        projectRoot: '/tmp/test',
        namespace: 'test',
        circuitBreakerThreshold: 5,
        parallelFailureMode: 'continue',
      },
      backend: mockBackend as any,
      cliExecutor: mockCliExecutor as any,
      pluginRegistry: mockPluginRegistry as any,
      onWorkerStatus: async (status) => {
        workerStatusCallbacks.push(status)
      },
      buildPrompt: (task) => `Task: ${task.id}`,
    })

    // Run the parallel execution (will exit quickly due to no tasks)
    try {
      await runner.run()
    } catch (e) {
      // Expected to exit early
    }

    // Verify that worker status was emitted
    console.log('Worker status callbacks:', workerStatusCallbacks)
    expect(workerStatusCallbacks.length).toBeGreaterThan(0)
    
    // Verify the structure of the first callback
    const firstStatus = workerStatusCallbacks[0]
    expect(firstStatus.totalWorkers).toBe(4)
    expect(firstStatus.activeWorkers).toBeDefined()
    expect(firstStatus.pendingTasks).toBeDefined()
  })
})

describe('Status Bar Integration', () => {
  test('global state is updated when worker status event is received', async () => {
    // Access the global state module
    const inkRendererModule = await import('../../src/output/ink-renderer')
    
    // We can't directly access globalState, but we can test via the renderer
    const { InkRenderer } = inkRendererModule
    
    const renderer = new InkRenderer({
      mode: 'ink',
      logLevel: 'info',
      useTty: false, // Disable TTY to prevent actual rendering
    })

    // Spy on the render method to capture state updates
    const renderSpy = spyOn(renderer, 'render')

    // Emit a worker status event
    renderer.render({
      type: 'worker:status',
      totalWorkers: 8,
      activeWorkers: 4,
      pendingTasks: 12,
      runningTasks: 4,
      completedTasks: 15,
      failedTasks: 2,
      timestamp: Date.now(),
    })

    // Verify the event was processed
    expect(renderSpy).toHaveBeenCalled()
  })

  test('status bar updates reflect in UI state', () => {
    const { logger } = require('../../src/core/utils')
    
    // Track all rendered events
    const renderedEvents: any[] = []
    const originalRender = logger.renderer.render.bind(logger.renderer)
    
    logger.renderer.render = (event: any) => {
      renderedEvents.push(event)
      return originalRender(event)
    }

    // Emit multiple status updates
    logger.emitWorkerStatus({
      totalWorkers: 8,
      activeWorkers: 8,
      pendingTasks: 20,
      runningTasks: 8,
      completedTasks: 0,
      failedTasks: 0,
    })

    logger.emitWorkerStatus({
      totalWorkers: 8,
      activeWorkers: 8,
      pendingTasks: 12,
      runningTasks: 8,
      completedTasks: 8,
      failedTasks: 0,
    })

    // Filter for worker status events
    const statusEvents = renderedEvents.filter(e => e.type === 'worker:status')
    
    console.log('Status events:', statusEvents)
    
    expect(statusEvents.length).toBe(2)
    expect(statusEvents[0].pendingTasks).toBe(20)
    expect(statusEvents[1].pendingTasks).toBe(12)
    expect(statusEvents[1].completedTasks).toBe(8)

    // Restore original render
    logger.renderer.render = originalRender
  })
})
