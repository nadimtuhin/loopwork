import { ReportData, ReportOptions } from './types'
import { Task } from '@loopwork-ai/loopwork/contracts'

export class MarkdownReportGenerator {
  generate(data: ReportData, options?: ReportOptions): string {
    const lines: string[] = []

    lines.push(`# Loopwork Execution Report`)
    lines.push(`**Namespace:** ${data.namespace}`)
    lines.push(`**Timestamp:** ${data.timestamp}`)
    lines.push(``)

    lines.push(`## Summary`)
    lines.push(`- **Total Tasks:** ${data.stats.completed + data.stats.failed}`)
    lines.push(`- **Completed:** ${data.stats.completed}`)
    lines.push(`- **Failed:** ${data.stats.failed}`)
    lines.push(`- **Duration:** ${(data.stats.duration / 1000).toFixed(2)}s`)
    lines.push(``)

    if (data.costSummary && options?.includeCost !== false) {
      lines.push(`## Cost Summary`)
      lines.push(`- **Total Cost:** $${data.costSummary.totalCost.toFixed(4)}`)
      lines.push(`- **Total Tokens:** ${data.costSummary.totalTokens.toLocaleString()}`)
      lines.push(``)
      
      if (Object.keys(data.costSummary.modelUsage).length > 0) {
        lines.push(`### Model Usage`)
        lines.push(`| Model | Cost | Tokens |`)
        lines.push(`| :--- | :--- | :--- |`)
        for (const [model, usage] of Object.entries(data.costSummary.modelUsage)) {
          lines.push(`| ${model} | $${usage.cost.toFixed(4)} | ${usage.tokens.toLocaleString()} |`)
        }
        lines.push(``)
      }
    }

    if (options?.includeTasks !== false) {
      lines.push(`## Task Details`)
      lines.push(`| ID | Title | Status | Priority | Feature |`)
      lines.push(`| :--- | :--- | :--- | :--- | :--- |`)
      
      for (const task of data.tasks) {
        lines.push(`| ${task.id} | ${task.title} | ${this.getStatusEmoji(task.status)} ${task.status} | ${task.priority} | ${task.feature || '-'} |`)
      }
      lines.push(``)

      const failedTasks = data.tasks.filter(t => t.status === 'failed')
      if (failedTasks.length > 0) {
        lines.push(`### Failed Tasks Details`)
        for (const task of failedTasks) {
          lines.push(`#### ${task.id}: ${task.title}`)
          lines.push(`**Error:** ${task.lastError || 'Unknown error'}`)
          lines.push(``)
        }
      }
    }

    return lines.join('\n')
  }

  private getStatusEmoji(status: string): string {
    switch (status) {
      case 'completed': return '✅'
      case 'failed': return '❌'
      case 'in-progress': return '⏳'
      case 'pending': return '📋'
      case 'quarantined': return '☣️'
      default: return '⚪'
    }
  }
}
