import type { ICliExecutor, ExecutionOptions, ITaskMinimal } from '@loopwork-ai/contracts'

interface ResponsePattern {
  pattern: RegExp
  response: string | ((prompt: string) => string)
  exitCode?: number
  delay?: number
}

interface ExecutionLog {
  prompt: string
  outputFile: string
  timeout: number
  options?: ExecutionOptions
  response: string
  exitCode: number
  timestamp: number
}

export class MockCliExecutor implements ICliExecutor {
  private patterns: ResponsePattern[] = []
  private defaultResponse = 'Mock CLI response'
  private defaultExitCode = 0
  private executionLogs: ExecutionLog[] = []
  private currentPid?: number
  private simulateTimeout = false
  private timeoutDuration = 0

  addPattern(pattern: RegExp, response: string | ((prompt: string) => string), exitCode = 0, delay = 0): void {
    this.patterns.push({ pattern, response, exitCode, delay })
  }

  setDefaultResponse(response: string, exitCode = 0): void {
    this.defaultResponse = response
    this.defaultExitCode = exitCode
  }

  setTimeoutBehavior(shouldTimeout: boolean, duration = 0): void {
    this.simulateTimeout = shouldTimeout
    this.timeoutDuration = duration
  }

  getExecutionLogs(): ExecutionLog[] {
    return [...this.executionLogs]
  }

  clearLogs(): void {
    this.executionLogs = []
  }

  clearPatterns(): void {
    this.patterns = []
  }

  async execute(
    prompt: string,
    outputFile: string,
    timeoutSecs: number,
    options?: ExecutionOptions
  ): Promise<number> {
    if (this.simulateTimeout) {
      const delay = this.timeoutDuration || timeoutSecs * 1000
      await new Promise(resolve => setTimeout(resolve, delay + 100))
      throw new Error('Execution timeout')
    }

    const matchedPattern = this.patterns.find(p => p.pattern.test(prompt))
    
    let response: string
    let exitCode: number
    let delay = 0

    if (matchedPattern) {
      response = typeof matchedPattern.response === 'function'
        ? matchedPattern.response(prompt)
        : matchedPattern.response
      exitCode = matchedPattern.exitCode ?? 0
      delay = matchedPattern.delay ?? 0
    } else {
      response = this.defaultResponse
      exitCode = this.defaultExitCode
    }

    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay))
    }

    this.executionLogs.push({
      prompt,
      outputFile,
      timeout: timeoutSecs,
      options,
      response,
      exitCode,
      timestamp: Date.now(),
    })

    this.currentPid = Math.floor(Math.random() * 100000)

    if (outputFile) {
      const fs = await import('fs')
      await fs.promises.writeFile(outputFile, response)
    }

    return exitCode
  }

  async executeTask(
    task: ITaskMinimal,
    prompt: string,
    outputFile: string,
    timeoutSecs: number,
    options?: Omit<ExecutionOptions, 'taskId' | 'priority' | 'feature'>
  ): Promise<number> {
    const fullOptions: ExecutionOptions = {
      ...options,
      taskId: task.id,
      priority: task.priority,
      feature: task.feature,
    }

    return this.execute(prompt, outputFile, timeoutSecs, fullOptions)
  }

  killCurrent(): void {
    this.currentPid = undefined
  }

  async cleanup(): Promise<void> {
    this.currentPid = undefined
    this.executionLogs = []
  }

  getCurrentPid(): number | undefined {
    return this.currentPid
  }

  getLastExecution(): ExecutionLog | undefined {
    return this.executionLogs[this.executionLogs.length - 1]
  }

  getExecutionCount(): number {
    return this.executionLogs.length
  }

  getExecutionsByTaskId(taskId: string): ExecutionLog[] {
    return this.executionLogs.filter(log => log.options?.taskId === taskId)
  }

  reset(): void {
    this.patterns = []
    this.executionLogs = []
    this.currentPid = undefined
    this.defaultResponse = 'Mock CLI response'
    this.defaultExitCode = 0
    this.simulateTimeout = false
    this.timeoutDuration = 0
  }
}
