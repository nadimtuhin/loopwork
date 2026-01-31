import { describe, test, expect, mock } from 'bun:test'
import { ArtifactDetector } from '../../src/parsers/artifact-detector'
import type { ParseContext, IGitRunner } from '../../src/contracts'

describe('ArtifactDetector', () => {
  const detector = new ArtifactDetector()

  const createMockGitRunner = (diffOutput: string, statusOutput: string = ''): IGitRunner => ({
    diff: mock(async () => diffOutput),
    status: mock(async () => statusOutput),
  })

  const createContext = (overrides: Partial<ParseContext> = {}): ParseContext => ({
    workDir: '/test',
    exitCode: 0,
    durationMs: 1000,
    ...overrides,
  })

  test('detects created files from git diff', async () => {
    const gitRunner = createMockGitRunner('A\tsrc/new-file.ts\n')
    const context = createContext({ gitRunner })

    const result = await detector.parse('Created new file', context)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      path: 'src/new-file.ts',
      action: 'created',
    })
  })

  test('detects modified files from git diff', async () => {
    const gitRunner = createMockGitRunner('M\tsrc/existing.ts\n')
    const context = createContext({ gitRunner })

    const result = await detector.parse('Modified file', context)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      path: 'src/existing.ts',
      action: 'modified',
    })
  })

  test('detects deleted files from git diff', async () => {
    const gitRunner = createMockGitRunner('D\tsrc/removed.ts\n')
    const context = createContext({ gitRunner })

    const result = await detector.parse('Deleted file', context)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      path: 'src/removed.ts',
      action: 'deleted',
    })
  })

  test('returns empty array when no git runner provided', async () => {
    const context = createContext({ gitRunner: undefined })

    const result = await detector.parse('Some output', context)

    expect(result).toEqual([])
  })

  test('parses numstat for line changes', async () => {
    const gitRunner: IGitRunner = {
      diff: mock(async (args: string[]) => {
        if (args.includes('--name-status')) {
          return 'M\tsrc/file.ts\n'
        }
        if (args.includes('--numstat')) {
          return '10\t5\tsrc/file.ts\n'
        }
        return ''
      }),
      status: mock(async () => ''),
    }
    const context = createContext({ gitRunner })

    const result = await detector.parse('Modified with stats', context)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      path: 'src/file.ts',
      action: 'modified',
      linesAdded: 10,
      linesRemoved: 5,
    })
  })

  test('handles multiple files', async () => {
    const gitRunner = createMockGitRunner('A\tsrc/a.ts\nM\tsrc/b.ts\nD\tsrc/c.ts\n')
    const context = createContext({ gitRunner })

    const result = await detector.parse('Multiple changes', context)

    expect(result).toHaveLength(3)
    expect(result.map(r => r.action)).toEqual(['created', 'modified', 'deleted'])
  })
})
