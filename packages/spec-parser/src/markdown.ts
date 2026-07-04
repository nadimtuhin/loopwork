import type { IPrdParser, ITaskDefinition, ValidationResult } from '@loopwork-ai/contracts'
import { ParseError } from '@loopwork-ai/contracts'

export class MarkdownPrdParser implements IPrdParser {
  readonly name = 'markdown'
  readonly description = 'Parses Markdown PRD files'

  async parse(content: string): Promise<ITaskDefinition> {
    try {
      const lines = content.split('\n')
      let id = ''
      let title = ''
      const descriptionLines: string[] = []
      const requirements: string[] = []
      const successCriteria: string[] = []
      let currentSection = 'description'

      for (const line of lines) {
        const titleMatch = line.match(/^#\s+(?:([A-Z]+-\d+):\s*)?(.+)$/)
        if (titleMatch) {
          if (titleMatch[1]) id = titleMatch[1]
          title = titleMatch[2].trim()
          continue
        }

        const sectionMatch = line.match(/^##\s+(.+)$/)
        if (sectionMatch) {
          const sectionName = sectionMatch[1].toLowerCase().trim()
          if (sectionName.includes('requirement')) {
            currentSection = 'requirements'
          } else if (sectionName.includes('success') || sectionName.includes('criteria')) {
            currentSection = 'successCriteria'
          } else if (sectionName.includes('goal') || sectionName.includes('description')) {
            currentSection = 'description'
          } else {
             currentSection = 'description' 
             if (currentSection === 'description') descriptionLines.push(line)
          }
          continue
        }

        if (currentSection === 'requirements') {
          const itemMatch = line.match(/^[-*]\s+(.+)$/)
          if (itemMatch) {
            requirements.push(itemMatch[1].trim())
          }
        } else if (currentSection === 'successCriteria') {
           const itemMatch = line.match(/^[-*]\s+(?:\[[ xX]\]\s+)?(.+)$/)
          if (itemMatch) {
            successCriteria.push(itemMatch[1].trim())
          }
        } else if (currentSection === 'description') {
          descriptionLines.push(line)
        }
      }

      const description = descriptionLines.join('\n').trim()

      return {
        id,
        title: title || 'Untitled Task',
        description,
        requirements,
        successCriteria,
        sourceFormat: 'markdown',
        parsedAt: new Date()
      }
    } catch (error) {
       throw new ParseError(
        'Failed to parse markdown content',
        'PARSE_ERROR',
        error instanceof Error ? error : new Error(String(error))
      )
    }
  }

  async parseFromBuffer(buffer: Buffer): Promise<ITaskDefinition> {
    return this.parse(buffer.toString('utf-8'))
  }

  async validate(content: string): Promise<ValidationResult> {
    const errors: string[] = []
    
    if (!content.trim()) {
      errors.push('Content is empty')
    }

    const titleMatch = content.match(/^#\s+(.+)$/m)
    if (!titleMatch) {
      errors.push('Missing title (H1 header)')
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: []
    }
  }

  supportedExtensions(): string[] {
    return ['.md', '.markdown']
  }
}
