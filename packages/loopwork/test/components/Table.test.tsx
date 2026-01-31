import React from 'react'
import { describe, test, expect } from 'bun:test'
import { render } from 'ink-testing-library'
import { Table } from '../../src/components/Table'

describe('Table Component', () => {
  test('should render headers', () => {
    const { lastFrame } = render(
      <Table headers={['Name', 'Status']} rows={[]} />
    )
    const frame = lastFrame()
    expect(frame).toContain('Name')
    expect(frame).toContain('Status')
  })

  test('should render data rows', () => {
    const { lastFrame } = render(
      <Table
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

  test('should support column alignment', () => {
    const { lastFrame } = render(
      <Table
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

  test('should handle empty rows', () => {
    const { lastFrame } = render(
      <Table headers={['Header']} rows={[]} />
    )
    const frame = lastFrame()
    expect(frame).toContain('Header')
  })
})
