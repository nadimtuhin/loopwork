import type { ModelConfig, CliType } from './executor/types'

export type { ModelConfig, CliType, ModelSelectionStrategy } from './executor/types'

export type IModelDefinition = ModelConfig

export interface IModelRegistry {
  register(definition: IModelDefinition): void
  get(name: string): IModelDefinition | undefined
  has(name: string): boolean
  list(): readonly IModelDefinition[]
  getModelString(name: string): string | undefined
  getCli(name: string): CliType | undefined
  unregister?(name: string): boolean
  clear?(): void
}

export type ModelPreset = (overrides?: Partial<IModelDefinition>) => IModelDefinition

export interface ModelPresets {
  geminiFlash: ModelPreset
  geminiPro: ModelPreset
  claudeSonnet: ModelPreset
  claudeOpus: ModelPreset
  claudeHaiku: ModelPreset
  gpt4o?: ModelPreset
  gpt4Turbo?: ModelPreset
  [key: string]: ModelPreset | undefined
}

export interface ModelRegistryStats {
  totalModels: number
  enabledModels: number
  modelsByCli: Record<CliType, number>
  averageCostWeight?: number
}
