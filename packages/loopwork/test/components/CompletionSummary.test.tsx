import React from 'react'
import { describe, test, expect } from 'bun:test'
import { render } from 'ink-testing-library'
import { CompletionSummary } from '../../src/components/CompletionSummary'

describe('CompletionSummary Component', () => {
  test('should render title', () => {
    const { lastFrame } = render(
      <CompletionSummary
        title="Build Complete"
        stats={{ completed: 10, failed: 2, skipped: 1 }}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('Build Complete')
  })

  test('should display stats', () => {
    const { lastFrame } = render(
      <CompletionSummary
        title="Task Complete"
        stats={{ completed: 10, failed: 2, skipped: 1 }}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('10')
    expect(frame).toContain('2')
    expect(frame).toContain('1')
  })

  test('should format duration', () => {
    const { lastFrame } = render(
      <CompletionSummary
        title="Done"
        stats={{ completed: 5, failed: 0, skipped: 0 }}
        duration={125000}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('2m')
    expect(frame).toContain('5s')
  })

  test('should display next steps', () => {
    const { lastFrame } = render(
      <CompletionSummary
        title="Deploy Complete"
        stats={{ completed: 5, failed: 0, skipped: 0 }}
        nextSteps={['Run tests', 'Push to production']}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('Run tests')
    expect(frame).toContain('Push to production')
  })
})
