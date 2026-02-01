import type {
  ILLMAnalyzer,
  IErrorAnalyzer,
  ITaskOutputAnalyzer,
  ErrorAnalysisRequest,
  ErrorAnalysisResponse,
  TaskOutputAnalysisRequest,
  TaskOutputAnalysisResponse,
} from '../contracts/llm-analyzer'

interface AnalyzerEntry {
  name: string
  instance: ILLMAnalyzer<unknown, unknown>
  isActive: boolean
}

class AnalyzerRegistry {
  private analyzers = new Map<string, AnalyzerEntry>()
  private errorAnalyzers: string[] = []
  private taskOutputAnalyzers: string[] = []
  private activeErrorAnalyzer: string | undefined
  private activeTaskOutputAnalyzer: string | undefined

  register<TRequest, TResponse>(
    name: string,
    analyzer: ILLMAnalyzer<TRequest, TResponse>
  ): void {
    const entry: AnalyzerEntry = {
      name,
      instance: analyzer as ILLMAnalyzer<unknown, unknown>,
      isActive: false,
    }
    this.analyzers.set(name, entry)

    if (analyzer.name === 'error-analyzer') {
      if (!this.errorAnalyzers.includes(name)) {
        this.errorAnalyzers.push(name)
      }
      if (!this.activeErrorAnalyzer) {
        this.setActiveErrorAnalyzer(name)
      }
    } else if (analyzer.name === 'task-output-analyzer') {
      if (!this.taskOutputAnalyzers.includes(name)) {
        this.taskOutputAnalyzers.push(name)
      }
      if (!this.activeTaskOutputAnalyzer) {
        this.setActiveTaskOutputAnalyzer(name)
      }
    }
  }

  get<TRequest, TResponse>(name: string): ILLMAnalyzer<TRequest, TResponse> | undefined {
    return this.analyzers.get(name)?.instance as ILLMAnalyzer<TRequest, TResponse> | undefined
  }

  getActiveErrorAnalyzer(): IErrorAnalyzer | undefined {
    if (!this.activeErrorAnalyzer) return undefined
    const entry = this.analyzers.get(this.activeErrorAnalyzer)
    return entry?.instance as IErrorAnalyzer | undefined
  }

  getActiveTaskOutputAnalyzer(): ITaskOutputAnalyzer | undefined {
    if (!this.activeTaskOutputAnalyzer) return undefined
    const entry = this.analyzers.get(this.activeTaskOutputAnalyzer)
    return entry?.instance as ITaskOutputAnalyzer | undefined
  }

  getErrorAnalyzer(): IErrorAnalyzer | undefined {
    return this.getActiveErrorAnalyzer()
  }

  getTaskOutputAnalyzer(): ITaskOutputAnalyzer | undefined {
    return this.getActiveTaskOutputAnalyzer()
  }

  setErrorAnalyzer(analyzer: IErrorAnalyzer, name?: string): void {
    const analyzerName = name || `error-analyzer-${Date.now()}`
    this.addErrorAnalyzer(analyzerName, analyzer)
    this.setActiveErrorAnalyzer(analyzerName)
  }

  setTaskOutputAnalyzer(analyzer: ITaskOutputAnalyzer, name?: string): void {
    const analyzerName = name || `task-output-analyzer-${Date.now()}`
    this.addTaskOutputAnalyzer(analyzerName, analyzer)
    this.setActiveTaskOutputAnalyzer(analyzerName)
  }

  getAllErrorAnalyzers(): Array<{ name: string; analyzer: IErrorAnalyzer }> {
    return this.errorAnalyzers
      .map((name) => {
        const entry = this.analyzers.get(name)
        if (!entry) return null
        return {
          name,
          analyzer: entry.instance as IErrorAnalyzer,
          isActive: name === this.activeErrorAnalyzer,
        }
      })
      .filter((item): item is { name: string; analyzer: IErrorAnalyzer; isActive: boolean } => item !== null)
      .map(({ name, analyzer }) => ({ name, analyzer }))
  }

  getAllTaskOutputAnalyzers(): Array<{ name: string; analyzer: ITaskOutputAnalyzer }> {
    return this.taskOutputAnalyzers
      .map((name) => {
        const entry = this.analyzers.get(name)
        if (!entry) return null
        return {
          name,
          analyzer: entry.instance as ITaskOutputAnalyzer,
          isActive: name === this.activeTaskOutputAnalyzer,
        }
      })
      .filter((item): item is { name: string; analyzer: ITaskOutputAnalyzer; isActive: boolean } => item !== null)
      .map(({ name, analyzer }) => ({ name, analyzer }))
  }

  setActiveErrorAnalyzer(name: string): boolean {
    if (!this.errorAnalyzers.includes(name)) return false
    if (this.activeErrorAnalyzer) {
      const oldEntry = this.analyzers.get(this.activeErrorAnalyzer)
      if (oldEntry) oldEntry.isActive = false
    }
    this.activeErrorAnalyzer = name
    const newEntry = this.analyzers.get(name)
    if (newEntry) newEntry.isActive = true
    return true
  }

  setActiveTaskOutputAnalyzer(name: string): boolean {
    if (!this.taskOutputAnalyzers.includes(name)) return false
    if (this.activeTaskOutputAnalyzer) {
      const oldEntry = this.analyzers.get(this.activeTaskOutputAnalyzer)
      if (oldEntry) oldEntry.isActive = false
    }
    this.activeTaskOutputAnalyzer = name
    const newEntry = this.analyzers.get(name)
    if (newEntry) newEntry.isActive = true
    return true
  }

  addErrorAnalyzer(name: string, analyzer: IErrorAnalyzer): void {
    this.register(name, analyzer)
  }

  addTaskOutputAnalyzer(name: string, analyzer: ITaskOutputAnalyzer): void {
    this.register(name, analyzer)
  }

  swapErrorAnalyzer(name: string): boolean {
    return this.setActiveErrorAnalyzer(name)
  }

  swapTaskOutputAnalyzer(name: string): boolean {
    return this.setActiveTaskOutputAnalyzer(name)
  }

  isActive(name: string): boolean {
    const entry = this.analyzers.get(name)
    return entry?.isActive ?? false
  }

  getActiveName(type: 'error' | 'task-output'): string | undefined {
    return type === 'error' ? this.activeErrorAnalyzer : this.activeTaskOutputAnalyzer
  }

  list(): string[] {
    return Array.from(this.analyzers.keys())
  }

  listByType(type: 'error' | 'task-output'): string[] {
    return type === 'error' ? [...this.errorAnalyzers] : [...this.taskOutputAnalyzers]
  }

  unregister(name: string): boolean {
    const entry = this.analyzers.get(name)
    if (!entry) return false

    this.analyzers.delete(name)

    if (entry.instance.name === 'error-analyzer') {
      this.errorAnalyzers = this.errorAnalyzers.filter((n) => n !== name)
      if (this.activeErrorAnalyzer === name) {
        this.activeErrorAnalyzer = this.errorAnalyzers[0]
        if (this.activeErrorAnalyzer) {
          const newActive = this.analyzers.get(this.activeErrorAnalyzer)
          if (newActive) newActive.isActive = true
        }
      }
    } else if (entry.instance.name === 'task-output-analyzer') {
      this.taskOutputAnalyzers = this.taskOutputAnalyzers.filter((n) => n !== name)
      if (this.activeTaskOutputAnalyzer === name) {
        this.activeTaskOutputAnalyzer = this.taskOutputAnalyzers[0]
        if (this.activeTaskOutputAnalyzer) {
          const newActive = this.analyzers.get(this.activeTaskOutputAnalyzer)
          if (newActive) newActive.isActive = true
        }
      }
    }

    return true
  }

  clear(): void {
    this.analyzers.clear()
    this.errorAnalyzers = []
    this.taskOutputAnalyzers = []
    this.activeErrorAnalyzer = undefined
    this.activeTaskOutputAnalyzer = undefined
  }

  clearByType(type: 'error' | 'task-output'): void {
    const namesToRemove = type === 'error' ? [...this.errorAnalyzers] : [...this.taskOutputAnalyzers]
    namesToRemove.forEach((name) => this.analyzers.delete(name))

    if (type === 'error') {
      this.errorAnalyzers = []
      this.activeErrorAnalyzer = undefined
    } else {
      this.taskOutputAnalyzers = []
      this.activeTaskOutputAnalyzer = undefined
    }
  }

  getStats(): {
    total: number
    errorAnalyzers: number
    taskOutputAnalyzers: number
    activeError: string | undefined
    activeTaskOutput: string | undefined
  } {
    return {
      total: this.analyzers.size,
      errorAnalyzers: this.errorAnalyzers.length,
      taskOutputAnalyzers: this.taskOutputAnalyzers.length,
      activeError: this.activeErrorAnalyzer,
      activeTaskOutput: this.activeTaskOutputAnalyzer,
    }
  }
}

export const analyzerRegistry = new AnalyzerRegistry()

export function createAnalyzerRegistry(): AnalyzerRegistry {
  return new AnalyzerRegistry()
}

export async function analyzeError(request: ErrorAnalysisRequest): Promise<ErrorAnalysisResponse | null> {
  const analyzer = analyzerRegistry.getActiveErrorAnalyzer()
  if (!analyzer) {
    throw new Error('No error analyzer registered')
  }
  return analyzer.analyze(request)
}

export async function analyzeTaskOutput(request: TaskOutputAnalysisRequest): Promise<TaskOutputAnalysisResponse> {
  const analyzer = analyzerRegistry.getActiveTaskOutputAnalyzer()
  if (!analyzer) {
    throw new Error('No task output analyzer registered')
  }
  return analyzer.analyze(request)
}
