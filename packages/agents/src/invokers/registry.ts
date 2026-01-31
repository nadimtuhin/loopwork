import type { ICliInvoker, ICliInvokerRegistry } from '../contracts/invoker'
import { stripModelPrefix } from './base-invoker'

export class CliInvokerRegistry implements ICliInvokerRegistry {
  private invokers = new Map<string, ICliInvoker>()
  private modelToInvoker = new Map<string, string>()
  private defaultInvoker?: string

  register(invoker: ICliInvoker): void {
    this.invokers.set(invoker.name, invoker)

    // Index models to invoker
    for (const model of invoker.getSupportedModels()) {
      if (!this.modelToInvoker.has(model)) {
        this.modelToInvoker.set(model, invoker.name)
      }
    }
  }

  get(name: string): ICliInvoker | undefined {
    return this.invokers.get(name)
  }

  getForModel(model: string): ICliInvoker | undefined {
    // First try exact match
    let invokerName = this.modelToInvoker.get(model)
    if (invokerName) {
      return this.invokers.get(invokerName)
    }

    // Try with prefix stripped (e.g., "google/gemini-3-flash" → "gemini-3-flash")
    const strippedModel = stripModelPrefix(model)
    if (strippedModel !== model) {
      invokerName = this.modelToInvoker.get(strippedModel)
      if (invokerName) {
        return this.invokers.get(invokerName)
      }
    }

    return undefined
  }

  getDefault(): ICliInvoker | undefined {
    if (this.defaultInvoker) {
      return this.invokers.get(this.defaultInvoker)
    }
    return undefined
  }

  setDefault(name: string): void {
    if (!this.invokers.has(name)) {
      throw new Error(`Invoker "${name}" not registered`)
    }
    this.defaultInvoker = name
  }

  list(): readonly ICliInvoker[] {
    return Array.from(this.invokers.values())
  }

  async findAvailable(): Promise<ICliInvoker | undefined> {
    for (const invoker of this.invokers.values()) {
      if (await invoker.isAvailable()) {
        return invoker
      }
    }
    return undefined
  }
}
