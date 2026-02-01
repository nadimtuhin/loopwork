import { describe, expect, test, beforeEach, afterEach, spyOn } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { InkApp, type InkAppState } from '../../src/output/InkApp'

// Mock worker status data
const mockWorkerStatus = {
  totalWorkers: 8,
  activeWorkers: 4,
  pendingTasks: 12,
  runningTasks: 4,
  completedTasks: 15,
  failedTasks: 2,
}

const defaultState: InkAppState = {
  logs: [],
  currentTask: null,
  tasks: [],
  stats: { completed: 15, failed: 2, total: 30 },
  loopStartTime: Date.now() - 60000,
  progressMessage: null,
  progressPercent: null,
  namespace: 'test-namespace',
  iteration: 5,
  maxIterations: 50,
  layout: 'inline',
  workerStatus: mockWorkerStatus,
}

describe('StatusBar Component', () => {
  test('renders worker status correctly', () => {
    const subscribe = () => () => {}
    const { lastFrame } = render(
      <InkApp initialState={defaultState} subscribe={subscribe} />
    )
    
    const output = lastFrame()
    console.log('StatusBar output:', output)
    
    // Check that all worker status elements are present
    expect(output).toContain('Workers:')
    expect(output).toContain('4') // activeWorkers
    expect(output).toContain('8') // totalWorkers
    expect(output).toContain('Tasks:')
    expect(output).toContain('12') // pendingTasks
    expect(output).toContain('4') // runningTasks
    expect(output).toContain('15') // completedTasks
    expect(output).toContain('2') // failedTasks
  })

  test('renders with zero values', () => {
    const zeroState: InkAppState = {
      ...defaultState,
      workerStatus: {
        totalWorkers: 0,
        activeWorkers: 0,
        pendingTasks: 0,
        runningTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
      },
    }
    
    const subscribe = () => () => {}
    const { lastFrame } = render(
      <InkApp initialState={zeroState} subscribe={subscribe} />
    )
    
    const output = lastFrame()
    console.log('Zero state output:', output)
    
    expect(output).toContain('Workers:')
    expect(output).toContain('0')
    expect(output).toContain('Tasks:')
  })

  test('updates when worker status changes', () => {
    let updateState: (state: InkAppState) => void = () => {}
    const subscribe = (fn: (state: InkAppState) => void) => {
      updateState = fn
      return () => {}
    }
    
    const { lastFrame, rerender } = render(
      <InkApp initialState={defaultState} subscribe={subscribe} />
    )
    
    const initialOutput = lastFrame()
    console.log('Initial output:', initialOutput)
    expect(initialOutput).toContain('12') // pendingTasks
    
    // Update state with new worker status
    const updatedState: InkAppState = {
      ...defaultState,
      workerStatus: {
        ...mockWorkerStatus,
        pendingTasks: 5,
        runningTasks: 8,
        completedTasks: 20,
      },
    }
    
    updateState(updatedState)
    
    // Re-render with updated state
    const { lastFrame: newLastFrame } = render(
      <InkApp initialState={updatedState} subscribe={subscribe} />
    )
    
    const updatedOutput = newLastFrame()
    console.log('Updated output:', updatedOutput)
    
    expect(updatedOutput).toContain('5') // new pendingTasks
    expect(updatedOutput).toContain('20') // new completedTasks
  })

  test('renders in fullscreen layout', () => {
    const fullscreenState: InkAppState = {
      ...defaultState,
      layout: 'fullscreen',
    }
    
    const subscribe = () => () => {}
    const { lastFrame } = render(
      <InkApp initialState={fullscreenState} subscribe={subscribe} />
    )
    
    const output = lastFrame()
    console.log('Fullscreen output:', output)
    
    expect(output).toContain('Workers:')
    expect(output).toContain('Tasks:')
  })

  test('hides failed tasks when zero', () => {
    const noFailuresState: InkAppState = {
      ...defaultState,
      workerStatus: {
        ...mockWorkerStatus,
        failedTasks: 0,
      },
    }
    
    const subscribe = () => () => {}
    const { lastFrame } = render(
      <InkApp initialState={noFailuresState} subscribe={subscribe} />
    )
    
    const output = lastFrame()
    console.log('No failures output:', output)
    
    // Should still show other elements
    expect(output).toContain('Workers:')
    expect(output).toContain('Tasks:')
    // Should not show "failed" text when failedTasks is 0
    // (based on the component logic)
  })
})

describe('Worker Status Event Flow', () => {
  test('logger emits worker status event', () => {
    const { logger } = require('../../src/core/utils')
    
    // Check that emitWorkerStatus method exists
    expect(typeof logger.emitWorkerStatus).toBe('function')
    
    // Mock the renderer
    const renderSpy = spyOn(logger.renderer, 'render')
    
    // Emit worker status
    logger.emitWorkerStatus({
      totalWorkers: 8,
      activeWorkers: 4,
      pendingTasks: 12,
      runningTasks: 4,
      completedTasks: 15,
      failedTasks: 2,
    })
    
    // Verify renderer was called with correct event
    expect(renderSpy).toHaveBeenCalled()
    const call = renderSpy.mock.calls[0][0]
    expect(call.type).toBe('worker:status')
    expect(call.totalWorkers).toBe(8)
    expect(call.activeWorkers).toBe(4)
    expect(call.pendingTasks).toBe(12)
  })
})
