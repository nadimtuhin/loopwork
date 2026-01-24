import { 
  BackendPlugin, 
  LoopworkConfig
} from 'loopwork/contracts'
import { NotionBackendConfig } from './types'
import { NotionTaskAdapter } from './adapter'

export function createNotionBackendPlugin(config: NotionBackendConfig): BackendPlugin {
  return new NotionTaskAdapter(config)
}

export function withNotionBackend(config: NotionBackendConfig) {
  return (baseConfig: LoopworkConfig): LoopworkConfig => ({
    ...baseConfig,
    backend: {
      type: 'notion',
      ...config,
    } as any,
    plugins: [...(baseConfig.plugins || []), createNotionBackendPlugin(config)],
  })
}
