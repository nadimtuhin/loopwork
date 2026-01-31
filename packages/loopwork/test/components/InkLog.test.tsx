import React from 'react'
import { describe, test, expect } from 'bun:test'
import { render } from 'ink-testing-library'
import { InkLog } from '../../src/components/InkLog'

describe('InkLog Component', () => {
  test('should render log entry with timestamp', () => {
    const { lastFrame } = render(
      <InkLog message="Test message" timestamp />
    )
    const frame = lastFrame()
    expect(frame).toContain('INFO')
    expect(frame).toContain('Test message')
  })

  test('should render different log levels', () => {
    const levels = ['info', 'success', 'warn', 'error', 'debug', 'trace'] as const

    levels.forEach((level) => {
      const { lastFrame } = render(
        <InkLog message={`${level} message`} level={level} />
      )
      const frame = lastFrame()
      expect(frame).toBeTruthy()
    })
  })

  test('should apply level colors', () => {
    const { lastFrame: errorFrame } = render(
      <InkLog message="Error" level="error" />
    )
    expect(errorFrame()).toBeTruthy()

    const { lastFrame: warnFrame } = render(
      <InkLog message="Warning" level="warn" />
    )
    expect(warnFrame()).toBeTruthy()
  })

  test('should handle message without timestamp', () => {
    const { lastFrame } = render(
      <InkLog message="No timestamp" timestamp={false} />
    )
    const frame = lastFrame()
    expect(frame).toContain('No timestamp')
  })

  test('should handle long messages', () => {
    const longMessage = 'A'.repeat(200)
    const { lastFrame } = render(
      <InkLog message={longMessage} />
    )
    const frame = lastFrame()
    expect(frame).toContain('A')
    expect(frame).toContain('AAAAAAAAAAAAAAAA')
  })

  test('should support all levels with default timestamp', () => {
    const levels = ['info', 'success', 'warn', 'error', 'debug', 'trace'] as const

    levels.forEach((level) => {
      const { lastFrame } = render(
        <InkLog message={`${level} test`} level={level} />
      )
      const frame = lastFrame()
      expect(frame).toBeTruthy()
    })
  })
})
