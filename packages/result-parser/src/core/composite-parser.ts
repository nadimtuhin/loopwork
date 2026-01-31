import type { IResultParser, ParseContext } from '../contracts'
import type { SubagentResult } from '../contracts'
import { StatusParser } from '../parsers/status-parser'
import { ArtifactDetector } from '../parsers/artifact-detector'
import { TaskSuggestionParser } from '../parsers/task-suggestion-parser'
import { MetricsExtractor } from '../parsers/metrics-extractor'

export class CompositeResultParser implements IResultParser {
  private readonly statusParser: StatusParser
  private readonly artifactDetector: ArtifactDetector
  private readonly taskSuggestionParser: TaskSuggestionParser
  private readonly metricsExtractor: MetricsExtractor

  constructor() {
    this.statusParser = new StatusParser()
    this.artifactDetector = new ArtifactDetector()
    this.taskSuggestionParser = new TaskSuggestionParser()
    this.metricsExtractor = new MetricsExtractor()
  }

  async parse(output: string, context: ParseContext): Promise<SubagentResult> {
    const [status, artifacts, followUpTasks, metrics] = await Promise.all([
      Promise.resolve(this.statusParser.parse(output, context)),
      this.artifactDetector.parse(output, context),
      Promise.resolve(this.taskSuggestionParser.parse(output, context)),
      Promise.resolve(this.metricsExtractor.parse(output, context)),
    ])

    return {
      status,
      summary: this.generateSummary(output, status),
      artifacts,
      followUpTasks,
      metrics,
      rawOutput: output,
    }
  }

  private generateSummary(output: string, status: SubagentResult['status']): string {
    if (!output.trim()) {
      return status === 'success' ? 'Task completed successfully.' : 'Task finished with no output.'
    }

    // Extract first meaningful line(s) as summary
    const lines = output
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .filter(line => !line.startsWith('```'))
      .filter(line => !line.match(/^(TODO|NEXT|FOLLOWUP):/i))
      .filter(line => !line.match(/^(tokens?|tool\s*calls?):/i))

    if (lines.length === 0) {
      return status === 'success' ? 'Task completed successfully.' : 'Task finished.'
    }

    // Take first 3 lines or up to 500 chars
    let summary = ''
    for (const line of lines.slice(0, 3)) {
      if (summary.length + line.length > 500) break
      summary += (summary ? ' ' : '') + line
    }

    return summary || lines[0].substring(0, 500)
  }
}
