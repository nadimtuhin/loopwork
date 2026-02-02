import type {
  LoopworkPlugin,
  TaskBackend,
  Task,
  LoopStats,
  ConfigWrapper,
  LoopworkConfig,
  TaskContext,
  PluginTaskResult,
} from '../contracts'
import { logger } from '../core/utils'
import * as fs from 'fs/promises'
import * as path from 'path'

/**
 * Project Summary Plugin
 *
 * Generates AI-powered summaries of project progress, completed tasks,
 * and overall status at the end of a loop or on demand.
 */

export interface ProjectSummaryConfig {
  /** Enable project summarization */
  enabled?: boolean

  /** Output file path (default: .loopwork/project-summary.md) */
  outputFile?: string

  /** OpenAI API Key */
  openaiApiKey?: string

  /** Claude API Key */
  claudeApiKey?: string

  /** Model to use (default: gpt-4o-mini or claude-3-haiku) */
  model?: string

  /** Include recent file changes in summary */
  includeFileChanges?: boolean

  /** Include failed tasks in summary */
  includeFailures?: boolean
}

const DEFAULT_CONFIG: Required<ProjectSummaryConfig> = {
  enabled: true,
  outputFile: '.loopwork/project-summary.md',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  claudeApiKey: process.env.ANTHROPIC_API_KEY || '',
  model: 'gpt-4o-mini',
  includeFileChanges: true,
  includeFailures: true,
}

interface SummaryStats {
  completed: Task[]
  failed: Array<{ task: Task; error: string }>
  startTime: number
  endTime?: number
}

export class ProjectSummaryManager {
  private config: Required<ProjectSummaryConfig>
  private stats: SummaryStats

  constructor(config: ProjectSummaryConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.stats = {
      completed: [],
      failed: [],
      startTime: Date.now(),
    }
  }

  /**
   * Track a completed task
   */
  trackCompleted(task: Task, _result: PluginTaskResult) {
    this.stats.completed.push(task)
  }

  /**
   * Track a failed task
   */
  trackFailed(task: Task, error: string) {
    this.stats.failed.push({ task, error })
  }

  /**
   * Generate and save the summary
   */
  async generateAndSave(backend: TaskBackend): Promise<void> {
    if (!this.config.enabled) return

    try {
      this.stats.endTime = Date.now()
      const pendingTasks = await backend.listPendingTasks()
      
      const summary = await this.generateSummary(pendingTasks)
      await this.saveSummary(summary)
    } catch (error) {
      logger.error(`Failed to generate project summary: ${error}`)
    }
  }

  private async generateSummary(pendingTasks: Task[]): Promise<string> {
    const prompt = this.buildPrompt(pendingTasks)
    
    if (this.config.openaiApiKey) {
      try {
        return await this.generateOpenAISummary(prompt)
      } catch (e) {
        logger.debug(`OpenAI summary failed: ${e}`)
      }
    }

    if (this.config.claudeApiKey) {
      try {
        return await this.generateClaudeSummary(prompt)
      } catch (e) {
        logger.debug(`Claude summary failed: ${e}`)
      }
    }

    return this.generateBasicSummary(pendingTasks)
  }

  private buildPrompt(pendingTasks: Task[]): string {
    const parts = [
      'Generate a concise project status summary based on the following activity:',
      '',
      `## Session Duration: ${Math.round((Date.now() - this.stats.startTime) / 1000 / 60)} minutes`,
      '',
      `## Completed Tasks (${this.stats.completed.length})`,
      ...this.stats.completed.map(t => `- [${t.id}] ${t.title}`),
      '',
      `## Failed Tasks (${this.stats.failed.length})`,
      ...this.stats.failed.map(f => `- [${f.task.id}] ${f.task.title} (Error: ${f.error.substring(0, 100)}...)`),
      '',
      `## Pending Tasks (${pendingTasks.length})`,
      ...pendingTasks.slice(0, 10).map(t => `- [${t.id}] ${t.title}`),
      pendingTasks.length > 10 ? `...and ${pendingTasks.length - 10} more` : '',
      '',
      'Please provide a summary in Markdown format with:',
      '1. **Executive Summary**: 2-3 sentences on progress.',
      '2. **Key Achievements**: Bullet points of what was accomplished.',
      '3. **Issues/Blockers**: Note any failures or potential blockers.',
      '4. **Next Steps**: Suggestions based on pending tasks.',
    ]

    return parts.join('\n')
  }

  private async generateOpenAISummary(prompt: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000,
      }),
    })

    if (!response.ok) throw new Error(response.statusText)
    const data = await response.json() as any
    return data.choices[0].message.content
  }

  private async generateClaudeSummary(prompt: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.claudeApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model === 'gpt-4o-mini' ? 'claude-3-haiku-20240307' : this.config.model,
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) throw new Error(response.statusText)
    const data = await response.json() as any
    return data.content[0].text
  }

  private generateBasicSummary(pendingTasks: Task[]): string {
    return `# Project Summary
    
## Status Report
Generated at: ${new Date().toISOString()}

### ✅ Completed (${this.stats.completed.length})
${this.stats.completed.map(t => `- ${t.title}`).join('\n') || 'None'}

### ❌ Failed (${this.stats.failed.length})
${this.stats.failed.map(f => `- ${f.task.title}: ${f.error}`).join('\n') || 'None'}

### 📋 Pending (${pendingTasks.length})
${pendingTasks.slice(0, 10).map(t => `- ${t.title}`).join('\n')}
${pendingTasks.length > 10 ? `...and ${pendingTasks.length - 10} more` : ''}
`
  }

  private async saveSummary(content: string): Promise<void> {
    const filePath = path.resolve(process.cwd(), this.config.outputFile)
    const dir = path.dirname(filePath)
    
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(filePath, content, 'utf-8')
    logger.success(`Project summary saved to ${this.config.outputFile}`)
  }
}

export function createProjectSummaryPlugin(config: ProjectSummaryConfig = {}): LoopworkPlugin {
  const manager = new ProjectSummaryManager(config)
  let backend: TaskBackend | null = null

  return {
    name: 'project-summary',
    classification: 'enhancement',

    async onBackendReady(taskBackend) {
      backend = taskBackend
    },

    async onTaskComplete(context, result) {
      manager.trackCompleted(context.task, result)
    },

    async onTaskFailed(context, error) {
      manager.trackFailed(context.task, error)
    },

    async onLoopEnd(_stats: LoopStats) {
      if (backend) {
        await manager.generateAndSave(backend)
      }
    },
  }
}

export function withProjectSummary(config: ProjectSummaryConfig = {}): ConfigWrapper {
  return (configAny: unknown) => {
    const loopworkConfig = configAny as LoopworkConfig
    return {
      ...loopworkConfig,
      plugins: [...(loopworkConfig.plugins || []), createProjectSummaryPlugin(config)],
    }
  }
}
