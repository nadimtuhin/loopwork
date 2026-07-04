import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { ReportGenerator } from '../reporting/generator'
import { ReportData } from '../reporting/types'
import { existsSync, unlinkSync } from 'fs'
import { join } from 'path'

describe('ReportGenerator', () => {
  const mockData: ReportData = {
    namespace: 'test-namespace',
    timestamp: new Date().toISOString(),
    stats: {
      completed: 2,
      failed: 1,
      duration: 5000
    },
    tasks: [
      { id: 'T1', title: 'Task 1', status: 'completed', priority: 'high', description: 'desc 1' },
      { id: 'T2', title: 'Task 2', status: 'completed', priority: 'medium', description: 'desc 2' },
      { id: 'T3', title: 'Task 3', status: 'failed', priority: 'low', description: 'desc 3', lastError: 'Some error' }
    ],
    costSummary: {
      totalCost: 0.05,
      totalTokens: 1000,
      modelUsage: {
        'claude-3-sonnet': { cost: 0.05, tokens: 1000 }
      }
    }
  }

  const outputPath = join(process.cwd(), '.test-reports')

  beforeEach(() => {
  })

  it('should generate a markdown report', async () => {
    const generator = new ReportGenerator()
    const files = await generator.generate(mockData, { outputPath, format: 'markdown' })

    expect(files.length).toBe(1)
    expect(files[0]).toEndWith('.md')
    expect(existsSync(files[0])).toBe(true)

    unlinkSync(files[0])
  })

  it('should generate a PDF report', async () => {
    const generator = new ReportGenerator()
    const files = await generator.generate(mockData, { outputPath, format: 'pdf' })

    expect(files.length).toBe(1)
    expect(files[0]).toEndWith('.pdf')
    expect(existsSync(files[0])).toBe(true)

    unlinkSync(files[0])
  })

  it('should generate both reports by default', async () => {
    const generator = new ReportGenerator()
    const files = await generator.generate(mockData, { outputPath })

    expect(files.length).toBe(2)
    expect(files.some(f => f.endsWith('.md'))).toBe(true)
    expect(files.some(f => f.endsWith('.pdf'))).toBe(true)

    files.forEach(f => unlinkSync(f))
  })
})
