/**
 * Tests for Debugger Core
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { Debugger } from '../src/core/debugger'
import type { DebugEvent, PrePromptEvent, Breakpoint } from '../src/contracts/debugger'

describe('Debugger', () => {
  let debugger_: Debugger

  beforeEach(() => {
    debugger_ = new Debugger()
  })

  describe('initial state', () => {
    test('should start disabled', () => {
      expect(debugger_.isEnabled()).toBe(false)
    })

    test('should start in running state', () => {
      expect(debugger_.state).toBe('running')
    })

    test('should have default breakpoints (all disabled)', () => {
      const breakpoints = debugger_.listBreakpoints()
      expect(breakpoints.length).toBeGreaterThan(0)
      expect(breakpoints.every(bp => bp.enabled === false)).toBe(true)
    })
  })

  describe('enable/disable', () => {
    test('should enable debugger', () => {
      debugger_.setEnabled(true)
      expect(debugger_.isEnabled()).toBe(true)
    })

    test('should disable debugger', () => {
      debugger_.setEnabled(true)
      debugger_.setEnabled(false)
      expect(debugger_.isEnabled()).toBe(false)
    })
  })

  describe('context management', () => {
    test('should set and get context', () => {
      const context = {
        task: { id: 'TEST-001', title: 'Test Task', status: 'in-progress' },
        config: { backend: { type: 'json' } },
        iteration: 1,
        startTime: new Date(),
        namespace: 'test',
      } as any

      debugger_.setContext(context)
      expect(debugger_.getContext()).toBe(context)
    })

    test('should clear context', () => {
      const context = {
        task: { id: 'TEST-001', title: 'Test Task', status: 'in-progress' },
        config: { backend: { type: 'json' } },
        iteration: 1,
        startTime: new Date(),
        namespace: 'test',
      } as any

      debugger_.setContext(context)
      debugger_.clearContext()
      expect(debugger_.getContext()).toBeUndefined()
    })
  })

  describe('breakpoint management', () => {
    test('should add breakpoint', () => {
      const bp: Breakpoint = {
        eventType: 'TASK_START',
        enabled: true,
      }

      debugger_.addBreakpoint(bp)
      const breakpoints = debugger_.listBreakpoints()
      const found = breakpoints.find(b => b.eventType === 'TASK_START')
      expect(found?.enabled).toBe(true)
    })

    test('should update existing breakpoint', () => {
      const bp1: Breakpoint = { eventType: 'TASK_START', enabled: true }
      const bp2: Breakpoint = { eventType: 'TASK_START', enabled: false }

      debugger_.addBreakpoint(bp1)
      debugger_.addBreakpoint(bp2)

      const breakpoints = debugger_.listBreakpoints()
      const found = breakpoints.find(b => b.eventType === 'TASK_START')
      expect(found?.enabled).toBe(false)
    })

    test('should add breakpoint with task filter', () => {
      const bp: Breakpoint = {
        eventType: 'TASK_START',
        taskId: 'TEST-001',
        enabled: true,
      }

      debugger_.addBreakpoint(bp)
      const breakpoints = debugger_.listBreakpoints()
      const found = breakpoints.find(b => b.eventType === 'TASK_START' && b.taskId === 'TEST-001')
      expect(found).toBeDefined()
      expect(found?.enabled).toBe(true)
    })

    test('should remove breakpoint', () => {
      const bp: Breakpoint = {
        eventType: 'LOOP_START',
        taskId: 'TEST-001',
        enabled: true,
      }

      debugger_.addBreakpoint(bp)
      debugger_.removeBreakpoint('LOOP_START', 'TEST-001')

      const breakpoints = debugger_.listBreakpoints()
      const found = breakpoints.find(b => b.eventType === 'LOOP_START' && b.taskId === 'TEST-001')
      expect(found).toBeUndefined()
    })
  })

  describe('listeners', () => {
    test('should add and notify listener on continue', () => {
      const onResume = mock(() => {})
      const listener = { onResume }

      debugger_.addListener(listener)
      debugger_.continue()

      expect(onResume).toHaveBeenCalled()
    })

    test('should remove listener', () => {
      const onResume = mock(() => {})
      const listener = { onResume }

      debugger_.addListener(listener)
      debugger_.removeListener(listener)
      debugger_.continue()

      expect(onResume).not.toHaveBeenCalled()
    })
  })

  describe('onEvent (disabled)', () => {
    test('should not pause when debugger is disabled', async () => {
      const event: DebugEvent = {
        type: 'TASK_START',
        timestamp: Date.now(),
        taskId: 'TEST-001',
      }

      // Add and enable breakpoint
      debugger_.addBreakpoint({ eventType: 'TASK_START', enabled: true })

      // But keep debugger disabled
      expect(debugger_.isEnabled()).toBe(false)

      // Should complete immediately without pausing
      await debugger_.onEvent(event)
      expect(debugger_.state).toBe('running')
    })
  })

  describe('step mode', () => {
    test('should set step mode via step()', () => {
      debugger_.step()
      // Step mode is internal, we just verify state transitions correctly
      expect(debugger_.state).toBe('running')
    })
  })

  describe('modified prompt', () => {
    test('should return and clear modified prompt', () => {
      // Access internal for testing
      const d = debugger_ as any
      d._modifiedPrompt = 'modified prompt content'

      const result = debugger_.getAndClearModifiedPrompt()
      expect(result).toBe('modified prompt content')

      const result2 = debugger_.getAndClearModifiedPrompt()
      expect(result2).toBeUndefined()
    })
  })
})

describe('Debugger Types', () => {
  test('PrePromptEvent should have prompt field', () => {
    const event: PrePromptEvent = {
      type: 'PRE_PROMPT',
      timestamp: Date.now(),
      taskId: 'TEST-001',
      prompt: 'Test prompt content',
    }

    expect(event.type).toBe('PRE_PROMPT')
    expect(event.prompt).toBe('Test prompt content')
  })
})
