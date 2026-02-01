/**
 * Dynamic Plugin Loader
 */

import type { ConfigWrapper, LoopworkConfig } from '../contracts'

/**
 * Configuration options for dynamic plugins
 */
export interface DynamicPluginsOptions {
  /** List of plugin paths or package names to load */
  plugins: string[]
}

/**
 * Configure dynamic plugins to load at runtime
 * 
 * @example
 * export default compose(
 *   withDynamicPlugins(['@loopwork-ai/plugin-metrics', './local-plugin'])
 * )(defineConfig({...}))
 */
export function withDynamicPlugins(pluginsOrOptions: string[] | DynamicPluginsOptions): ConfigWrapper {
  return (config: LoopworkConfig) => {
    const plugins = Array.isArray(pluginsOrOptions) ? pluginsOrOptions : pluginsOrOptions.plugins
    
    return {
      ...config,
      dynamicPlugins: [
        ...(config.dynamicPlugins || []),
        ...plugins
      ]
    }
  }
}
