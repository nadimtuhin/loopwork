import type { ILLMAnalyzer, IErrorAnalyzer, ITaskOutputAnalyzer } from '../../contracts/llm-analyzer'

export type ServiceIdentifier<T> = string | symbol | (new (...args: unknown[]) => T)

export interface IServiceContainer {
  register<T>(id: ServiceIdentifier<T>, factory: () => T): void
  registerInstance<T>(id: ServiceIdentifier<T>, instance: T): void
  resolve<T>(id: ServiceIdentifier<T>): T
  has<T>(id: ServiceIdentifier<T>): boolean
  clear(): void
}

export class ServiceContainer implements IServiceContainer {
  private services = new Map<string | symbol, () => unknown>()
  private instances = new Map<string | symbol, unknown>()

  register<T>(id: ServiceIdentifier<T>, factory: () => T): void {
    const key = this.getKey(id)
    this.services.set(key, factory as () => unknown)
    this.instances.delete(key)
  }

  registerInstance<T>(id: ServiceIdentifier<T>, instance: T): void {
    const key = this.getKey(id)
    this.instances.set(key, instance)
    this.services.delete(key)
  }

  resolve<T>(id: ServiceIdentifier<T>): T {
    const key = this.getKey(id)

    if (this.instances.has(key)) {
      return this.instances.get(key) as T
    }

    const factory = this.services.get(key)
    if (!factory) {
      throw new Error(`Service not registered: ${String(id)}`)
    }

    const instance = factory()
    this.instances.set(key, instance)
    return instance as T
  }

  has<T>(id: ServiceIdentifier<T>): boolean {
    const key = this.getKey(id)
    return this.instances.has(key) || this.services.has(key)
  }

  clear(): void {
    this.services.clear()
    this.instances.clear()
  }

  private getKey<T>(id: ServiceIdentifier<T>): string | symbol {
    return typeof id === 'function' ? id.name : id
  }
}

export const container = new ServiceContainer()

export function createContainer(): IServiceContainer {
  return new ServiceContainer()
}
