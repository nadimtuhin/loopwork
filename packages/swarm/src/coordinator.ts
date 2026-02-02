/**
 * Swarm Coordinator
 * 
 * Orchestrates multiple test generator agents to work in parallel
 * on increasing test coverage across packages.
 */

import type { AgentPersona } from './schemas/persona'
import { BuildResultAggregator, type ExportOptions } from './aggregation/build-aggregator'

export interface Task {
  id: string
  type: 'generate-tests' | 'verify-tests' | 'fix-tests' | 'delegate'
  target: string
  priority: number
  context?: Record<string, unknown>
}

export interface TaskResult {
  taskId: string
  success: boolean
  output: string
  filesCreated: string[]
  subTasks?: Task[]
  error?: string
  duration?: number
  agentId?: string
}

export interface SwarmAgent {
  id: string
  persona: AgentPersona
  execute: (task: Task) => Promise<TaskResult>
}

export interface SwarmConfig {
  maxConcurrency: number
  timeoutMs: number
  retryFailed: boolean
}

export class SwarmCoordinator {
  private agents: Map<string, SwarmAgent> = new Map()
  private tasks: Task[] = []
  private results: TaskResult[] = []
  private config: SwarmConfig

  constructor(config: Partial<SwarmConfig> = {}) {
    this.config = {
      maxConcurrency: config.maxConcurrency ?? 5,
      timeoutMs: config.timeoutMs ?? 60000,
      retryFailed: config.retryFailed ?? true,
    }
  }

  registerAgent(agent: SwarmAgent): void {
    this.agents.set(agent.id, agent)
  }

  addTask(task: Task): void {
    this.tasks.push(task)
  }

  addTasks(tasks: Task[]): void {
    this.tasks.push(...tasks)
  }

  async run(): Promise<TaskResult[]> {
    const queue = [...this.tasks].sort((a, b) => b.priority - a.priority)
    this.tasks = []
    
    while (queue.length > 0) {
      const batch = queue.splice(0, this.config.maxConcurrency)
      const batchPromises = batch.map(task => this.executeTask(task))
      const batchResults = await Promise.allSettled(batchPromises)
      
      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i]
        const currentTask = batch[i]

        if (result.status === 'fulfilled') {
          const taskResult = result.value
          this.results.push(taskResult)

          if (taskResult.subTasks && taskResult.subTasks.length > 0) {
            queue.push(...taskResult.subTasks)
            queue.sort((a, b) => b.priority - a.priority)
          }
        } else {
          this.results.push({
            taskId: currentTask.id,
            success: false,
            output: '',
            filesCreated: [],
            error: result.reason?.message || 'Unknown error',
          })
        }
      }
    }

    return this.results
  }

  private async executeTask(task: Task): Promise<TaskResult> {
    // Find best agent for task type
    const agent = this.selectAgentForTask(task)
    if (!agent) {
      throw new Error(`No agent available for task type: ${task.type}`)
    }

    // Execute with timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Task timeout')), this.config.timeoutMs)
    })

    return Promise.race([agent.execute(task), timeoutPromise])
  }

  private selectAgentForTask(task: Task): SwarmAgent | undefined {
    // Simple selection: find agent with matching capability
    for (const agent of this.agents.values()) {
      if (agent.persona.capabilities?.includes(task.type)) {
        return agent
      }
    }
    // Fallback to first available agent
    return this.agents.values().next().value
  }

  getResults(): TaskResult[] {
    return [...this.results]
  }

  getSuccessfulResults(): TaskResult[] {
    return this.results.filter(r => r.success)
  }

  getFailedResults(): TaskResult[] {
    return this.results.filter(r => !r.success)
  }

  generateReport(): string {
    const total = this.results.length
    const successful = this.getSuccessfulResults().length
    const failed = total - successful
    const filesCreated = this.results.reduce((acc, r) => acc + r.filesCreated.length, 0)

    return `
╔══════════════════════════════════════════════════════════╗
║           SWARM TEST GENERATION REPORT                   ║
╠══════════════════════════════════════════════════════════╣
║ Total Tasks:     ${total.toString().padEnd(39)} ║
║ Successful:      ${successful.toString().padEnd(39)} ║
║ Failed:          ${failed.toString().padEnd(39)} ║
║ Files Created:   ${filesCreated.toString().padEnd(39)} ║
╚══════════════════════════════════════════════════════════╝

Failed Tasks:
${this.getFailedResults().map(r => `  - ${r.taskId}: ${r.error}`).join('\n') || '  None'}

Created Files:
${this.getSuccessfulResults().flatMap(r => r.filesCreated).map(f => `  - ${f}`).join('\n') || '  None'}
`
  }

  /**
   * Create a BuildResultAggregator with current results
   */
  createAggregator(): BuildResultAggregator {
    return new BuildResultAggregator(this.results)
  }

  /**
   * Generate aggregated report with detailed metrics
   */
  generateAggregatedReport(): string {
    const aggregator = this.createAggregator()
    return aggregator.generateSummary()
  }

  /**
   * Export results to JSON format
   */
  exportToJSON(options?: ExportOptions): string {
    const aggregator = this.createAggregator()
    return aggregator.exportToJSON(options)
  }

  /**
   * Export results to Markdown format
   */
  exportToMarkdown(): string {
    const aggregator = this.createAggregator()
    return aggregator.exportToMarkdown()
  }

  /**
   * Export results to HTML format
   */
  exportToHTML(): string {
    const aggregator = this.createAggregator()
    return aggregator.exportToHTML()
  }
}
