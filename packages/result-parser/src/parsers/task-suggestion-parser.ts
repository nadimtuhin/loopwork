import type { ITaskSuggestionParser, ParseContext } from '../contracts'
import type { TaskSuggestion } from '../contracts'

export class TaskSuggestionParser implements ITaskSuggestionParser {
  private readonly patterns = [
    /(?:TODO|NEXT|FOLLOWUP):\s*(?:@(\w+)\s+)?(.+?)(?:\n|$)/gi,
  ]

  private readonly jsonBlockPattern = /```json:follow-up-tasks\s*([\s\S]*?)```/gi

  parse(output: string, context: ParseContext): TaskSuggestion[] {
    const suggestions: TaskSuggestion[] = []
    const seenTitles = new Set<string>()

    // Parse JSON blocks first (higher priority)
    this.parseJsonBlocks(output, suggestions, seenTitles)

    // Parse pattern-based suggestions
    this.parsePatterns(output, suggestions, seenTitles)

    return suggestions
  }

  private parseJsonBlocks(
    output: string,
    suggestions: TaskSuggestion[],
    seenTitles: Set<string>
  ): void {
    const matches = output.matchAll(this.jsonBlockPattern)

    for (const match of matches) {
      try {
        const jsonContent = match[1].trim()
        const parsed = JSON.parse(jsonContent)
        const tasks = Array.isArray(parsed) ? parsed : [parsed]

        for (const task of tasks) {
          if (task.title && !seenTitles.has(task.title.toLowerCase())) {
            seenTitles.add(task.title.toLowerCase())
            suggestions.push({
              title: task.title,
              description: task.description || '',
              priority: task.priority,
              suggestedAgent: task.suggestedAgent,
              source: 'json',
            })
          }
        }
      } catch {
        // Invalid JSON, skip
      }
    }
  }

  private parsePatterns(
    output: string,
    suggestions: TaskSuggestion[],
    seenTitles: Set<string>
  ): void {
    for (const pattern of this.patterns) {
      const matches = output.matchAll(pattern)

      for (const match of matches) {
        const agent = match[1]
        let title = match[2].trim()

        // Clean up the title
        title = title.replace(/\.$/, '')

        if (title && !seenTitles.has(title.toLowerCase())) {
          seenTitles.add(title.toLowerCase())
          suggestions.push({
            title,
            description: '',
            suggestedAgent: agent,
            source: 'pattern',
          })
        }
      }
    }
  }
}
