import { describe, test, expect } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { CurrentTasks } from '../src/dashboard/tui'

describe('Dashboard Worker Display', () => {
  test('displays worker number for parallel tasks', () => {
    const tasks = [
      {
        id: 'TASK-001',
        title: 'First task',
        startedAt: new Date(),
        modelDisplayName: 'claude/sonnet-4',
        workerId: 0,
      },
      {
        id: 'TASK-002',
        title: 'Second task',
        startedAt: new Date(),
        modelDisplayName: 'opencode/gemini-flash',
        workerId: 1,
      },
    ]

    const { lastFrame } = render(<CurrentTasks tasks={tasks} />)
    const output = lastFrame() || ''

    expect(output).toContain('w0')
    expect(output).toContain('w1')
    expect(output).toContain('claude/sonnet-4')
    expect(output).toContain('opencode/gemini-flash')
  })

  test('displays worker number with CLI fallback', () => {
    const tasks = [
      {
        id: 'TASK-003',
        title: 'Task with CLI only',
        startedAt: new Date(),
        cli: 'opencode',
        workerId: 2,
      },
    ]

    const { lastFrame } = render(<CurrentTasks tasks={tasks} />)
    const output = lastFrame() || ''

    expect(output).toContain('w2')
    expect(output).toContain('opencode')
  })

  test('does not display worker number when undefined', () => {
    const tasks = [
      {
        id: 'TASK-004',
        title: 'Sequential task without worker',
        startedAt: new Date(),
        modelDisplayName: 'claude/haiku',
      },
    ]

    const { lastFrame } = render(<CurrentTasks tasks={tasks} />)
    const output = lastFrame() || ''

    expect(output).not.toContain('w0')
    expect(output).not.toContain('w1')
    expect(output).toContain('claude/haiku')
  })

  test('handles worker 0 correctly', () => {
    const tasks = [
      {
        id: 'TASK-005',
        title: 'Task on worker zero',
        startedAt: new Date(),
        modelDisplayName: 'claude/opus',
        workerId: 0,
      },
    ]

    const { lastFrame } = render(<CurrentTasks tasks={tasks} />)
    const output = lastFrame() || ''

    expect(output).toContain('w0')
    expect(output).not.toContain('w1')
  })

  test('displays multiple workers concurrently', () => {
    const tasks = [
      {
        id: 'TASK-006',
        title: 'Worker 0 task',
        startedAt: new Date(),
        modelDisplayName: 'claude/sonnet',
        workerId: 0,
      },
      {
        id: 'TASK-007',
        title: 'Worker 1 task',
        startedAt: new Date(),
        modelDisplayName: 'opencode/flash',
        workerId: 1,
      },
      {
        id: 'TASK-008',
        title: 'Worker 2 task',
        startedAt: new Date(),
        modelDisplayName: 'gemini/pro',
        workerId: 2,
      },
    ]

    const { lastFrame } = render(<CurrentTasks tasks={tasks} />)
    const output = lastFrame() || ''

    expect(output).toContain('TASK-006')
    expect(output).toContain('TASK-007')
    expect(output).toContain('TASK-008')
    expect(output).toContain('w0')
    expect(output).toContain('w1')
    expect(output).toContain('w2')
  })

  test('shows unknown when no model info available', () => {
    const tasks = [
      {
        id: 'TASK-009',
        title: 'Task without model info',
        startedAt: new Date(),
        workerId: 1,
      },
    ]

    const { lastFrame } = render(<CurrentTasks tasks={tasks} />)
    const output = lastFrame() || ''

    expect(output).toContain('w1')
    expect(output).toContain('unknown')
  })
})
