import type { IMetricsExtractor, ParseContext } from '../contracts'
import type { ResultMetrics } from '../contracts'

export class MetricsExtractor implements IMetricsExtractor {
  private readonly tokenPatterns = [
    /tokens?\s*(?:used)?:\s*(\d+)/i,
    /used\s+(\d+)\s*tokens/i,
    /(\d+)\s*tokens?\s*consumed/i,
  ]

  private readonly toolCallPatterns = [
    /tool\s*calls?:\s*(\d+)/i,
    /(\d+)\s*tool\s*calls?/i,
  ]

  parse(output: string, context: ParseContext): ResultMetrics {
    return {
      durationMs: context.durationMs,
      exitCode: context.exitCode,
      tokensUsed: this.extractTokens(output),
      toolCalls: this.extractToolCalls(output),
    }
  }

  private extractTokens(output: string): number | undefined {
    for (const pattern of this.tokenPatterns) {
      const match = output.match(pattern)
      if (match && match[1]) {
        return parseInt(match[1], 10)
      }
    }
    return undefined
  }

  private extractToolCalls(output: string): number | undefined {
    for (const pattern of this.toolCallPatterns) {
      const match = output.match(pattern)
      if (match && match[1]) {
        return parseInt(match[1], 10)
      }
    }
    return undefined
  }
}
