import React from 'react'
import { describe, test, expect } from 'bun:test'
import { render } from 'ink-testing-library'
import { Banner } from '../../src/components/Banner'

describe('Banner Component', () => {
  test('should render title', () => {
    const { lastFrame } = render(<Banner title="Test Title" />)
    const frame = lastFrame()
    expect(frame).toContain('Test Title')
  })

  test('should render rows', () => {
    const rows = [
      { key: 'Key1', value: 'Value1' },
      { key: 'Key2', value: 'Value2' }
    ]
    const { lastFrame } = render(<Banner title="Rows" rows={rows} />)
    const frame = lastFrame()
    expect(frame).toContain('Rows')
    expect(frame).toContain('Key1')
    expect(frame).toContain('Value1')
    expect(frame).toContain('Key2')
    expect(frame).toContain('Value2')
  })

  test('should support light style', () => {
    const { lastFrame } = render(<Banner title="Light" style="light" />)
    const frame = lastFrame()
    expect(frame).toContain('Light')
    expect(frame).toContain('┌')
    expect(frame).toContain('┐')
  })

  test('should support heavy style', () => {
    const { lastFrame } = render(<Banner title="Heavy" style="heavy" />)
    const frame = lastFrame()
    expect(frame).toContain('Heavy')
  })
})
