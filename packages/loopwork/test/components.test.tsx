import React from 'react'
import { render } from 'ink-testing-library'
import { describe, test, expect } from 'bun:test'
import { InkLog, InkSpinner, InkBanner, InkTable } from '../src/components'

describe('Ink Components', () => {
  test('InkLog renders correctly', () => {
    const { lastFrame } = render(<InkLog message="Test message" level="success" timestamp={false} />)
    expect(lastFrame()).toContain('SUCCESS:')
    expect(lastFrame()).toContain('Test message')
  })

  test('InkBanner renders correctly', () => {
    const { lastFrame } = render(<InkBanner title="Test Banner" rows={[{ key: 'Key', value: 'Value' }]} />)
    expect(lastFrame()).toContain('TEST BANNER')
    expect(lastFrame()).toContain('Key: Value')
  })

  test('InkTable renders correctly', () => {
    const { lastFrame } = render(
      <InkTable 
        headers={['H1', 'H2']} 
        rows={[['R1C1', 'R1C2']]} 
      />
    )
    expect(lastFrame()).toContain('H1')
    expect(lastFrame()).toContain('H2')
    expect(lastFrame()).toContain('R1C1')
    expect(lastFrame()).toContain('R1C2')
  })
})
