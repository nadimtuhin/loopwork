import fs from 'fs'
import type {
  IChangeLogProvider,
  ChangelogContext,
  ChangelogConfig,
  ChangelogEntryResult,
} from '@loopwork-ai/contracts'

export interface ChangelogProviderOptions {
  logger?: {
    debug: (msg: string) => void
    success: (msg: string) => void
    warn: (msg: string) => void
  }
}

/**
 * Default changelog configuration
 */
const DEFAULT_CONFIG: ChangelogConfig = {
  format: 'keepachangelog',
  includeTaskId: true,
  maxLines: 10,
}

/**
 * ChangelogProvider handles generating and updating changelog entries
 * extracted from DocumentationPlugin logic
 */
export class ChangelogProvider implements IChangeLogProvider {
  private logger: ChangelogProviderOptions['logger']

  constructor(options: ChangelogProviderOptions = {}) {
    this.logger = options.logger
  }

  async generateEntry(
    context: ChangelogContext,
    config: ChangelogConfig
  ): Promise<ChangelogEntryResult> {
    if (!context.success) {
      return {
        entry: '',
        noUpdateNeeded: true,
      }
    }

    const prompt = this.buildPrompt(context, '', {
      ...DEFAULT_CONFIG,
      ...config,
    })

    return {
      entry: prompt,
      noUpdateNeeded: false,
    }
  }

  async updateChangelog(filePath: string, entry: string): Promise<void> {
    if (!entry.trim()) {
      this.logger?.debug('No changelog entry to update')
      return
    }

    const currentContent = this.readFile(filePath)
    const updatedContent = this.insertEntry(currentContent, entry)
    this.writeFile(filePath, updatedContent)
    this.logger?.success(`Updated ${filePath}`)
  }

  buildPrompt(
    context: ChangelogContext,
    currentContent: string,
    config: ChangelogConfig
  ): string {
    const { format, includeTaskId, maxLines } = config

    const taskInfo = this.formatTaskInfo(context)

    return `You are updating a CHANGELOG.md file after a task completion.

${taskInfo}

Current CHANGELOG (first 50 lines):
\`\`\`markdown
${currentContent.split('\n').slice(0, 50).join('\n')}
\`\`\`

Instructions:
1. Add a new entry to the CHANGELOG following the "${format}" format
2. Place the entry in the appropriate section (Added, Changed, Fixed, etc.)
3. ${includeTaskId ? 'Include the task ID in the entry' : 'Do not include task IDs'}
4. Keep the entry concise (max ${maxLines} lines)
5. Maintain the existing format and style
6. Output ONLY the new changelog entry, not the entire file

Generate the new changelog entry:`
  }

  private formatTaskInfo(context: ChangelogContext): string {
    let info = `Task ID: ${context.taskId}
Task Title: ${context.title}
Task Result: ${context.success ? 'Success' : 'Failed'}`

    if (context.description) {
      info += `\nTask Description: ${context.description}`
    }

    if (context.output) {
      info += `\nTask Output:\n${context.output.slice(0, 500)}`
    }

    return info.trim()
  }

  private insertEntry(currentContent: string, entry: string): string {
    if (!currentContent.trim()) {
      return entry
    }

    const lines = currentContent.split('\n')
    const headerEndIndex = this.findHeaderEnd(lines)

    if (headerEndIndex > -1) {
      lines.splice(headerEndIndex, 0, '', entry, '')
    } else {
      lines.push('', entry)
    }

    return lines.join('\n')
  }

  private findHeaderEnd(lines: string[]): number {
    for (let i = 0; i < lines.length; i++) {
      if (i > 0 && lines[i].startsWith('## ')) {
        return i
      }
    }
    return -1
  }

  private readFile(filePath: string): string {
    if (!fs.existsSync(filePath)) {
      return ''
    }
    return fs.readFileSync(filePath, 'utf-8')
  }

  private writeFile(filePath: string, content: string): void {
    fs.writeFileSync(filePath, content, 'utf-8')
  }
}

/**
 * Create a ChangelogProvider instance
 */
export function createChangelogProvider(
  options?: ChangelogProviderOptions
): ChangelogProvider {
  return new ChangelogProvider(options)
}
