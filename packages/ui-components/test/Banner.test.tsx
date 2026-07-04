import React from 'react'
import { render } from 'ink-testing-library'
import { Banner } from '../src/Banner'
import { describe, test, expect } from 'bun:test'

describe('Banner', () => {
  test('renders title', () => {
    const { lastFrame } = render(<Banner title="Test Title" useThemeColors={false} />)
    expect(lastFrame()).toContain('Test Title')
  })

  test('renders rows', () => {
    const rows = [
      { key: 'Key1', value: 'Value1' },
      { key: 'Key2', value: 'Value2' },
    ]
    const { lastFrame } = render(<Banner title="Test" rows={rows} useThemeColors={false} />)
    expect(lastFrame()).toContain('Key1')
    expect(lastFrame()).toContain('Value1')
    expect(lastFrame()).toContain('Key2')
    expect(lastFrame()).toContain('Value2')
  })

  test('renders with different styles', () => {
    const { lastFrame } = render(<Banner title="Light" style="light" useThemeColors={false} />)
    expect(lastFrame()).toContain('Light')
  })
})
