export interface IPluginRegistry {
  runHook(hookName: string, data: any): Promise<void>
  getCapabilityRegistry(): import('../capability').ICapabilityRegistry
  isDegradedMode(flags?: { [key: string]: boolean | undefined }): boolean
  getDisabledPluginsReport(): Array<{ name: string; reason: 'auto-disabled' | 'manually-disabled' }>
  getActivePluginsReport(): Array<{ name: string; classification: 'critical' | 'enhancement'; requiresNetwork: boolean }>
  getDisabledPlugins(): string[]
}

export interface LoopworkPlugin {
  readonly name: string
  readonly classification?: 'critical' | 'enhancement'
  [key: string]: any
}
