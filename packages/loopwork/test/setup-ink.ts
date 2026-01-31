/**
 * Test Setup for Ink Rendering
 *
 * Provides mock utilities for testing Ink components and renderers
 * in both TTY and non-TTY environments.
 */

import { beforeEach, afterEach } from 'bun:test'

/**
 * Mock TTY environment for testing
 * If called inside a describe block, it sets up beforeEach/afterEach.
 * If called inside a test, it returns an object to manage the state manually.
 */
export function mockTTY(isTty: boolean = true) {
  const originalIsTTY = process.stdout.isTTY

  const set = (val: boolean) => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: val,
      configurable: true,
      writable: true,
    })
  }

  try {
    beforeEach(() => {
      set(isTty)
    })

    afterEach(() => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: originalIsTTY,
        configurable: true,
        writable: true,
      })
    })
  } catch {
    // If called inside a test, just set it once
    set(isTty)
  }

  return {
    restore: () => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: originalIsTTY,
        configurable: true,
        writable: true,
      })
    }
  }
}

/**
 * Mock stdout.write to capture output
 */
export function captureStdout() {
  const writes: string[] = []
  const originalWrite = process.stdout.write.bind(process.stdout)

  beforeEach(() => {
    process.stdout.write = (chunk: string) => {
      writes.push(chunk)
      return true
    }
  })

  afterEach(() => {
    process.stdout.write = originalWrite
  })

  return {
    getWrites: () => writes,
    clear: () => writes.length = 0,
  }
}

/**
 * Mock stderr.write to capture error output
 */
export function captureStderr() {
  const writes: string[] = []
  const originalWrite = process.stderr.write.bind(process.stderr)

  beforeEach(() => {
    process.stderr.write = (chunk: string) => {
      writes.push(chunk)
      return true
    }
  })

  afterEach(() => {
    process.stderr.write = originalWrite
  })

  return {
    getWrites: () => writes,
    clear: () => writes.length = 0,
  }
}

/**
 * Mock Ink app exit for testing
 */
export function mockAppExit() {
  const exits: Array<() => void> = []

  beforeEach(() => {
    // Mock useApp hook return values
  })

  return {
    trackExit: (exitFn: () => void) => {
      exits.push(exitFn)
    },
    triggerAll: () => {
      exits.forEach((fn) => fn())
    },
  }
}

import type {
  OutputEvent,
  LogEvent,
  TaskStartEvent,
  TaskCompleteEvent,
  TaskFailedEvent,
  LoopStartEvent,
  LoopEndEvent,
  ProgressStartEvent,
  ProgressUpdateEvent,
  ProgressStopEvent,
  CliStartEvent,
  CliOutputEvent,
  CliCompleteEvent,
  CliErrorEvent,
  RawOutputEvent,
  JsonOutputEvent,
} from '../src/output/contracts'

/**
 * Create mock output events for testing
 */
export function createMockEvents() {
  return {
    log: (level: string, message: string): LogEvent => ({
      type: 'log' as const,
      level: level as LogEvent['level'],
      message,
      timestamp: Date.now(),
    }),

    taskStart: (taskId: string, title: string): TaskStartEvent => ({
      type: 'task:start' as const,
      taskId,
      title,
      timestamp: Date.now(),
      iteration: 1,
      namespace: 'default',
    }),

    taskComplete: (taskId: string, title: string, duration: number): TaskCompleteEvent => ({
      type: 'task:complete' as const,
      taskId,
      title,
      duration,
      success: true,
      timestamp: Date.now(),
    }),

    taskFailed: (taskId: string, title: string, error: string): TaskFailedEvent => ({
      type: 'task:failed' as const,
      taskId,
      title,
      error,
      duration: 1000,
      timestamp: Date.now(),
    }),

    loopStart: (namespace: string, taskCount: number): LoopStartEvent => ({
      type: 'loop:start' as const,
      namespace,
      taskCount,
      maxIterations: taskCount,
      timestamp: Date.now(),
    }),

    loopEnd: (namespace: string, completed: number, failed: number): LoopEndEvent => ({
      type: 'loop:end' as const,
      namespace,
      completed,
      failed,
      duration: 5000,
      timestamp: Date.now(),
    }),

    progressStart: (message: string): ProgressStartEvent => ({
      type: 'progress:start' as const,
      message,
      timestamp: Date.now(),
    }),

    progressUpdate: (message: string, percent?: number): ProgressUpdateEvent => ({
      type: 'progress:update' as const,
      message,
      percent,
      timestamp: Date.now(),
    }),

    progressStop: (success?: boolean): ProgressStopEvent => ({
      type: 'progress:stop' as const,
      success,
      timestamp: Date.now(),
    }),

    cliStart: (taskId: string, model: string): CliStartEvent => ({
      type: 'cli:start' as const,
      taskId,
      command: model,
      model,
      timeout: 300,
      timestamp: Date.now(),
    }),

    cliOutput: (taskId: string, chunk: string): CliOutputEvent => ({
      type: 'cli:output' as const,
      taskId,
      chunk,
      timestamp: Date.now(),
    }),

    cliComplete: (taskId: string, exitCode: number): CliCompleteEvent => ({
      type: 'cli:complete' as const,
      taskId,
      exitCode,
      duration: 1000,
      timestamp: Date.now(),
    }),

    cliError: (taskId: string, error: string): CliErrorEvent => ({
      type: 'cli:error' as const,
      taskId,
      error,
      timestamp: Date.now(),
    }),

    raw: (content: string): RawOutputEvent => ({
      type: 'raw' as const,
      content,
      timestamp: Date.now(),
    }),

    json: (eventType: string, data: Record<string, unknown>): JsonOutputEvent => ({
      type: 'json' as const,
      eventType,
      data,
      timestamp: Date.now(),
    }),
  }
}
