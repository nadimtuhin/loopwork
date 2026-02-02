/**
 * Build Result Aggregation System
 *
 * Comprehensive result aggregation for swarm task execution.
 * Provides statistics, filtering, and export capabilities.
 */

import type { TaskResult } from '../coordinator'

export interface AggregatedMetrics {
  total: number
  successful: number
  failed: number
  successRate: number
  averageDuration: number
  totalDuration: number
  filesCreated: number
  filesCreatedPerTask: number
}

export interface PackageMetrics {
  package: string
  total: number
  successful: number
  failed: number
  successRate: number
  filesCreated: string[]
  averageDuration: number
}

export interface AgentMetrics {
  agentId: string
  total: number
  successful: number
  failed: number
  successRate: number
  tasksHandled: string[]
}

export interface TaskTypeMetrics {
  type: string
  count: number
  successful: number
  failed: number
  successRate: number
}

export interface TimingMetrics {
  fastest: { taskId: string; duration: number }
  slowest: { taskId: string; duration: number }
  average: number
  median: number
  percentiles: {
    p50: number
    p75: number
    p90: number
    p95: number
    p99: number
  }
}

export interface ErrorAnalysis {
  totalErrors: number
  uniqueErrors: string[]
  errorFrequency: Map<string, number>
  mostCommonError?: string
}

export interface FilterCriteria {
  status?: 'success' | 'failed'
  package?: string
  agentId?: string
  taskType?: string
  minDuration?: number
  maxDuration?: number
  hasFiles?: boolean
}

export interface ExportOptions {
  includeMetrics?: boolean
  includeRawResults?: boolean
  includeTiming?: boolean
  includeErrors?: boolean
  pretty?: boolean
}

export class BuildResultAggregator {
  private results: TaskResult[] = []
  private startTime: number = 0
  private endTime: number = 0

  constructor(results: TaskResult[] = []) {
    this.results = [...results]
  }

  /**
   * Set the execution time window
   */
  setTimeWindow(startTime: number, endTime: number): void {
    this.startTime = startTime
    this.endTime = endTime
  }

  /**
   * Add a result to the aggregation
   */
  addResult(result: TaskResult): void {
    this.results.push(result)
  }

  /**
   * Add multiple results
   */
  addResults(results: TaskResult[]): void {
    this.results.push(...results)
  }

  /**
   * Get all results
   */
  getResults(): TaskResult[] {
    return [...this.results]
  }

  /**
   * Get basic metrics
   */
  getMetrics(): AggregatedMetrics {
    const total = this.results.length
    const successful = this.results.filter(r => r.success).length
    const failed = total - successful
    const successRate = total > 0 ? (successful / total) * 100 : 0

    const durations = this.results
      .map(r => (r as TaskResult & { duration?: number }).duration)
      .filter((d): d is number => d !== undefined)

    const totalDuration = durations.reduce((a, b) => a + b, 0)
    const averageDuration = durations.length > 0 ? totalDuration / durations.length : 0

    const filesCreated = this.results.reduce((acc, r) => acc + r.filesCreated.length, 0)
    const filesCreatedPerTask = total > 0 ? filesCreated / total : 0

    return {
      total,
      successful,
      failed,
      successRate,
      averageDuration,
      totalDuration,
      filesCreated,
      filesCreatedPerTask,
    }
  }

  /**
   * Get metrics grouped by package
   */
  getMetricsByPackage(): PackageMetrics[] {
    const byPackage = new Map<string, TaskResult[]>()

    for (const result of this.results) {
      const packageName = this.extractPackageFromTaskId(result.taskId)
      if (!byPackage.has(packageName)) {
        byPackage.set(packageName, [])
      }
      byPackage.get(packageName)!.push(result)
    }

    return Array.from(byPackage.entries()).map(([packageName, results]) => {
      const total = results.length
      const successful = results.filter(r => r.success).length
      const failed = total - successful
      const successRate = total > 0 ? (successful / total) * 100 : 0

      const filesCreated = results.flatMap(r => r.filesCreated)

      const durations = results
        .map(r => (r as TaskResult & { duration?: number }).duration)
        .filter((d): d is number => d !== undefined)
      const averageDuration = durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0

      return {
        package: packageName,
        total,
        successful,
        failed,
        successRate,
        filesCreated,
        averageDuration,
      }
    })
  }

  /**
   * Get metrics grouped by agent (if agent info is available)
   */
  getMetricsByAgent(): AgentMetrics[] {
    const byAgent = new Map<string, TaskResult[]>()

    for (const result of this.results) {
      const agentId = (result as TaskResult & { agentId?: string }).agentId || 'unknown'
      if (!byAgent.has(agentId)) {
        byAgent.set(agentId, [])
      }
      byAgent.get(agentId)!.push(result)
    }

    return Array.from(byAgent.entries()).map(([agentId, results]) => {
      const total = results.length
      const successful = results.filter(r => r.success).length
      const failed = total - successful
      const successRate = total > 0 ? (successful / total) * 100 : 0

      return {
        agentId,
        total,
        successful,
        failed,
        successRate,
        tasksHandled: results.map(r => r.taskId),
      }
    })
  }

  /**
   * Get metrics grouped by task type
   */
  getMetricsByTaskType(): TaskTypeMetrics[] {
    const byType = new Map<string, { count: number; successful: number; failed: number }>()

    for (const result of this.results) {
      const type = this.extractTaskTypeFromTaskId(result.taskId)
      const current = byType.get(type) || { count: 0, successful: 0, failed: 0 }
      current.count++
      if (result.success) {
        current.successful++
      } else {
        current.failed++
      }
      byType.set(type, current)
    }

    return Array.from(byType.entries()).map(([type, metrics]) => ({
      type,
      count: metrics.count,
      successful: metrics.successful,
      failed: metrics.failed,
      successRate: metrics.count > 0 ? (metrics.successful / metrics.count) * 100 : 0,
    }))
  }

  /**
   * Get detailed timing metrics
   */
  getTimingMetrics(): TimingMetrics | null {
    const durations = this.results
      .map(r => ({
        taskId: r.taskId,
        duration: (r as TaskResult & { duration?: number }).duration,
      }))
      .filter((d): d is { taskId: string; duration: number } => d.duration !== undefined)
      .sort((a, b) => a.duration - b.duration)

    if (durations.length === 0) {
      return null
    }

    const times = durations.map(d => d.duration)
    const total = times.reduce((a, b) => a + b, 0)
    const average = total / times.length

    const median = times.length % 2 === 0
      ? (times[times.length / 2 - 1] + times[times.length / 2]) / 2
      : times[Math.floor(times.length / 2)]

    const percentile = (p: number): number => {
      const index = Math.ceil((p / 100) * times.length) - 1
      return times[Math.max(0, Math.min(index, times.length - 1))]
    }

    return {
      fastest: durations[0],
      slowest: durations[durations.length - 1],
      average,
      median,
      percentiles: {
        p50: percentile(50),
        p75: percentile(75),
        p90: percentile(90),
        p95: percentile(95),
        p99: percentile(99),
      },
    }
  }

  /**
   * Analyze errors
   */
  getErrorAnalysis(): ErrorAnalysis {
    const errors = this.results
      .filter(r => !r.success && r.error)
      .map(r => r.error!)

    const errorFrequency = new Map<string, number>()
    for (const error of errors) {
      const normalized = this.normalizeError(error)
      errorFrequency.set(normalized, (errorFrequency.get(normalized) || 0) + 1)
    }

    const uniqueErrors = Array.from(errorFrequency.keys())
    let mostCommonError: string | undefined
    let maxFreq = 0

    for (const [error, freq] of errorFrequency) {
      if (freq > maxFreq) {
        maxFreq = freq
        mostCommonError = error
      }
    }

    return {
      totalErrors: errors.length,
      uniqueErrors,
      errorFrequency,
      mostCommonError,
    }
  }

  /**
   * Filter results based on criteria
   */
  filter(criteria: FilterCriteria): TaskResult[] {
    return this.results.filter(result => {
      if (criteria.status === 'success' && !result.success) return false
      if (criteria.status === 'failed' && result.success) return false

      if (criteria.package) {
        const pkg = this.extractPackageFromTaskId(result.taskId)
        if (pkg !== criteria.package) return false
      }

      if (criteria.agentId) {
        const agent = (result as TaskResult & { agentId?: string }).agentId
        if (agent !== criteria.agentId) return false
      }

      if (criteria.taskType) {
        const type = this.extractTaskTypeFromTaskId(result.taskId)
        if (type !== criteria.taskType) return false
      }

      const duration = (result as TaskResult & { duration?: number }).duration
      if (criteria.minDuration !== undefined && (duration === undefined || duration < criteria.minDuration)) {
        return false
      }
      if (criteria.maxDuration !== undefined && (duration === undefined || duration > criteria.maxDuration)) {
        return false
      }

      if (criteria.hasFiles && result.filesCreated.length === 0) return false

      return true
    })
  }

  /**
   * Export results to JSON
   */
  exportToJSON(options: ExportOptions = {}): string {
    const data: Record<string, unknown> = {}

    if (options.includeMetrics !== false) {
      data.metrics = this.getMetrics()
      data.byPackage = this.getMetricsByPackage()
      data.byAgent = this.getMetricsByAgent()
      data.byTaskType = this.getMetricsByTaskType()
    }

    if (options.includeTiming !== false) {
      data.timing = this.getTimingMetrics()
    }

    if (options.includeErrors !== false) {
      data.errors = this.getErrorAnalysis()
    }

    if (options.includeRawResults) {
      data.results = this.results
    }

    data.timeWindow = {
      start: this.startTime,
      end: this.endTime,
      totalDuration: this.endTime > 0 ? this.endTime - this.startTime : 0,
    }

    return JSON.stringify(data, null, options.pretty ? 2 : undefined)
  }

  /**
   * Export results to Markdown
   */
  exportToMarkdown(): string {
    const metrics = this.getMetrics()
    const byPackage = this.getMetricsByPackage()
    const timing = this.getTimingMetrics()
    const errors = this.getErrorAnalysis()

    let md = `# Build Result Report\n\n`
    md += `Generated: ${new Date().toISOString()}\n\n`

    // Summary
    md += `## Summary\n\n`
    md += `- **Total Tasks**: ${metrics.total}\n`
    md += `- **Successful**: ${metrics.successful}\n`
    md += `- **Failed**: ${metrics.failed}\n`
    md += `- **Success Rate**: ${metrics.successRate.toFixed(2)}%\n`
    md += `- **Files Created**: ${metrics.filesCreated}\n`
    md += `- **Total Duration**: ${this.formatDuration(metrics.totalDuration)}\n\n`

    // By Package
    if (byPackage.length > 0) {
      md += `## Results by Package\n\n`
      md += `| Package | Total | Success | Failed | Rate |\n`
      md += `|---------|-------|---------|--------|------|\n`
      for (const pkg of byPackage) {
        md += `| ${pkg.package} | ${pkg.total} | ${pkg.successful} | ${pkg.failed} | ${pkg.successRate.toFixed(1)}% |\n`
      }
      md += `\n`
    }

    // Timing
    if (timing) {
      md += `## Timing Metrics\n\n`
      md += `- **Fastest**: ${timing.fastest.taskId} (${this.formatDuration(timing.fastest.duration)})\n`
      md += `- **Slowest**: ${timing.slowest.taskId} (${this.formatDuration(timing.slowest.duration)})\n`
      md += `- **Average**: ${this.formatDuration(timing.average)}\n`
      md += `- **Median**: ${this.formatDuration(timing.median)}\n`
      md += `- **P95**: ${this.formatDuration(timing.percentiles.p95)}\n\n`
    }

    // Errors
    if (errors.totalErrors > 0) {
      md += `## Error Analysis\n\n`
      md += `- **Total Errors**: ${errors.totalErrors}\n`
      md += `- **Unique Errors**: ${errors.uniqueErrors.length}\n`
      if (errors.mostCommonError) {
        md += `- **Most Common**: ${errors.mostCommonError}\n`
      }
      md += `\n### Error Details\n\n`
      for (const [error, count] of errors.errorFrequency) {
        md += `- (${count}x) ${error}\n`
      }
      md += `\n`
    }

    // Files Created
    const allFiles = this.results.flatMap(r => r.filesCreated)
    if (allFiles.length > 0) {
      md += `## Files Created\n\n`
      for (const file of allFiles) {
        md += `- \`${file}\`\n`
      }
      md += `\n`
    }

    return md
  }

  /**
   * Export results to HTML
   */
  exportToHTML(): string {
    const metrics = this.getMetrics()
    const byPackage = this.getMetricsByPackage()
    const timing = this.getTimingMetrics()
    const errors = this.getErrorAnalysis()

    const failedResults = this.results.filter(r => !r.success)

    return `<!DOCTYPE html>
<html>
<head>
  <title>Build Result Report</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
    h1, h2 { color: #333; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
    .metric-card { background: #f5f5f5; padding: 15px; border-radius: 8px; }
    .metric-value { font-size: 2em; font-weight: bold; color: #0066cc; }
    .metric-label { color: #666; font-size: 0.9em; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { text-align: left; padding: 10px; border-bottom: 1px solid #ddd; }
    th { background: #f0f0f0; font-weight: 600; }
    .success { color: #28a745; }
    .failed { color: #dc3545; }
    .error-list { background: #fff5f5; padding: 15px; border-radius: 8px; border-left: 4px solid #dc3545; }
    .file-list { background: #f0fff4; padding: 15px; border-radius: 8px; border-left: 4px solid #28a745; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
  </style>
</head>
<body>
  <h1>Build Result Report</h1>
  <p>Generated: ${new Date().toLocaleString()}</p>

  <h2>Summary</h2>
  <div class="summary">
    <div class="metric-card">
      <div class="metric-value">${metrics.total}</div>
      <div class="metric-label">Total Tasks</div>
    </div>
    <div class="metric-card">
      <div class="metric-value" style="color: #28a745;">${metrics.successful}</div>
      <div class="metric-label">Successful</div>
    </div>
    <div class="metric-card">
      <div class="metric-value" style="color: #dc3545;">${metrics.failed}</div>
      <div class="metric-label">Failed</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${metrics.successRate.toFixed(1)}%</div>
      <div class="metric-label">Success Rate</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${metrics.filesCreated}</div>
      <div class="metric-label">Files Created</div>
    </div>
  </div>

  <h2>Results by Package</h2>
  <table>
    <tr>
      <th>Package</th>
      <th>Total</th>
      <th>Successful</th>
      <th>Failed</th>
      <th>Success Rate</th>
    </tr>
    ${byPackage.map(pkg => `
    <tr>
      <td>${pkg.package}</td>
      <td>${pkg.total}</td>
      <td class="success">${pkg.successful}</td>
      <td class="failed">${pkg.failed}</td>
      <td>${pkg.successRate.toFixed(1)}%</td>
    </tr>
    `).join('')}
  </table>

  ${timing ? `
  <h2>Timing Metrics</h2>
  <div class="summary">
    <div class="metric-card">
      <div class="metric-value">${this.formatDuration(timing.average)}</div>
      <div class="metric-label">Average</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${this.formatDuration(timing.median)}</div>
      <div class="metric-label">Median</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${this.formatDuration(timing.percentiles.p95)}</div>
      <div class="metric-label">P95</div>
    </div>
  </div>
  ` : ''}

  ${errors.totalErrors > 0 ? `
  <h2>Errors (${errors.totalErrors})</h2>
  <div class="error-list">
    <p><strong>Most Common:</strong> ${errors.mostCommonError || 'N/A'}</p>
    <ul>
      ${Array.from(errors.errorFrequency.entries()).map(([err, count]) => `
      <li>(${count}x) ${err}</li>
      `).join('')}
    </ul>
  </div>
  ` : ''}

  ${failedResults.length > 0 ? `
  <h2>Failed Tasks</h2>
  <table>
    <tr>
      <th>Task ID</th>
      <th>Error</th>
    </tr>
    ${failedResults.map(r => `
    <tr>
      <td><code>${r.taskId}</code></td>
      <td class="failed">${r.error || 'Unknown error'}</td>
    </tr>
    `).join('')}
  </table>
  ` : ''}

  ${this.results.flatMap(r => r.filesCreated).length > 0 ? `
  <h2>Files Created</h2>
  <div class="file-list">
    <ul>
      ${this.results.flatMap(r => r.filesCreated.map(f => `<li><code>${f}</code></li>`)).join('')}
    </ul>
  </div>
  ` : ''}
</body>
</html>`
  }

  /**
   * Generate a summary report
   */
  generateSummary(): string {
    const metrics = this.getMetrics()
    const timing = this.getTimingMetrics()

    let summary = `
╔══════════════════════════════════════════════════════════╗
║           BUILD RESULT AGGREGATION REPORT                ║
╠══════════════════════════════════════════════════════════╣
║ Total Tasks:     ${metrics.total.toString().padEnd(39)} ║
║ Successful:      ${metrics.successful.toString().padEnd(39)} ║
║ Failed:          ${metrics.failed.toString().padEnd(39)} ║
║ Success Rate:    ${(metrics.successRate.toFixed(2) + '%').padEnd(39)} ║
║ Files Created:   ${metrics.filesCreated.toString().padEnd(39)} ║
`

    if (timing) {
      summary += `╠══════════════════════════════════════════════════════════╣
║ Timing Metrics:                                          ║
║   Average:       ${this.formatDuration(timing.average).padEnd(39)} ║
║   Median:        ${this.formatDuration(timing.median).padEnd(39)} ║
║   P95:           ${this.formatDuration(timing.percentiles.p95).padEnd(39)} ║
`
    }

    summary += `╚══════════════════════════════════════════════════════════╝`

    return summary
  }

  /**
   * Clear all results
   */
  clear(): void {
    this.results = []
    this.startTime = 0
    this.endTime = 0
  }

  // Helper methods
  private extractPackageFromTaskId(taskId: string): string {
    const parts = taskId.split('-')
    return parts[0] || 'unknown'
  }

  private extractTaskTypeFromTaskId(taskId: string): string {
    const parts = taskId.split('-')
    return parts[parts.length - 1] || 'unknown'
  }

  private normalizeError(error: string): string {
    return error
      .replace(/\d+/g, 'N')
      .replace(/['"`][^'"`]*['"`]/g, 'X')
      .substring(0, 100)
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${Math.round(ms)}ms`
    }
    if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`
    }
    const mins = Math.floor(ms / 60000)
    const secs = ((ms % 60000) / 1000).toFixed(1)
    return `${mins}m ${secs}s`
  }
}

export function createBuildResultAggregator(results?: TaskResult[]): BuildResultAggregator {
  return new BuildResultAggregator(results)
}
