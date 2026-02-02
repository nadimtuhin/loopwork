import React from 'react'
import { describe, test, expect } from 'bun:test'
import { render } from 'ink-testing-library'
import { Banner } from '../../src/components/Banner'
import { ThemeProvider } from '../../src/theme'

describe('Banner Component (Theme Integration)', () => {
  test('should render title', () => {
    const { lastFrame } = render(
      <ThemeProvider>
        <Banner title="Test Title" />
      </ThemeProvider>
    )
    const frame = lastFrame() || ''
    expect(frame).toContain('Test Title')
  })

  test('should render rows', () => {
    const rows = [
      { key: 'Key1', value: 'Value1' },
      { key: 'Key2', value: 'Value2' }
    ]
    const { lastFrame } = render(
      <ThemeProvider>
        <Banner title="Rows" rows={rows} />
      </ThemeProvider>
    )
    const frame = lastFrame() || ''
    expect(frame).toContain('Rows')
    expect(frame).toContain('Key1')
    expect(frame).toContain('Value1')
    expect(frame).toContain('Key2')
    expect(frame).toContain('Value2')
  })

  test('should support light style', () => {
    const { lastFrame } = render(
      <ThemeProvider>
        <Banner title="Light" style="light" />
      </ThemeProvider>
    )
    const frame = lastFrame() || ''
    expect(frame).toContain('Light')
    expect(frame).toContain('┌')
    expect(frame).toContain('┐')
  })

  test('should support heavy style', () => {
    const { lastFrame } = render(
      <ThemeProvider>
        <Banner title="Heavy" style="heavy" />
      </ThemeProvider>
    )
    const frame = lastFrame() || ''
    expect(frame).toContain('Heavy')
  })

  test('should use theme colors when useThemeColors is true', () => {
    const { lastFrame } = render(
      <ThemeProvider>
        <Banner title="Test" useThemeColors={true} />
      </ThemeProvider>
    )
    const frame = lastFrame() || ''
    expect(frame).toContain('Test')
  })

  test('should use prop borderColor when provided', () => {
    const { lastFrame } = render(
      <ThemeProvider>
        <Banner title="Test" borderColor="red" />
      </ThemeProvider>
    )
    const frame = lastFrame() || ''
    expect(frame).toContain('Test')
    expect(frame).toContain('red')
  })
})
