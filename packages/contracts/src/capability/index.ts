export interface ICapabilityRegistry {
  register(pluginName: string, capabilities: any): void
  getPromptInjection(): string
  getCommands(): any[]
  getSkills(): any[]
  getPluginCapabilities(pluginName: string): any | undefined
}
