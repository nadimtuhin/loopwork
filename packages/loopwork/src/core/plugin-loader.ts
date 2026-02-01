import path from 'path'
import { LoopworkError } from './errors'
import { logger } from './utils'
import type { LoopworkPlugin } from '../contracts/plugin'

/**
 * Load plugins dynamically from paths or package names
 */
export async function loadDynamicPlugins(
  pluginNames: string[],
  projectRoot: string
): Promise<LoopworkPlugin[]> {
  const loadedPlugins: LoopworkPlugin[] = []

  for (const name of pluginNames) {
    try {
      logger.debug(`Loading dynamic plugin: ${name}`)
      
      let pluginPath = name
      
      // Resolve relative paths
      if (name.startsWith('.') || name.startsWith('/')) {
        pluginPath = path.resolve(projectRoot, name)
      }

      // Dynamic import
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const module = await import(pluginPath) as any
      
      // Handle default export
      const pluginFactory = module.default || module

      let plugin: LoopworkPlugin

      if (typeof pluginFactory === 'function') {
        // execute factory
        plugin = await pluginFactory()
      } else if (typeof pluginFactory === 'object' && pluginFactory !== null) {
        plugin = pluginFactory
      } else {
        throw new Error(`Plugin ${name} does not export a function or object`)
      }

      // Validate plugin interface
      if (!plugin.name) {
        throw new Error(`Plugin ${name} is missing 'name' property`)
      }

      loadedPlugins.push(plugin)
      logger.debug(`Loaded dynamic plugin: ${plugin.name}`)
    } catch (error) {
      throw new LoopworkError(
        'ERR_PLUGIN_LOAD',
        `Failed to load dynamic plugin: ${name}`,
        [
          `Error: ${error instanceof Error ? error.message : String(error)}`,
          'Check that the plugin is installed or the path is correct',
          'Ensure the plugin exports a valid LoopworkPlugin or factory function'
        ]
      )
    }
  }

  return loadedPlugins
}
