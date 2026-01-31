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

  private readonly inputTokenPatterns = [
    /input\s*tokens?:\s*(\d+)/i,
    /prompt\s*tokens?:\s*(\d+)/i,
    /(\d+)\s*prompt\s*tokens?/i,
    /Tokens:\s*(\d+)\s*input/i,
  ]

  private readonly outputTokenPatterns = [
    /output\s*tokens?:\s*(\d+)/i,
    /completion\s*tokens?:\s*(\d+)/i,
    /(\d+)\s*completion\s*tokens?/i,
    /output:\s*(\d+)\s*tokens/i,
    /input,\s*(\d+)\s*output/i,
  ]

  parse(output: string, context: ParseContext): ResultMetrics {
    const inputTokens = this.extractFromPatterns(output, this.inputTokenPatterns)
    const outputTokens = this.extractFromPatterns(output, this.outputTokenPatterns)
    const tokensUsed = (inputTokens !== undefined && outputTokens !== undefined)
      ? inputTokens + outputTokens
      : this.extractFromPatterns(output, this.tokenPatterns)

    return {
      durationMs: context.durationMs,
      exitCode: context.exitCode,
      tokensUsed,
      inputTokens,
      outputTokens,
      toolCalls: this.extractToolCalls(output),
    }
  }

  private extractFromPatterns(output: string, patterns: RegExp[]): number | undefined {
    for (const pattern of patterns) {
      const match = output.match(pattern)
      if (match && match[1]) {
        return parseInt(match[1], 10)
      }
    }
    return undefined
  }

  private extractTokens(output: string): number | undefined {
    return this.extractFromPatterns(output, this.tokenPatterns)
  }

  private extractToolCalls(output: string): number | undefined {
    return this.extractFromPatterns(output, this.toolCallPatterns)
  }
}
