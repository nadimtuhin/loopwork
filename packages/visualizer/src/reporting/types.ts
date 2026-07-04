import { LoopStats, Task } from '@loopwork-ai/loopwork/contracts'

export interface ReportData {
  namespace: string
  timestamp: string
  stats: LoopStats
  tasks: Task[]
  costSummary?: {
    totalCost: number
    totalTokens: number
    modelUsage: Record<string, { cost: number; tokens: number }>
  }
}

export interface ReportOptions {
  outputPath?: string
  includeTasks?: boolean
  includeStats?: boolean
  includeCost?: boolean
  format?: 'markdown' | 'pdf' | 'both'
}

export interface IReportGenerator {
  generate(data: ReportData, options?: ReportOptions): Promise<string[]>
}
