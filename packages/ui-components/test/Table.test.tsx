import React from 'react'
import { render } from 'ink-testing-library'
import { Table } from '../src/Table'
import { describe, test, expect } from 'bun:test'

describe('Table', () => {
  test('renders headers and rows', () => {
    const headers = ['Col1', 'Col2']
    const rows = [['Val1', 'Val2']]
    const { lastFrame } = render(<Table headers={headers} rows={rows} useThemeColors={false} />)
    expect(lastFrame()).toContain('Col1')
    expect(lastFrame()).toContain('Val1')
  })
})
