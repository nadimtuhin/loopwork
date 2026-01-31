import React from 'react'
import { describe, test, expect } from 'bun:test'
import { render } from 'ink-testing-library'
import { InkBanner } from '../../src/components/InkBanner'

describe('InkBanner Component', () => {
  test('should render title', () => {
    const { lastFrame } = render(<InkBanner title="Test Title" />)
    const frame = lastFrame()
    expect(frame).toContain('TEST TITLE')
  })

  test('should render rows', () => {
    const rows = [
      { key: 'Key1', value: 'Value1' },
      { key: 'Key2', value: 'Value2' },
    ]
    const { lastFrame } = render(<InkBanner title="Rows" rows={rows} />)
    const frame = lastFrame()
    expect(frame).toContain('ROWS')
    expect(frame).toContain('Key1')
    expect(frame).toContain('Value1')
    expect(frame).toContain('Key2')
    expect(frame).toContain('Value2')
  })

  test('should support light style', () => {
    const { lastFrame } = render(<InkBanner title="Light" style="light" />)
    const frame = lastFrame()
    expect(frame).toContain('LIGHT')
    expect(frame).toContain('┌')
    expect(frame).toContain('┐')
  })

  test('should support heavy style', () => {
    const { lastFrame } = render(<InkBanner title="Heavy" style="heavy" />)
    const frame = lastFrame()
    expect(frame).toContain('HEAVY')
    expect(frame).toContain('╔')
    expect(frame).toContain('╗')
  })

  test('should support custom border color', () => {
    const { lastFrame } = render(<InkBanner title="Color" borderColor="green" />)
    const frame = lastFrame()
    expect(frame).toContain('COLOR')
  })

  test('should handle empty rows', () => {
    const { lastFrame } = render(<InkBanner title="Empty" rows={[]} />)
    const frame = lastFrame()
    expect(frame).toContain('EMPTY')
  })

  test('should handle missing rows prop', () => {
    const { lastFrame } = render(<InkBanner title="No Rows" />)
    const frame = lastFrame()
    expect(frame).toContain('NO ROWS')
  })
})
