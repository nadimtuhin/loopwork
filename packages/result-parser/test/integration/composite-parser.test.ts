import { describe, test, expect, mock } from 'bun:test'
import { CompositeResultParser } from '../../src/core/composite-parser'
import type { ParseContext, IGitRunner } from '../../src/contracts'

describe('CompositeResultParser', () => {
  const parser = new CompositeResultParser()

  const createMockGitRunner = (diffOutput: string): IGitRunner => ({
    diff: mock(async () => diffOutput),
    status: mock(async () => ''),
  })

  const createContext = (overrides: Partial<ParseContext> = {}): ParseContext => ({
    workDir: '/test',
    exitCode: 0,
    durationMs: 1000,
    ...overrides,
  })

  test('combines all sub-parsers into unified result', async () => {
    const gitRunner = createMockGitRunner('A\tsrc/new.ts\nM\tsrc/existing.ts\n')
    const context = createContext({
      exitCode: 0,
      durationMs: 5000,
      gitRunner,
    })

    const output = `
      Task completed successfully.
      Created src/new.ts
      Modified src/existing.ts
      TODO: Add unit tests
      Tokens used: 1500
    `

    const result = await parser.parse(output, context)

    expect(result.status).toBe('success')
    expect(result.artifacts).toHaveLength(2)
    expect(result.followUpTasks).toHaveLength(1)
    expect(result.metrics.durationMs).toBe(5000)
    expect(result.metrics.tokensUsed).toBe(1500)
    expect(result.rawOutput).toBe(output)
  })

  test('generates summary from output', async () => {
    const context = createContext({ exitCode: 0 })
    const output = `
      Implemented the authentication feature.
      Added login and logout endpoints.
      Tests pass successfully.
    `

    const result = await parser.parse(output, context)

    expect(result.summary).toBeTruthy()
    expect(result.summary.length).toBeLessThan(500)
  })

  test('handles failures correctly', async () => {
    const context = createContext({ exitCode: 1 })
    const output = `
      Task FAILED due to compilation errors.
      Error: Cannot find module './missing'
    `

    const result = await parser.parse(output, context)

    expect(result.status).toBe('failure')
    expect(result.summary).toContain('FAILED')
  })

  test('preserves raw output', async () => {
    const context = createContext()
    const output = 'Exact output content\nWith multiple lines'

    const result = await parser.parse(output, context)

    expect(result.rawOutput).toBe(output)
  })

  test('handles empty output gracefully', async () => {
    const context = createContext({ exitCode: 0 })
    const output = ''

    const result = await parser.parse(output, context)

    expect(result.status).toBe('success')
    expect(result.artifacts).toEqual([])
    expect(result.followUpTasks).toEqual([])
    expect(result.rawOutput).toBe('')
  })

  test('handles partial status with warnings', async () => {
    const context = createContext({ exitCode: 1 })
    const output = `
      Some operations ran but there were warnings.
      Warning: Deprecated API usage detected.
      Partial progress was made.
    `

    const result = await parser.parse(output, context)

    expect(result.status).toBe('partial')
  })
})
