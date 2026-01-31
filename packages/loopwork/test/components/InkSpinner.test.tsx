import React from 'react'
import { describe, test, expect } from 'bun:test'
import { render } from 'ink-testing-library'
import { InkSpinner } from '../../src/components/InkSpinner'

describe('InkSpinner Component', () => {
  test('should render spinner with default type', () => {
    const { lastFrame } = render(<InkSpinner />)
    const frame = lastFrame()
    expect(frame).toBeTruthy()
  })

  test('should render different spinner types', () => {
    const { lastFrame, rerender } = render(<InkSpinner type="dots" />)
    expect(lastFrame()).toBeTruthy()

    rerender(<InkSpinner type="classic" />)
    expect(lastFrame()).toBeTruthy()

    rerender(<InkSpinner type="pulse" />)
    expect(lastFrame()).toBeTruthy()
  })

  test('should support custom color', () => {
    const { lastFrame } = render(
      <InkSpinner color="green" />
    )
    const frame = lastFrame()
    expect(frame).toBeTruthy()
  })

  test('should handle default color', () => {
    const { lastFrame } = render(<InkSpinner />)
    const frame = lastFrame()
    expect(frame).toBeTruthy()
  })
})
