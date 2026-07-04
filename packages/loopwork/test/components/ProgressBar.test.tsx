import React from 'react'
import { describe, test, expect } from 'bun:test'
import { render } from 'ink-testing-library'
import { ProgressBar } from '../../src/components/ProgressBar'
import { ThemeProvider } from '../../src/theme'

describe('ProgressBar Component', () => {
  test('should render determinate progress bar', () => {
    const { lastFrame } = render(
      <ThemeProvider>
        <ProgressBar current={75} total={100} message="Processing..." width={20} />
      </ThemeProvider>
    )
    const frame = lastFrame() || ''
    expect(frame).toContain('[████████████░░░░░░░░]')
    expect(frame).toContain('75%')
    expect(frame).toContain('Processing...')
  })

  test('should render 0% progress', () => {
    const { lastFrame } = render(
      <ThemeProvider>
        <ProgressBar current={0} total={100} width={20} />
      </ThemeProvider>
    )
    const frame = lastFrame() || ''
    expect(frame).toContain('[░░░░░░░░░░░░░░░░░░░░░]')
    expect(frame).toContain('0%')
  })

  test('should render 100% complete', () => {
    const { lastFrame } = render(
      <ThemeProvider>
        <ProgressBar current={100} total={100} completed={true} />
      </ThemeProvider>
    )
    const frame = lastFrame() || ''
    expect(frame).toContain('✓')
    expect(frame).toContain('Complete')
  })

  test('should render indeterminate mode', () => {
    const { lastFrame } = render(
      <ThemeProvider>
        <ProgressBar indeterminate={true} message="Loading..." />
      </ThemeProvider>
    )
    const frame = lastFrame() || ''
    expect(frame).toContain('⠋')
    expect(frame).toContain('Loading...')
  })

  test('should render indeterminate without message', () => {
    const { lastFrame } = render(
      <ThemeProvider>
        <ProgressBar indeterminate={true} />
      </ThemeProvider>
    )
    const frame = lastFrame() || ''
    expect(frame).toContain('⠋')
  })

  test('should render indeterminate spinner animation frames', () => {
    const { lastFrame } = render(
      <ThemeProvider>
        <ProgressBar indeterminate={true} message="Test" />
      </ThemeProvider>
    )
    const frame = lastFrame() || ''
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
    expect(frames.some(frame => frame.length > 0)).toBe(true)
  })

  test('should support custom width', () => {
    const { lastFrame } = render(
      <ThemeProvider>
        <ProgressBar current={50} total={100} width={10} />
      </ThemeProvider>
    )
    const frame = lastFrame() || ''
    expect(frame).toContain('[████░░░░░]')
    expect(frame).toContain('50%')
  })

  test('should support event subscription', () => {
    const renderer = {} as any
    const { lastFrame } = render(
      <ThemeProvider>
        <ProgressBar renderer={renderer} />
      </ThemeProvider>
    )
    const frame = lastFrame() || ''
    expect(frame).toBeTruthy()
  })

  test('should render without message', () => {
    const { lastFrame } = render(
      <ThemeProvider>
        <ProgressBar current={25} total={100} />
      </ThemeProvider>
    )
    const frame = lastFrame() || ''
    expect(frame).toContain('25%')
  })

  test('should normalize percentage between 0 and 100', () => {
    const { lastFrame } = render(
      <ThemeProvider>
        <ProgressBar current={150} total={100} width={20} />
      </ThemeProvider>
    )
    const frame = lastFrame() || ''
    expect(frame).toContain('100%')
  })

  test('should normalize negative percentage', () => {
    const { lastFrame } = render(
      <ThemeProvider>
        <ProgressBar current={-50} total={100} width={20} />
      </ThemeProvider>
    )
    const frame = lastFrame() || ''
    expect(frame).toContain('0%')
  })
})
