import { describe, test, expect, mock } from 'bun:test'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { CompositeResultParser } from '../../src/core/composite-parser'
import type { ParseContext, IGitRunner } from '../../src/contracts'

describe('Fixture-based E2E Tests', () => {
  const parser = new CompositeResultParser()
  const fixturesDir = join(import.meta.dir, '../fixtures/cli-outputs')

  const createMockGitRunner = (files: string[]): IGitRunner => ({
    diff: mock(async () => files.map(f => `M\t${f}`).join('\n')),
    status: mock(async () => ''),
  })

  const createContext = (exitCode: number, files: string[] = []): ParseContext => ({
    workDir: '/test',
    exitCode,
    durationMs: 3000,
    gitRunner: files.length > 0 ? createMockGitRunner(files) : undefined,
  })

  test('parses success-output.txt correctly', async () => {
    const output = await readFile(join(fixturesDir, 'success-output.txt'), 'utf-8')
    const context = createContext(0, ['src/components/Button.tsx', 'src/styles/main.css'])

    const result = await parser.parse(output, context)

    expect(result.status).toBe('success')
    expect(result.artifacts).toHaveLength(2)
    expect(result.metrics.tokensUsed).toBe(2500)
    expect(result.metrics.toolCalls).toBe(8)
    expect(result.followUpTasks).toEqual([])
  })

  test('parses failure-output.txt correctly', async () => {
    const output = await readFile(join(fixturesDir, 'failure-output.txt'), 'utf-8')
    const context = createContext(1)

    const result = await parser.parse(output, context)

    expect(result.status).toBe('failure')
    expect(result.followUpTasks).toHaveLength(2)
    expect(result.followUpTasks[0].title).toBe('Fix type definitions')
    expect(result.followUpTasks[1].suggestedAgent).toBe('architect')
    expect(result.metrics.tokensUsed).toBe(1200)
  })

  test('parses partial-output.txt correctly', async () => {
    const output = await readFile(join(fixturesDir, 'partial-output.txt'), 'utf-8')
    const context = createContext(1)

    const result = await parser.parse(output, context)

    expect(result.status).toBe('partial')
    expect(result.followUpTasks).toHaveLength(2)
    expect(result.followUpTasks[0].source).toBe('json')
    expect(result.followUpTasks[0].priority).toBe(2)
    expect(result.followUpTasks[1].priority).toBe(3)
    expect(result.metrics.tokensUsed).toBe(1800)
    expect(result.metrics.toolCalls).toBe(5)
  })
})
