import React from 'react'
import { describe, test, expect } from 'bun:test'
import { render } from 'ink-testing-library'
import { InkTable } from '../../src/components/InkTable'

describe('InkTable Component', () => {
  test('should render headers', () => {
    const { lastFrame } = render(
      <InkTable headers={['Name', 'Status']} rows={[]} />
    )
    const frame = lastFrame()
    expect(frame).toContain('Name')
    expect(frame).toContain('Status')
  })

  test('should render data rows', () => {
    const { lastFrame } = render(
      <InkTable
        headers={['Name', 'Status']}
        rows={[
          ['Task 1', 'Complete'],
          ['Task 2', 'Failed'],
        ]}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('Task 1')
    expect(frame).toContain('Complete')
    expect(frame).toContain('Task 2')
    expect(frame).toContain('Failed')
  })

  test('should render table borders', () => {
    const { lastFrame } = render(
      <InkTable headers={['A']} rows={[['B']]} />
    )
    const frame = lastFrame()
    expect(frame).toContain('┌')
    expect(frame).toContain('┐')
    expect(frame).toContain('└')
    expect(frame).toContain('┘')
  })

  test('should support column alignment', () => {
    const { lastFrame } = render(
      <InkTable
        headers={['Left', 'Right', 'Center']}
        rows={[['A', 'B', 'C']]}
        columnConfigs={[
          { align: 'left' },
          { align: 'right' },
          { align: 'center' },
        ]}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('Left')
    expect(frame).toContain('Right')
    expect(frame).toContain('Center')
  })

  test('should support custom column widths', () => {
    const { lastFrame } = render(
      <InkTable
        headers={['Narrow', 'Wide']}
        rows={[['A', 'Very long content here']]}
        columnConfigs={[{ width: 10 }, { width: 30 }]}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('Narrow')
    expect(frame).toContain('Wide')
  })

  test('should handle empty rows', () => {
    const { lastFrame } = render(
      <InkTable headers={['Header']} rows={[]} />
    )
    const frame = lastFrame()
    expect(frame).toContain('Header')
    expect(frame).toContain('┌')
    expect(frame).toContain('┐')
  })

  test('should handle single row', () => {
    const { lastFrame } = render(
      <InkTable headers={['One']} rows={[['Single']]} />
    )
    const frame = lastFrame()
    expect(frame).toContain('Single')
  })

  test('should handle single column', () => {
    const { lastFrame } = render(
      <InkTable headers={['Col']} rows={[['Val']]} />
    )
    const frame = lastFrame()
    expect(frame).toContain('Col')
    expect(frame).toContain('Val')
  })
})
