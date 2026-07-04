import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import type {
  IDocGenerator,
  DocContext,
  DocConfig,
  DocGenerationResult,
} from '@loopwork-ai/contracts'

export interface DocGeneratorOptions {
  logger?: {
    debug: (msg: string) => void
    success: (msg: string) => void
    warn: (msg: string) => void
    info: (msg: string) => void
  }
}

/**
 * Default documentation configuration
 */
const DEFAULT_CONFIG: Required<DocConfig> = {
  model: 'haiku',
  cli: 'claude',
  maxLines: 10,
  includeTaskId: true,
}

/**
 * DocGenerator handles generating and updating documentation files
 * extracted from DocumentationPlugin logic
 */
export class DocGenerator implements IDocGenerator {
  private logger: DocGeneratorOptions['logger']

  constructor(options: DocGeneratorOptions = {}) {
    this.logger = options.logger
  }

  async generateDoc(
    context: DocContext,
    filePath: string,
    currentContent: string,
    config: DocConfig
  ): Promise<DocGenerationResult> {
    if (!context.success) {
      return {
        content: '',
        noUpdateNeeded: true,
      }
    }

    const fileType = path.basename(filePath)
    const resolvedConfig = this.resolveConfig(config)
    const prompt = this.buildPrompt(context, fileType, currentContent, resolvedConfig)

    try {
      const generatedContent = await this.callCli(resolvedConfig.cli, resolvedConfig.model, prompt)
      return {
        content: generatedContent,
        noUpdateNeeded: false,
      }
    } catch (error) {
      this.logger?.warn(`Documentation generation failed: ${error}`)
      return {
        content: '',
        noUpdateNeeded: true,
      }
    }
  }

  async applyDoc(filePath: string, content: string, fileType: string): Promise<void> {
    if (!content.trim() || content.trim() === 'NO_UPDATE_NEEDED') {
      this.logger?.debug(`No documentation update needed for ${fileType}`)
      return
    }

    const currentContent = this.readFile(filePath)
    let updatedContent: string

    if (fileType === 'CHANGELOG.md') {
      updatedContent = this.insertEntry(currentContent, content)
    } else {
      updatedContent = `${currentContent}\n\n${content}`
    }

    this.writeFile(filePath, updatedContent)
    this.logger?.success(`Updated ${fileType}`)
  }

  buildPrompt(
    context: DocContext,
    fileType: string,
    currentContent: string,
    config: DocConfig
  ): string {
    const resolvedConfig = this.resolveConfig(config)
    const taskInfo = this.formatTaskInfo(context)
    const maxLines = resolvedConfig.maxLines

    if (fileType === 'CHANGELOG.md') {
      return `You are updating a CHANGELOG.md file after a task completion.

${taskInfo}

Current CHANGELOG (first 50 lines):
\`\`\`markdown
${currentContent.split('\n').slice(0, 50).join('\n')}
\`\`\`

Instructions:
1. Add a new entry to the CHANGELOG following the "keepachangelog" format
2. Place the entry in the appropriate section (Added, Changed, Fixed, etc.)
3. ${resolvedConfig.includeTaskId ? 'Include the task ID in the entry' : 'Do not include task IDs'}
4. Keep the entry concise (max ${maxLines} lines)
5. Maintain the existing format and style
6. Output ONLY the new changelog entry, not the entire file

Generate the new changelog entry:`
    } else if (fileType === 'README.md') {
      return `You are updating a README.md file after a task completion.

${taskInfo}

Current README (first 100 lines):
\`\`\`markdown
${currentContent.split('\n').slice(0, 100).join('\n')}
\`\`\`

Instructions:
1. Determine if this task introduces a feature that should be documented in the README
2. If yes, generate a brief documentation section/update (max ${maxLines} lines)
3. If no, respond with "NO_UPDATE_NEEDED"
4. Maintain the existing format and style
5. Output ONLY the new/updated section, not the entire file

Generate the README update (or NO_UPDATE_NEEDED):`
    } else {
      return `You are updating the file "${fileType}" after a task completion.

${taskInfo}

Current file content (first 100 lines):
\`\`\`markdown
${currentContent.split('\n').slice(0, 100).join('\n')}
\`\`\`

Instructions:
1. Generate an appropriate update for this documentation file (max ${maxLines} lines)
2. Maintain the existing format and style
3. Output ONLY the new/updated content, not the entire file
4. If no update is needed, respond with "NO_UPDATE_NEEDED"

Generate the documentation update:`
    }
  }

  private resolveConfig(config: DocConfig): Required<DocConfig> {
    return {
      ...DEFAULT_CONFIG,
      ...config,
    }
  }

  private formatTaskInfo(context: DocContext): string {
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

  private async callCli(cli: string, model: string, prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = ['--model', model]
      const child = spawn(cli, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''

      child.stdout?.on('data', (data) => {
        stdout += data.toString()
      })

      child.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Documentation generation failed: ${stderr}`))
          return
        }

        resolve(stdout.trim())
      })

      child.on('error', (err) => {
        reject(new Error(`Failed to spawn ${cli}: ${err.message}`))
      })

      child.stdin?.write(prompt)
      child.stdin?.end()
    })
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
 * Create a DocGenerator instance
 */
export function createDocGenerator(options?: DocGeneratorOptions): DocGenerator {
  return new DocGenerator(options)
}
