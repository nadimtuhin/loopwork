import React from 'react'
import { logger, renderInk, InkBanner, InkTable } from '../core/utils'
import { CostTracker, formatTelemetryReport } from '@loopwork-ai/cost-tracking'

export interface TelemetryOptions {
  namespace?: string
  projectRoot?: string
  json?: boolean
  output?: 'ink' | 'json' | 'plain'
}

export async function telemetry(options: TelemetryOptions = {}): Promise<void> {
  const projectRoot = options.projectRoot || process.cwd()
  const namespace = options.namespace || 'default'
  const outputMode = options.output ?? (options.json ? 'json' : 'ink')

  const tracker = new CostTracker(projectRoot, namespace)
  const report = tracker.getTelemetryReport()

  if (report.summary.taskCount === 0) {
    logger.info(`No telemetry data found for namespace '${namespace}'`)
    return
  }

  if (outputMode === 'json') {
    logger.raw(JSON.stringify(report, null, 2))
    return
  }

  if (outputMode === 'plain') {
    logger.raw(formatTelemetryReport(report))
    return
  }

  // Ink mode (default)
  logger.raw('')

  const bannerOutput = renderInk(
    React.createElement(InkBanner, {
      title: 'Telemetry Report',
      rows: [
        { key: 'Namespace', value: namespace },
        { key: 'Project Root', value: projectRoot },
        { key: 'Total Tasks', value: report.summary.taskCount.toString() },
        { key: 'Success Rate', value: `${((report.summary.successCount / report.summary.taskCount) * 100).toFixed(1)}%` },
        { key: 'Total Cost', value: `$${report.summary.totalCost.toFixed(2)}` },
      ],
    })
  )
  logger.raw(bannerOutput)
  logger.raw('')

  const recentEntries = report.summary.entries.slice(-10).reverse().map(entry => {
    const totalTokens = (entry.usage.inputTokens || 0) + (entry.usage.outputTokens || 0)
    return [
      entry.taskId,
      entry.status,
      entry.model,
      `$${entry.cost.toFixed(4)}`,
      totalTokens.toString(),
    ]
  }) as string[][]

  const recentOutput = renderInk(
    React.createElement(InkTable, {
      headers: ['Task ID', 'Status', 'Model', 'Cost', 'Tokens'],
      rows: recentEntries,
    })
  )
  logger.raw(recentOutput)
  logger.raw('')

  const modelRows = Object.entries(report.byModel).map(([model, data]) => [
    model,
    data.taskCount.toString(),
    data.totalCost.toFixed(4),
    data.avgTokensPerSecond.toFixed(2),
  ]) as string[][]

  const modelTableOutput = renderInk(
    React.createElement(InkTable, {
      headers: ['Model', 'Tasks', 'Total Cost', 'Avg Tokens/s'],
      rows: modelRows,
    })
  )
  logger.raw(modelTableOutput)
}
