import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

describe('TaskList', () => {
  test('module parses and renders a task card', async () => {
    const { default: TaskList } = await import('../components/TaskList')
    const html = renderToStaticMarkup(
      <TaskList tasks={[{ id: 'T-1', title: 'Write docs', status: 'pending', priority: 'high' }]} />
    )
    expect(html).toContain('#T-1')
    expect(html).toContain('Write docs')
  })
})
