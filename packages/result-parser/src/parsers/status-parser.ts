import type { IStatusParser, ParseContext } from '../contracts'
import type { SubagentResult } from '../contracts'

export class StatusParser implements IStatusParser {
  parse(output: string, context: ParseContext): SubagentResult['status'] {
    // Exit code 0 is always success
    if (context.exitCode === 0) {
      return 'success'
    }

    // Check for explicit success markers (case insensitive)
    if (/\b(SUCCESS|COMPLETED|DONE)\b/i.test(output)) {
      return 'success'
    }

    // Check for explicit failure markers (case insensitive)
    if (/\b(FAILED|ERROR|FATAL)\b/i.test(output)) {
      return 'failure'
    }

    // Non-zero exit code without clear markers = partial
    return 'partial'
  }
}
