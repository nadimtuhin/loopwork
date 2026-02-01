import type { CliType, ICliStrategy, ICliStrategyRegistry, ILogger } from '@loopwork-ai/contracts'
import { ClaudeStrategy } from './claude-strategy'
import { OpenCodeStrategy } from './opencode-strategy'
import { GeminiStrategy } from './gemini-strategy'
import { DroidStrategy } from './droid-strategy'
import { CrushStrategy } from './crush-strategy'
import { KimiStrategy } from './kimi-strategy'
import { KilocodeStrategy } from './kilocode-strategy'

export class CliStrategyRegistry implements ICliStrategyRegistry {
  private strategies = new Map<CliType, ICliStrategy>()

  register(strategy: ICliStrategy): void {
    this.strategies.set(strategy.cliType, strategy)
  }

  get(cliType: CliType): ICliStrategy {
    const strategy = this.strategies.get(cliType)
    if (!strategy) {
      throw new Error(`No strategy registered for CLI type: ${cliType}`)
    }
    return strategy
  }

  has(cliType: CliType): boolean {
    return this.strategies.has(cliType)
  }

  getRegisteredTypes(): CliType[] {
    return Array.from(this.strategies.keys())
  }
}

export function createDefaultRegistry(logger?: ILogger): CliStrategyRegistry {
  const registry = new CliStrategyRegistry()
  registry.register(new ClaudeStrategy())
  registry.register(new OpenCodeStrategy(logger))
  registry.register(new GeminiStrategy())
  registry.register(new DroidStrategy())
  registry.register(new CrushStrategy())
  registry.register(new KimiStrategy())
  registry.register(new KilocodeStrategy())
  return registry
}
