import React from 'react'
import { describe, test, expect } from 'bun:test'
import { render } from 'ink-testing-library'
import { InkCompletionSummary } from '../../src/components/InkCompletionSummary'

describe('InkCompletionSummary Component', () => {
  test('should render title', () => {
    const { lastFrame } = render(
      <InkCompletionSummary
        title="Build Complete"
        stats={{ completed: 10, failed: 2, skipped: 1 }}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('BUILD COMPLETE')
  })

  test('should display stats', () => {
    const { lastFrame } = render(
      <InkCompletionSummary
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
      <InkCompletionSummary
        title="Done"
        stats={{ completed: 5, failed: 0, skipped: 0 }}
        duration={125000}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('2m')
    expect(frame).toContain('5s')
  })

  test('should format hours in duration', () => {
    const { lastFrame } = render(
      <InkCompletionSummary
        title="Long Task"
        stats={{ completed: 1, failed: 0, skipped: 0 }}
        duration={7200000}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('120m')
    expect(frame).toContain('0s')
  })

  test('should display next steps', () => {
    const { lastFrame } = render(
      <InkCompletionSummary
        title="Deploy Complete"
        stats={{ completed: 5, failed: 0, skipped: 0 }}
        nextSteps={['Run tests', 'Push to production']}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('Run tests')
    expect(frame).toContain('Push to production')
  })

  test('should handle partial stats', () => {
    const { lastFrame } = render(
      <InkCompletionSummary
        title="Partial"
        stats={{ completed: 5, failed: 0, skipped: 0 }}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('5')
  })

  test('should handle zero stats', () => {
    const { lastFrame } = render(
      <InkCompletionSummary
        title="Empty"
        stats={{ completed: 0, failed: 0, skipped: 0 }}
      />
    )
    const frame = lastFrame()
    expect(frame).toBeTruthy()
  })

  test('should handle no next steps', () => {
    const { lastFrame } = render(
      <InkCompletionSummary
        title="Simple Summary"
        stats={{ completed: 3, failed: 0, skipped: 0 }}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('SIMPLE SUMMARY')
  })

  test('should show degraded mode info', () => {
    const { lastFrame } = render(
      <InkCompletionSummary
        title="Degraded"
        stats={{
          completed: 5,
          failed: 1,
          skipped: 0,
          isDegraded: true,
          disabledPlugins: ['plugin-a', 'plugin-b'],
        }}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('DEGRADED MODE')
    expect(frame).toContain('plugin-a')
    expect(frame).toContain('plugin-b')
  })
})
