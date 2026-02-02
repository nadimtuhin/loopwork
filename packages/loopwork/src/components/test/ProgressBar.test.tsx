import React from 'react'
import { render } from 'ink-testing-library'
import { ProgressBar } from '../ProgressBar'
import { describe, test, expect } from 'bun:test'

describe('ProgressBar', () => {
  test('renders determinate progress', () => {
    const { lastFrame } = render(<ProgressBar current={50} total={100} useThemeColors={false} />)
    expect(lastFrame()).toContain('50%')
  })

  test('renders indeterminate progress', () => {
    const { lastFrame } = render(<ProgressBar indeterminate={true} message="Loading..." useThemeColors={false} />)
    expect(lastFrame()).toContain('Loading...')
  })

  test('renders completed state', () => {
    const { lastFrame } = render(<ProgressBar completed={true} message="Done" useThemeColors={false} />)
    expect(lastFrame()).toContain('Done')
  })
  
  test('renders with custom width', () => {
     const { lastFrame } = render(<ProgressBar current={50} total={100} width={10} useThemeColors={false} />)
     expect(lastFrame()).toContain('50%')
  })
})
