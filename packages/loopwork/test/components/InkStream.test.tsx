import React from 'react'
import { describe, test, expect } from 'bun:test'
import { render } from 'ink-testing-library'
import { InkStream } from '../../src/components/InkStream'

describe('InkStream Component', () => {
  test('should render stream output', () => {
    const { lastFrame } = render(
      <InkStream lines={['Test output']} />
    )
    const frame = lastFrame()
    expect(frame).toContain('Test output')
  })

  test('should handle empty lines', () => {
    const { lastFrame } = render(
      <InkStream lines={[]} />
    )
    const frame = lastFrame()
    expect(frame).toBe('')
  })

  test('should handle multiline output', () => {
    const { lastFrame } = render(
      <InkStream lines={['Line 1', 'Line 2', 'Line 3']} />
    )
    const frame = lastFrame()
    expect(frame).toContain('Line 1')
    expect(frame).toContain('Line 2')
    expect(frame).toContain('Line 3')
  })

  test('should support prefix', () => {
    const { lastFrame } = render(
      <InkStream lines={['message']} prefix="INFO" />
    )
    const frame = lastFrame()
    expect(frame).toContain('INFO')
    expect(frame).toContain('message')
  })

  test('should support custom prefix color', () => {
    const { lastFrame } = render(
      <InkStream lines={['message']} prefix="INFO" prefixColor="cyan" />
    )
    const frame = lastFrame()
    expect(frame).toContain('INFO')
  })

  test('should respect line limit', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `Line ${i}`)
    const { lastFrame } = render(
      <InkStream lines={lines} limit={5} />
    )
    const frame = lastFrame()
    // Should show last 5 lines
    expect(frame).toContain('Line 15')
    expect(frame).not.toContain('Line 0')
  })

  test('should handle ANSI colors', () => {
    const { lastFrame } = render(
      <InkStream lines={['\x1b[31mRed text\x1b[0m']} />
    )
    const frame = lastFrame()
    expect(frame).toContain('Red text')
  })
})
