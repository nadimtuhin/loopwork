import type { IErrorAnalyzer, ITaskOutputAnalyzer } from '../contracts/llm-analyzer'

export interface IAnalyzerProvider {
  createErrorAnalyzer(config?: Record<string, unknown>): IErrorAnalyzer
  createTaskOutputAnalyzer(config?: Record<string, unknown>): ITaskOutputAnalyzer
}

export interface IErrorAnalyzerFactory {
  create(config?: Record<string, unknown>): IErrorAnalyzer
}

export interface ITaskOutputAnalyzerFactory {
  create(config?: Record<string, unknown>): ITaskOutputAnalyzer
}

export interface IAnalyzerRegistry {
  registerProvider(name: string, provider: IAnalyzerProvider): void
  registerErrorAnalyzerFactory(name: string, factory: IErrorAnalyzerFactory): void
  registerTaskOutputAnalyzerFactory(name: string, factory: ITaskOutputAnalyzerFactory): void
  getErrorAnalyzer(name: string): IErrorAnalyzer | undefined
  getTaskOutputAnalyzer(name: string): ITaskOutputAnalyzer | undefined
  setActiveErrorAnalyzer(name: string): boolean
  setActiveTaskOutputAnalyzer(name: string): boolean
  getActiveErrorAnalyzer(): IErrorAnalyzer | undefined
  getActiveTaskOutputAnalyzer(): ITaskOutputAnalyzer | undefined
  list(): string[]
}
