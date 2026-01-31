/**
 * Agent Prompt Builder Implementation
 *
 * Builds prompts combining agent instructions with task details.
 */

import type { Task } from '@loopwork-ai/loopwork/contracts'
import type { AgentDefinition } from '../contracts/agent'
import type { IPromptBuilder } from '../contracts/executor'

export class AgentPromptBuilder implements IPromptBuilder {
  /**
   * Build a prompt for task execution
   */
  build(task: Task, agent?: AgentDefinition, retryContext?: string): string {
    const sections: string[] = []

    // Agent instructions section
    if (agent) {
      sections.push(`## Agent Instructions\n\n${agent.prompt}`)
    }

    // Task section
    sections.push(this.buildTaskSection(task))

    // Retry context section
    if (retryContext) {
      sections.push(`## Previous Attempt Context\n\n${retryContext}`)
    }

    return sections.join('\n\n---\n\n')
  }

  private buildTaskSection(task: Task): string {
    const parts: string[] = []

    parts.push(`## Task: ${task.title}`)
    parts.push(`**ID:** ${task.id}`)
    parts.push(`**Priority:** ${task.priority}`)
    parts.push(`**Status:** ${task.status}`)

    if (task.feature) {
      parts.push(`**Feature:** ${task.feature}`)
    }

    parts.push(`\n### Description\n\n${task.description}`)

    if (task.metadata && Object.keys(task.metadata).length > 0) {
      parts.push(`\n### Metadata\n\n${this.formatMetadata(task.metadata)}`)
    }

    return parts.join('\n')
  }

  private formatMetadata(metadata: Record<string, unknown>): string {
    const lines: string[] = []

    for (const [key, value] of Object.entries(metadata)) {
      if (Array.isArray(value)) {
        lines.push(`- **${key}:** ${value.join(', ')}`)
      } else if (typeof value === 'object' && value !== null) {
        lines.push(`- **${key}:** ${JSON.stringify(value)}`)
      } else {
        lines.push(`- **${key}:** ${value}`)
      }
    }

    return lines.join('\n')
  }
}
